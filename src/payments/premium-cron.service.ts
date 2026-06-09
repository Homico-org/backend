import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

/**
 * Premium subscription lifecycle. `grantPremium` sets `isPremium = true` +
 * `premiumExpiresAt` on payment, but nothing reset it - so premium was a
 * lifetime perk sold at a subscription price. This service makes it a real
 * subscription: it expires lapsed pros (removing the badge + ranking boost)
 * and nudges them to renew.
 */
@Injectable()
export class PremiumCronService {
  private readonly logger = new Logger(PremiumCronService.name);
  // Warn pros this many days before their premium lapses.
  private readonly REMIND_DAYS_BEFORE = 3;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Authoritative expiry. Runs hourly so a lapsed pro loses the badge + top
   * placement within an hour (the profile's read-time guard makes it instant
   * there). The query is indexed on { isPremium, premiumExpiresAt }.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'premium-expire' })
  async expireSubscriptions(): Promise<number> {
    const now = new Date();
    const expired = await this.userModel
      .find({ isPremium: true, premiumExpiresAt: { $lt: now } })
      .select('_id')
      .lean<{ _id: unknown }[]>()
      .exec();
    if (!expired.length) return 0;

    const ids = expired.map((u) => u._id);
    await this.userModel.updateMany(
      { _id: { $in: ids } },
      { $set: { isPremium: false, premiumTier: 'none' } },
    );

    for (const id of ids) {
      try {
        await this.notificationsService.notify(
          String(id),
          NotificationType.PREMIUM_EXPIRED,
          'Premium expired',
          'Renew to get your Premium badge and top placement back.',
          { link: '/pro/premium' },
        );
      } catch (e) {
        this.logger.warn(`premium-expired notify failed for ${String(id)}: ${e}`);
      }
    }
    this.logger.log(`Expired premium for ${ids.length} pro(s)`);
    return ids.length;
  }

  /**
   * "Expiring soon" renewal nudge - once per paid period. Deduped via
   * `premiumRenewalRemindedAt`, which `grantPremium` clears on each renewal so
   * the next period gets a fresh reminder.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'premium-renewal-reminder' })
  async remindExpiringSoon(): Promise<number> {
    const now = new Date();
    const soon = new Date(
      now.getTime() + this.REMIND_DAYS_BEFORE * 24 * 60 * 60 * 1000,
    );
    const expiring = await this.userModel
      .find({
        isPremium: true,
        premiumExpiresAt: { $gt: now, $lte: soon },
        premiumRenewalRemindedAt: { $exists: false },
      })
      .select('_id')
      .lean<{ _id: unknown }[]>()
      .exec();
    if (!expiring.length) return 0;

    const ids = expiring.map((u) => u._id);
    await this.userModel.updateMany(
      { _id: { $in: ids } },
      { $set: { premiumRenewalRemindedAt: now } },
    );

    for (const id of ids) {
      try {
        await this.notificationsService.notify(
          String(id),
          NotificationType.PREMIUM_EXPIRING,
          'Premium expiring soon',
          'Renew to keep your Premium badge and top placement.',
          { link: '/pro/premium' },
        );
      } catch (e) {
        this.logger.warn(`premium-expiring notify failed for ${String(id)}: ${e}`);
      }
    }
    this.logger.log(`Sent premium renewal reminder to ${ids.length} pro(s)`);
    return ids.length;
  }
}
