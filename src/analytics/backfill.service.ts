import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsService } from './analytics.service';
import { Booking, BookingPaymentStatus, BookingStatus } from '../bookings/schemas/booking.schema';
import { Proposal, ProposalStatus } from '../jobs/schemas/proposal.schema';
import { ProjectTracking } from '../jobs/schemas/project-tracking.schema';
import { Review } from '../review/schemas/review.schema';
import { User, UserRole } from '../users/schemas/user.schema';

export interface BackfillSummary {
  bookingCreated: number;
  bookingPaymentConfirmed: number;
  bookingStarted: number;
  bookingCompleted: number;
  bookingCancelled: number;
  proposalSubmit: number;
  proposalAccepted: number;
  reviewSubmit: number;
  registerPro: number;
  registerClient: number;
  totalRowsWritten: number;
}

/**
 * One-shot historical backfill for the analytics_events collection. Walks
 * existing Bookings / Proposals / Reviews / Users and writes (event, target,
 * date, count) rows with the entity's original timestamp as the date.
 *
 * Idempotent: groups raw records by (event, target, date) into counts then
 * upserts via `$set` (NOT `$inc`) so re-runs converge to the same totals
 * rather than doubling. Safe to invoke multiple times.
 *
 * Used by the founder once after wiring the analytics dashboard - turns an
 * empty /admin/analytics view into one populated with the marketplace's
 * actual history.
 */
@Injectable()
export class BackfillService {
  private readonly logger = new Logger(BackfillService.name);

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(ProjectTracking.name) private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly analyticsService: AnalyticsService,
  ) {}

  /**
   * YYYY-MM-DD conversion matching the existing `analytics_events.date`
   * column shape. Falls back to "today" if the input date is missing or
   * unparseable.
   */
  private toDateKey(d: Date | undefined | null): string {
    if (!d) return new Date().toISOString().slice(0, 10);
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }

  /**
   * Accumulate raw (event, target, date) tuples into a count map keyed
   * by "event::target::date", then flatten to the bulk-upsert shape.
   * Centralising this here keeps each per-collection walker dead simple -
   * just push tuples, this method does the grouping.
   */
  private group(
    tuples: { event: string; target: string; label?: string; date: string }[],
  ): { event: string; target: string; label?: string; date: string; count: number }[] {
    const buckets = new Map<
      string,
      { event: string; target: string; label?: string; date: string; count: number }
    >();
    for (const t of tuples) {
      const key = `${t.event}::${t.target}::${t.date}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        buckets.set(key, {
          event: t.event,
          target: t.target,
          label: t.label,
          date: t.date,
          count: 1,
        });
      }
    }
    return Array.from(buckets.values());
  }

  async run(): Promise<BackfillSummary> {
    const summary: BackfillSummary = {
      bookingCreated: 0,
      bookingPaymentConfirmed: 0,
      bookingStarted: 0,
      bookingCompleted: 0,
      bookingCancelled: 0,
      proposalSubmit: 0,
      proposalAccepted: 0,
      reviewSubmit: 0,
      registerPro: 0,
      registerClient: 0,
      totalRowsWritten: 0,
    };

    // -- Bookings --------------------------------------------------------
    // One booking can contribute up to 5 events depending on its lifecycle.
    // `createdAt` always counts (created), and the named timestamps count
    // for each later transition the booking actually reached.
    const bookings = await this.bookingModel
      .find({}, {
        professional: 1,
        status: 1,
        paymentStatus: 1,
        createdAt: 1,
        updatedAt: 1,
        pendingSince: 1,
        startedAt: 1,
        completedAt: 1,
        clientConfirmedAt: 1,
      })
      .lean()
      .exec();

    const bookingTuples: { event: string; target: string; label?: string; date: string }[] = [];
    for (const b of bookings) {
      const pro = b.professional?.toString();
      if (!pro) continue;
      const createdAt = (b as unknown as { createdAt?: Date }).createdAt;
      bookingTuples.push({ event: 'booking_created', target: pro, date: this.toDateKey(createdAt) });
      summary.bookingCreated += 1;

      // Payment confirmed: paymentStatus PAID (or any post-paid state) or
      // status PENDING/CONFIRMED/IN_PROGRESS/AWAITING_CLIENT_CONFIRMATION/COMPLETED
      // all imply the payment landed. pendingSince is the dedicated stamp
      // for the AWAITING_PAYMENT->PENDING transition; createdAt is the
      // fallback for older bookings predating that field.
      const isPaid =
        b.paymentStatus === BookingPaymentStatus.PAID ||
        b.paymentStatus === BookingPaymentStatus.RELEASED ||
        b.paymentStatus === BookingPaymentStatus.REFUNDED ||
        b.paymentStatus === BookingPaymentStatus.PARTIALLY_REFUNDED ||
        [
          BookingStatus.PENDING,
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS,
          BookingStatus.AWAITING_CLIENT_CONFIRMATION,
          BookingStatus.COMPLETED,
          BookingStatus.DISPUTED,
        ].includes(b.status as BookingStatus);
      if (isPaid) {
        bookingTuples.push({
          event: 'booking_payment_confirmed',
          target: pro,
          date: this.toDateKey(b.pendingSince ?? createdAt),
        });
        summary.bookingPaymentConfirmed += 1;
      }

      if (b.startedAt) {
        bookingTuples.push({ event: 'booking_started', target: pro, date: this.toDateKey(b.startedAt) });
        summary.bookingStarted += 1;
      }

      if (b.status === BookingStatus.COMPLETED) {
        bookingTuples.push({
          event: 'booking_completed',
          target: pro,
          date: this.toDateKey(b.clientConfirmedAt ?? b.completedAt ?? (b as unknown as { updatedAt?: Date }).updatedAt),
        });
        summary.bookingCompleted += 1;
      }

      if (b.status === BookingStatus.CANCELLED) {
        bookingTuples.push({
          event: 'booking_cancelled',
          target: pro,
          date: this.toDateKey((b as unknown as { updatedAt?: Date }).updatedAt ?? createdAt),
        });
        summary.bookingCancelled += 1;
      }
    }

    // -- Proposals -------------------------------------------------------
    // Every proposal counts as a proposal_submit. Accepted ones additionally
    // count as proposal_accepted, dated from ProjectTracking.hiredAt (the
    // dedicated timestamp) or proposal.updatedAt as fallback.
    const proposals = await this.proposalModel
      .find({}, { proId: 1, jobId: 1, status: 1, createdAt: 1, updatedAt: 1 })
      .lean()
      .exec();

    const trackings = await this.projectTrackingModel
      .find({}, { jobId: 1, hiredAt: 1 })
      .lean()
      .exec();
    const hiredAtByJob = new Map<string, Date>();
    for (const t of trackings) {
      if (t.jobId) hiredAtByJob.set(t.jobId.toString(), t.hiredAt);
    }

    const proposalTuples: { event: string; target: string; label?: string; date: string }[] = [];
    for (const p of proposals) {
      const pro = p.proId?.toString();
      if (!pro) continue;
      const createdAt = (p as unknown as { createdAt?: Date }).createdAt;
      proposalTuples.push({ event: 'proposal_submit', target: pro, date: this.toDateKey(createdAt) });
      summary.proposalSubmit += 1;

      if (p.status === ProposalStatus.ACCEPTED) {
        const jobId = p.jobId?.toString();
        const acceptedAt =
          (jobId ? hiredAtByJob.get(jobId) : undefined) ??
          (p as unknown as { updatedAt?: Date }).updatedAt;
        proposalTuples.push({
          event: 'proposal_accepted',
          target: pro,
          date: this.toDateKey(acceptedAt),
        });
        summary.proposalAccepted += 1;
      }
    }

    // -- Reviews ---------------------------------------------------------
    const reviews = await this.reviewModel
      .find({}, { proId: 1, bookingId: 1, createdAt: 1 })
      .lean()
      .exec();

    const reviewTuples: { event: string; target: string; label?: string; date: string }[] = [];
    for (const r of reviews) {
      const pro = r.proId?.toString();
      if (!pro) continue;
      const createdAt = (r as unknown as { createdAt?: Date }).createdAt;
      reviewTuples.push({
        event: 'review_submit',
        target: pro,
        date: this.toDateKey(createdAt),
      });
      summary.reviewSubmit += 1;
    }

    // -- Users (signups) -------------------------------------------------
    const users = await this.userModel
      .find({}, { role: 1, name: 1, createdAt: 1 })
      .lean()
      .exec();

    const userTuples: { event: string; target: string; label?: string; date: string }[] = [];
    for (const u of users) {
      const userId = (u._id as { toString(): string }).toString();
      const createdAt = (u as unknown as { createdAt?: Date }).createdAt;
      const date = this.toDateKey(createdAt);
      if (u.role === UserRole.PRO) {
        userTuples.push({ event: 'register_pro', target: userId, label: u.name ?? '', date });
        summary.registerPro += 1;
      } else if (u.role === UserRole.CLIENT) {
        userTuples.push({ event: 'register_client', target: userId, label: u.name ?? '', date });
        summary.registerClient += 1;
      }
    }

    // -- Group + upsert all in one bulk write ----------------------------
    const allRows = [
      ...this.group(bookingTuples),
      ...this.group(proposalTuples),
      ...this.group(reviewTuples),
      ...this.group(userTuples),
    ];

    await this.analyticsService.bulkSetCounts(allRows);
    summary.totalRowsWritten = allRows.length;

    this.logger.log(
      `Backfill complete: ${summary.totalRowsWritten} rows written (bookings: ${summary.bookingCreated}, paid: ${summary.bookingPaymentConfirmed}, completed: ${summary.bookingCompleted}, proposals: ${summary.proposalSubmit}, accepted: ${summary.proposalAccepted}, reviews: ${summary.reviewSubmit}, pros: ${summary.registerPro}, clients: ${summary.registerClient})`,
    );

    return summary;
  }
}
