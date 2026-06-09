import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/schemas/notification.schema";
import {
  ProStatus,
  SlaMissType,
  SlaPenaltyLevel,
  User,
} from "../users/schemas/user.schema";
import {
  SLA_DEMOTION_DAYS,
  SLA_MISSES_HISTORY_CAP,
  SLA_PAUSE_HOURS,
  SLA_WINDOW_DAYS,
  isEnforcementEnabled,
} from "./constants";
import { isWithinWorkingHours } from "./utils/working-hours";

/**
 * SlaService — central place that records pro response-time misses
 * and applies the gentle-ramp penalty ladder:
 *
 *   1st miss in 14 days  -> warning notification (no functional change)
 *   2nd miss in 14 days  -> ranking demotion for 7 days
 *   3rd+ miss in 14 days -> profile paused for 48 hours
 *
 * The whole ladder gates behind `isEnforcementEnabled()` so Phase A
 * can ship with detection-only (cron writes log lines + sentinel
 * notifications to admin) while we validate the detection accuracy
 * before any pro is actually penalised.
 *
 * Exemptions checked on every recordMiss call:
 *   - Pro toggled `status === 'away'`
 *   - Pro already has `isProfileDeactivated`
 *   - Trigger fell outside the pro's working schedule
 * Any of those: silently no-op (returns null, logs a debug line).
 *
 * The decision deliberately keeps everything on the User document so
 * we don't introduce a new collection just for misses - the slaMisses
 * array is capped at 30 entries which fits comfortably in a document.
 */
@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Record a missed-deadline event for a pro. Caller (the cron) is
   * responsible for ensuring it hasn't already recorded a miss for
   * the same event (via per-event latch flags like
   * Booking.slaMissRecorded). This method does NOT dedupe by
   * eventId - it trusts the caller.
   */
  async recordMiss(
    userId: string,
    type: SlaMissType,
    event: { model: string; id: string; triggeredAt: Date },
  ): Promise<{
    skipped: boolean;
    reason?: string;
    severityApplied?: "warning" | "demoted" | "paused";
  }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      this.logger.warn(`recordMiss: user ${userId} not found`);
      return { skipped: true, reason: "user-not-found" };
    }

    // Exemption gates - any positive means we silently no-op so the
    // pro isn't punished for being explicitly Away, already paused,
    // or busy outside their advertised working hours.
    if (user.status === ProStatus.AWAY) {
      this.logger.debug(`recordMiss: skipped (away) user=${userId} type=${type}`);
      return { skipped: true, reason: "status-away" };
    }
    if (user.isProfileDeactivated) {
      this.logger.debug(
        `recordMiss: skipped (already paused) user=${userId} type=${type}`,
      );
      return { skipped: true, reason: "already-paused" };
    }
    if (!isWithinWorkingHours(user, event.triggeredAt)) {
      this.logger.debug(
        `recordMiss: skipped (outside working hours) user=${userId} type=${type}`,
      );
      return { skipped: true, reason: "outside-working-hours" };
    }

    // Compute current penalty severity based on misses in the trailing
    // 14-day window. We snapshot BEFORE pushing the new miss so the
    // pre-existing count tells us which step of the ladder this miss
    // promotes us to.
    const windowStart = new Date(Date.now() - SLA_WINDOW_DAYS * 86400000);
    const recentMisses = (user.slaMisses || []).filter(
      (m) => m.missedAt && m.missedAt >= windowStart,
    );
    const missCount = recentMisses.length + 1; // include the new one

    let severityApplied: "warning" | "demoted" | "paused";
    if (missCount === 1) severityApplied = "warning";
    else if (missCount === 2) severityApplied = "demoted";
    else severityApplied = "paused";

    // Enforcement gate. When OFF (Phase A default), we still RECORD
    // the miss to the log array so we can later compute "what would
    // have happened" stats, but we DON'T apply user-state changes.
    if (!isEnforcementEnabled()) {
      this.logger.log(
        `[SLA detect-only] user=${userId} type=${type} count=${missCount} would-apply=${severityApplied} event=${event.model}:${event.id}`,
      );
      // Still append to slaMisses so the dashboard can show misses
      // accruing during the dark-launch period. severityApplied
      // recorded as if it had been applied.
      await this.appendMiss(user, type, event, severityApplied);
      return { skipped: false, severityApplied };
    }

    // Enforcement ON: apply the actual penalty + emit a notification.
    await this.applyPenalty(user, severityApplied);
    await this.appendMiss(user, type, event, severityApplied);
    await this.sendPenaltyNotification(user, severityApplied);

    return { skipped: false, severityApplied };
  }

  private async appendMiss(
    user: User,
    type: SlaMissType,
    event: { model: string; id: string; triggeredAt: Date },
    severityApplied: "warning" | "demoted" | "paused",
  ): Promise<void> {
    const next = [
      ...(user.slaMisses || []),
      {
        type,
        eventModel: event.model,
        eventId: event.id,
        missedAt: new Date(),
        severityApplied,
      },
    ];
    // Cap to recent history so the document doesn't grow unboundedly.
    const trimmed = next.slice(-SLA_MISSES_HISTORY_CAP);
    user.slaMisses = trimmed as User["slaMisses"];
    await user.save();
  }

  private async applyPenalty(
    user: User,
    severity: "warning" | "demoted" | "paused",
  ): Promise<void> {
    if (severity === "warning") {
      user.slaPenaltyLevel = SlaPenaltyLevel.WARNING;
    } else if (severity === "demoted") {
      user.slaPenaltyLevel = SlaPenaltyLevel.DEMOTED;
      user.slaDemotedUntil = new Date(
        Date.now() + SLA_DEMOTION_DAYS * 86400000,
      );
    } else {
      // paused
      user.slaPenaltyLevel = SlaPenaltyLevel.PAUSED;
      user.isProfileDeactivated = true;
      user.deactivatedAt = new Date();
      user.deactivatedUntil = new Date(
        Date.now() + SLA_PAUSE_HOURS * 60 * 60 * 1000,
      );
      user.deactivationReason = "sla_breach";
    }
    await user.save();
  }

  /**
   * Recovery sweep. Pros whose penalty level is non-none but who have
   * either (a) no recent misses in the trailing window, or (b) all
   * their time-bound penalty fields have auto-expired, should be
   * cleared back to NONE and notified that they recovered.
   *
   * Without this, `slaPenaltyLevel` is one-directional - a pro who
   * got a warning 14 days ago would carry the 'warning' label forever
   * and the dashboard banner would never clear. The cron calls this
   * each tick after the booking scan.
   *
   * Recovery rules:
   *   - WARNING  -> NONE when 0 misses in last 14d
   *   - DEMOTED  -> NONE when slaDemotedUntil is in the past
   *                 (the misses ARE still in the window during the 7
   *                 demotion days, so we trust the explicit expiry)
   *   - PAUSED   -> NONE when deactivatedUntil is in the past AND
   *                 deactivationReason is 'sla_breach'
   *                 (we don't touch manually-paused pros)
   *
   * On any transition: clears the level, frees the explicit fields,
   * emits SLA_RECOVERED notification.
   */
  async recoverEligible(): Promise<{ recoveredCount: number }> {
    if (!isEnforcementEnabled()) {
      // Detect-only mode never applied penalties, so there's nothing
      // to recover from on the user record. We still log so the
      // operator can see the recovery sweep ran.
      this.logger.debug("recoverEligible: skipped (enforcement OFF)");
      return { recoveredCount: 0 };
    }

    const now = new Date();
    const windowStart = new Date(Date.now() - SLA_WINDOW_DAYS * 86400000);

    const candidates = await this.userModel.find({
      slaPenaltyLevel: { $ne: SlaPenaltyLevel.NONE, $exists: true },
    });

    let recoveredCount = 0;
    for (const user of candidates) {
      try {
        const recent = (user.slaMisses || []).filter(
          (m) => m.missedAt && m.missedAt >= windowStart,
        );
        const level = user.slaPenaltyLevel;

        let shouldRecover = false;
        if (level === SlaPenaltyLevel.WARNING) {
          shouldRecover = recent.length === 0;
        } else if (level === SlaPenaltyLevel.DEMOTED) {
          shouldRecover = !!user.slaDemotedUntil && user.slaDemotedUntil <= now;
        } else if (level === SlaPenaltyLevel.PAUSED) {
          shouldRecover =
            !!user.deactivatedUntil &&
            user.deactivatedUntil <= now &&
            user.deactivationReason === "sla_breach";
        }

        if (!shouldRecover) continue;

        // Reset state. For PAUSED we also reactivate the profile
        // because the pause was SLA-driven (the user didn't choose
        // it, so we shouldn't leave them hidden once the timer is up).
        user.slaPenaltyLevel = SlaPenaltyLevel.NONE;
        user.slaDemotedUntil = undefined;
        if (level === SlaPenaltyLevel.PAUSED) {
          user.isProfileDeactivated = false;
          user.deactivatedAt = undefined;
          user.deactivatedUntil = undefined;
          user.deactivationReason = undefined;
        }
        await user.save();

        await this.notificationsService.notify(
          (user._id as { toString(): string }).toString(),
          NotificationType.SLA_RECOVERED,
          "You're back to normal status",
          "Thanks for staying responsive. Your profile is fully restored.",
          {
            i18n: {
              titleKey: "sla.recoveredTitle",
              messageKey: "sla.recoveredBody",
            },
          },
        );
        recoveredCount++;
      } catch (err) {
        this.logger.error(
          `recoverEligible: failed for user ${user._id}: ${(err as Error).message}`,
        );
      }
    }

    if (recoveredCount > 0) {
      this.logger.log(`recoverEligible: restored ${recoveredCount} pros`);
    }
    return { recoveredCount };
  }

  private async sendPenaltyNotification(
    user: User,
    severity: "warning" | "demoted" | "paused",
  ): Promise<void> {
    const userId = (user._id as { toString(): string }).toString();
    if (severity === "warning") {
      await this.notificationsService.notify(
        userId,
        NotificationType.SLA_WARNING,
        "Response time warning",
        "You missed a response deadline. Please reply faster to avoid demotion.",
        {
          i18n: { titleKey: "sla.warningTitle", messageKey: "sla.warningBody" },
        },
      );
    } else if (severity === "demoted") {
      const until = user.slaDemotedUntil?.toISOString().slice(0, 10) ?? "";
      await this.notificationsService.notify(
        userId,
        NotificationType.SLA_DEMOTED,
        "Profile demoted in search",
        `Your profile is ranked lower in search until ${until}.`,
        {
          i18n: {
            titleKey: "sla.demotedTitle",
            messageKey: "sla.demotedBody",
            params: { date: until },
          },
        },
      );
    } else {
      const until = user.deactivatedUntil?.toISOString().slice(0, 10) ?? "";
      await this.notificationsService.notify(
        userId,
        NotificationType.SLA_PAUSED,
        "Profile paused",
        `Your profile is paused until ${until}.`,
        {
          i18n: {
            titleKey: "sla.pausedTitle",
            messageKey: "sla.pausedBody",
            params: { date: until },
          },
        },
      );
    }
  }
}
