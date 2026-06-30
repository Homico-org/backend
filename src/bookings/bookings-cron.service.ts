import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './schemas/booking.schema';

/**
 * Scheduled jobs that move bookings forward when humans don't:
 *
 *   - Auto-confirm completion after the client's 48h window expires.
 *     Escrow moves to PENDING_RELEASE so the pro gets paid.
 *
 *   - Auto-cancel AWAITING_PAYMENT bookings older than 15 minutes.
 *     Frees the slot for other clients.
 *
 *   - Ping the client when a CONFIRMED booking's scheduled time passed
 *     by 30+ min without the pro pressing "Start work". Doesn't dispute
 *     automatically - the client decides to report or not.
 *
 * Cron cadence is conservative for Phase 1 (every 5 min). At scale we
 * may want to lean on Mongo change-streams + setTimeout to fire exactly
 * at the boundary, but the polling approach is simpler and resilient to
 * server restarts.
 *
 * All jobs are best-effort: failures log + continue to the next item.
 * No batch-wide rollback.
 */
@Injectable()
export class BookingsCronService {
  private readonly logger = new Logger(BookingsCronService.name);

  // Window after which an AWAITING_CLIENT_CONFIRMATION booking auto-completes.
  private readonly AUTO_CONFIRM_AFTER_HOURS = 48;
  // Window after which an unpaid AWAITING_PAYMENT booking is cancelled.
  // Configurable via PAYMENT_TIMEOUT_MIN (default 15); bump it locally when a
  // slow sandbox/debug cycle keeps timing out the booking before you pay.
  private readonly PAYMENT_TIMEOUT_MIN: number;

  constructor(
    @InjectModel(Booking.name) private readonly bookingModel: Model<Booking>,
    private readonly bookingsService: BookingsService,
    private readonly configService: ConfigService,
  ) {
    const raw = Number(
      this.configService.get<string>('PAYMENT_TIMEOUT_MIN'),
    );
    this.PAYMENT_TIMEOUT_MIN = Number.isFinite(raw) && raw > 0 ? raw : 15;
  }

  /**
   * Auto-confirm completed bookings whose 48h client-review window expired.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'bookings-auto-confirm' })
  async autoConfirmExpired() {
    const cutoff = new Date(
      Date.now() - this.AUTO_CONFIRM_AFTER_HOURS * 60 * 60 * 1000,
    );
    const candidates = await this.bookingModel
      .find({
        status: BookingStatus.AWAITING_CLIENT_CONFIRMATION,
        completedAt: { $lte: cutoff },
      })
      .select('_id')
      .lean<{ _id: { toString(): string } }[]>()
      .exec();

    if (candidates.length === 0) return;
    this.logger.log(`Auto-confirming ${candidates.length} expired bookings`);

    for (const c of candidates) {
      try {
        await this.bookingsService.autoConfirm(c._id.toString());
      } catch (err) {
        this.logger.warn(
          `Auto-confirm failed for ${c._id}: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Cancel AWAITING_PAYMENT bookings older than 15 min - the payment
   * window expired. Frees the slot for other clients to book.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'bookings-cancel-stale-payment' })
  async cancelStalePayment() {
    const cutoff = new Date(Date.now() - this.PAYMENT_TIMEOUT_MIN * 60 * 1000);
    const candidates = await this.bookingModel
      .find({
        status: BookingStatus.AWAITING_PAYMENT,
        createdAt: { $lte: cutoff },
      })
      .select('_id')
      .lean<{ _id: { toString(): string } }[]>()
      .exec();

    if (candidates.length > 0) {
      this.logger.log(
        `Cancelling ${candidates.length} stale AWAITING_PAYMENT bookings`,
      );
      for (const c of candidates) {
        try {
          await this.bookingsService.autoCancelStalePayment(c._id.toString());
        } catch (err) {
          this.logger.warn(
            `Auto-cancel failed for ${c._id}: ${(err as Error).message}`,
          );
        }
      }
    }

    // Always sweep for bookings cancelled by a *previous* run whose payment has
    // since settled (e.g. the client paid late, or the webhook landed after the
    // timeout) - auto-refund them so money never stays `held` on a dead booking.
    try {
      const refunded = await this.bookingsService.sweepLatePaidCancellations();
      if (refunded > 0) {
        this.logger.warn(
          `Auto-refunded ${refunded} late payment(s) on already-cancelled bookings`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `sweepLatePaidCancellations failed: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Ping clients on bookings where the pro might not have shown. Runs
   * every 5 minutes to catch the 30-min mark within ~5min window.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'bookings-no-show-ping' })
  async pingNoShows() {
    try {
      const count = await this.bookingsService.pingClientsForPotentialNoShows();
      if (count > 0) {
        this.logger.log(`Sent no-show pings for ${count} bookings`);
      }
    } catch (err) {
      this.logger.warn(`No-show ping cycle failed: ${(err as Error).message}`);
    }
  }
}
