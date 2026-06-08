import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserBadge } from './schemas/user-badge.schema';
import { Review } from '../review/schemas/review.schema';
import { User } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { BADGE_REGISTRY, getBadge } from './badges.registry';
import { BadgeContext, BadgeDefinition, BadgeTrigger } from './badges.types';

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    @InjectModel(UserBadge.name) private userBadgeModel: Model<UserBadge>,
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Re-evaluate every badge listening to one of `triggers` for this user, and
   * award the ones whose condition now holds. Idempotent and self-contained:
   * failures are swallowed (logged) so badge logic can never break the host
   * action (creating a review, completing a booking, ...).
   */
  async evaluate(
    userId: string,
    triggers: BadgeTrigger[],
    opts: { notify?: boolean } = {},
  ): Promise<void> {
    if (!userId) return;
    const notify = opts.notify !== false; // notify by default; backfill opts out

    const candidates = BADGE_REGISTRY.filter((b) =>
      b.triggers.some((t) => triggers.includes(t)),
    );
    if (candidates.length === 0) return;

    // Skip badges already owned to avoid useless condition queries.
    const owned = new Set(
      (
        await this.userBadgeModel.find({ userId }).select('badgeKey').lean()
      ).map((d) => d.badgeKey),
    );

    const ctx = this.buildContext(userId, triggers[0]);

    for (const badge of candidates) {
      if (owned.has(badge.key)) continue;
      try {
        if (await badge.condition(ctx)) {
          await this.award(userId, badge, notify);
        }
      } catch (err) {
        this.logger.error(
          `Badge eval failed (${badge.key}, user ${userId}): ${err}`,
        );
      }
    }
  }

  /** Every trigger — used by the backfill to evaluate all badges at once. */
  static readonly ALL_TRIGGERS: BadgeTrigger[] = [
    'review.created',
    'booking.completed',
    'profile.updated',
  ];

  private buildContext(userId: string, trigger: BadgeTrigger): BadgeContext {
    return {
      userId,
      trigger,
      reviewsAuthoredCount: () =>
        this.reviewModel.countDocuments({ clientId: userId }).exec(),
      user: () => this.userModel.findById(userId).lean().exec(),
    };
  }

  /** Insert the badge (idempotent via unique index) and notify on first unlock. */
  private async award(
    userId: string,
    badge: BadgeDefinition,
    notify = true,
  ): Promise<void> {
    try {
      await this.userBadgeModel.create({ userId, badgeKey: badge.key });
    } catch (err: any) {
      // Duplicate key = already unlocked (possibly concurrently). Nothing to do.
      if (err?.code === 11000) return;
      throw err;
    }

    this.logger.log(`Badge unlocked: ${badge.key} for user ${userId}`);

    if (!notify) return;

    try {
      await this.notificationsService.notify(
        userId,
        NotificationType.BADGE_UNLOCKED,
        'Badge unlocked',
        'You unlocked a new badge',
        {
          referenceId: badge.key,
          referenceModel: 'Badge',
          metadata: { badgeKey: badge.key, icon: badge.icon },
          i18n: {
            titleKey: 'badges.notification.title',
            // Reuse the badge's own title as the notification body.
            messageKey: badge.titleKey,
          },
        },
      );
    } catch (err) {
      this.logger.error(`Badge notify failed (${badge.key}): ${err}`);
    }
  }

  /** Badges a user has unlocked, enriched with registry metadata for display. */
  async getUserBadges(userId: string) {
    const unlocked = await this.userBadgeModel
      .find({ userId })
      .sort({ unlockedAt: -1 })
      .lean();

    return unlocked
      .map((ub) => {
        const def = getBadge(ub.badgeKey);
        if (!def) return null; // badge removed from registry — hide it
        return {
          key: def.key,
          icon: def.icon,
          titleKey: def.titleKey,
          descKey: def.descKey,
          audience: def.audience,
          unlockedAt: ub.unlockedAt,
        };
      })
      .filter(Boolean);
  }

  /** Full catalog of defined badges (no user state). */
  getCatalog() {
    return BADGE_REGISTRY.map((b) => ({
      key: b.key,
      icon: b.icon,
      titleKey: b.titleKey,
      descKey: b.descKey,
      audience: b.audience,
    }));
  }
}
