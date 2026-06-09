import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Model } from "mongoose";
import {
  Booking,
  BookingStatus,
} from "../bookings/schemas/booking.schema";
import {
  ProjectStage,
  ProjectTracking,
} from "../jobs/schemas/project-tracking.schema";
import { SlaMissType } from "../users/schemas/user.schema";
import {
  SLA_BOOKING_ACCEPT_MIN,
  SLA_CHAT_REPLY_MIN,
  getFeatureLaunchDate,
} from "./constants";
import { SlaService } from "./sla.service";

/**
 * Periodic scanners that detect SLA misses and feed them into
 * `SlaService.recordMiss()`. Cadence + general shape mirrors
 * `BookingsCronService` - every 5 min, log + continue on per-item
 * failure, no batch-wide rollback.
 *
 * Phase A ships with ONE scanner active: booking accept/decline.
 * Chat-reply and direct-invite scanners are scaffolded as TODOs so
 * the module shape is in place, but the actual scans are added in
 * Phase A.2 once we've validated the booking scanner's accuracy on
 * real traffic.
 *
 * IMPORTANT: a single Render web service runs this cron. If we ever
 * horizontal-scale, the polling pattern would double-fire on each
 * tick - we'd need to switch to a leader-elected worker or move to
 * BullMQ with distributed locking. The plan doc tracks this as a
 * known limit.
 */
@Injectable()
export class SlaCronService {
  private readonly logger = new Logger(SlaCronService.name);

  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    @InjectModel(ProjectTracking.name)
    private readonly projectTrackingModel: Model<ProjectTracking>,
    private readonly slaService: SlaService,
  ) {}

  /**
   * SCAN 1: Bookings that have sat in PENDING (paid, awaiting pro
   * confirmation) longer than the accept SLA. Triggered every 5 min.
   *
   * Latch: `Booking.slaMissRecorded` flag prevents double-firing on
   * subsequent ticks. Set to true after the first miss for that
   * booking, regardless of whether the pro eventually responds.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: "sla-scan-bookings" })
  async scanBookings(): Promise<void> {
    const cutoff = new Date(Date.now() - SLA_BOOKING_ACCEPT_MIN * 60 * 1000);
    const launchDate = getFeatureLaunchDate();

    const query: Record<string, unknown> = {
      status: BookingStatus.PENDING,
      pendingSince: { $exists: true, $lte: cutoff },
      slaMissRecorded: { $ne: true },
    };
    // Avoid retroactive penalties for bookings paid before launch.
    if (launchDate) {
      query.pendingSince = { $exists: true, $lte: cutoff, $gte: launchDate };
    }

    const candidates = await this.bookingModel
      .find(query)
      .select({ _id: 1, professional: 1, pendingSince: 1 })
      .lean();

    if (candidates.length === 0) return;
    this.logger.log(`scanBookings: found ${candidates.length} candidate misses`);

    for (const b of candidates) {
      try {
        await this.slaService.recordMiss(
          b.professional.toString(),
          SlaMissType.BOOKING_ACCEPT,
          {
            model: "Booking",
            id: b._id.toString(),
            triggeredAt: b.pendingSince ?? new Date(),
          },
        );
        // Latch flag regardless of skip-reason - the pro had their
        // chance and either way we don't want to re-evaluate this
        // exact booking on the next tick. (A new booking from the
        // same client starts a fresh timer.)
        await this.bookingModel.updateOne(
          { _id: b._id },
          { $set: { slaMissRecorded: true } },
        );
      } catch (err) {
        this.logger.error(
          `scanBookings: failed for booking ${b._id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Recovery sweep. Runs alongside the booking scan so the same 5-min
   * cadence covers both "did anyone miss?" and "did anyone recover?".
   * Logs are quiet on no-ops; only the count is surfaced on positive
   * recoveries via SlaService.recoverEligible.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: "sla-sweep-recovery" })
  async sweepRecovery(): Promise<void> {
    try {
      await this.slaService.recoverEligible();
    } catch (err) {
      this.logger.error(
        `sweepRecovery: ${(err as Error).message}`,
      );
    }
  }

  /**
   * SCAN 2: project chats where the newest comment is from the
   * client and older than SLA_CHAT_REPLY_MIN. The pro is on the
   * hook to reply once the project is hired - leaving a client
   * waiting is the loudest signal that a pro has gone dark.
   *
   * Latch: `ProjectTracking.lastChatSlaMissAt` stores the createdAt
   * of the most-recent tail we already counted. A NEW client message
   * (newer createdAt) re-opens the window. Pro replies naturally
   * end the run because the tail flips to a pro message.
   *
   * Filter on `currentStage != completed` so we don't penalise pros
   * for not replying after the project closed (the client could be
   * leaving a "thanks!" message that doesn't warrant a reply).
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: "sla-scan-chats" })
  async scanChats(): Promise<void> {
    const cutoff = new Date(Date.now() - SLA_CHAT_REPLY_MIN * 60 * 1000);
    const launchDate = getFeatureLaunchDate();

    // Fetch active projects with at least one comment. We could
    // prefilter more aggressively with an aggregation pipeline that
    // reads the tail, but on the current marketplace volume a simple
    // find + per-doc inspection is fine and far easier to reason
    // about. Switch to aggregation if this gets hot.
    const projects = await this.projectTrackingModel
      .find({
        currentStage: { $ne: ProjectStage.COMPLETED },
        "comments.0": { $exists: true },
      })
      .select({ _id: 1, proId: 1, comments: 1, lastChatSlaMissAt: 1 })
      .lean();

    let recorded = 0;
    for (const p of projects) {
      try {
        const comments = p.comments || [];
        if (comments.length === 0) continue;
        const tail = comments[comments.length - 1];
        if (tail.userRole !== "client") continue;
        if (!tail.createdAt) continue;
        const tailCreatedAt = new Date(tail.createdAt);
        if (tailCreatedAt > cutoff) continue;
        if (launchDate && tailCreatedAt < launchDate) continue;
        if (
          p.lastChatSlaMissAt &&
          new Date(p.lastChatSlaMissAt) >= tailCreatedAt
        ) {
          continue; // already recorded a miss for this tail
        }

        await this.slaService.recordMiss(
          p.proId.toString(),
          SlaMissType.CHAT_REPLY,
          {
            model: "ProjectTracking",
            id: p._id.toString(),
            triggeredAt: tailCreatedAt,
          },
        );
        // Latch regardless of skip-reason - same logic as bookings.
        // The pro had their chance for this specific tail; the next
        // client message starts a fresh evaluation.
        await this.projectTrackingModel.updateOne(
          { _id: p._id },
          { $set: { lastChatSlaMissAt: tailCreatedAt } },
        );
        recorded++;
      } catch (err) {
        this.logger.error(
          `scanChats: failed for project ${p._id}: ${(err as Error).message}`,
        );
      }
    }

    if (recorded > 0) {
      this.logger.log(`scanChats: evaluated ${recorded} unanswered tails`);
    }
  }

  //
  // TODO Phase A.2: scan direct-job invites where the pro hasn't
  // accepted/declined within SLA_DIRECT_INVITE_MIN. Need to confirm
  // the shape on Job (looking for an `invitedPros[]` subdoc) before
  // wiring this scanner.
  //
  // TODO Phase B: weekly profile-incompleteness nag cron via
  // `@Cron(CronExpression.EVERY_DAY_AT_NOON)` with per-pro 30-day
  // cooldown.
}
