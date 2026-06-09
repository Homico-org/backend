import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Booking, BookingPaymentStatus, BookingStatus } from './schemas/booking.schema';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { StartWorkDto } from './dto/start-work.dto';
import { CompleteWorkDto } from './dto/complete-work.dto';
import { User } from '../users/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { PaymentsService } from '../payments/payments.service';
import { Dispute } from '../payments/schemas/dispute.schema';
import { PortfolioService } from '../portfolio/portfolio.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  EngagementMode,
  EngagementStatus,
  ProjectRequest,
} from '../project-request/schemas/project-request.schema';

/**
 * Result of `create()` after the payments rework. Returns BOTH the booking
 * record AND a redirect URL to the payment provider's hosted page. Frontend
 * is expected to redirect immediately - the booking is in AWAITING_PAYMENT
 * status and a 15-min payment timeout will auto-cancel if abandoned.
 */
export interface CreateBookingResult {
  booking: Booking;
  /** URL to redirect the user to so they can complete payment. */
  paymentRedirectUrl: string;
  /** Payment id for status polling on the return URL. */
  paymentId: string;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectModel(Booking.name) private bookingModel: Model<Booking>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Dispute.name) private disputeModel: Model<Dispute>,
    @InjectModel(ProjectRequest.name)
    private projectRequestModel: Model<ProjectRequest>,
    private notificationsService: NotificationsService,
    private paymentsService: PaymentsService,
    private configService: ConfigService,
    private portfolioService: PortfolioService,
    private analyticsService: AnalyticsService,
  ) {}

  async create(clientId: string, dto: CreateBookingDto): Promise<CreateBookingResult> {
    const { professionalId, date, startHour, endHour, note, services, address, projectId, engagementId } = dto;

    if (clientId === professionalId) {
      throw new BadRequestException('Cannot book yourself');
    }

    if (endHour <= startHour) {
      throw new BadRequestException('endHour must be greater than startHour');
    }

    // Validate ObjectId format before going to Mongo - a non-hex
    // professionalId would otherwise crash with CastError 500 instead
    // of returning a clean 400.
    if (!Types.ObjectId.isValid(professionalId)) {
      throw new BadRequestException('Invalid professionalId');
    }

    const pro = await this.userModel.findById(professionalId).lean();
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    // Only Homico Partners (signed contract) are bookable. The frontend hides
    // the booking CTA for non-partners; this is the hard server-side gate so a
    // crafted request can't book a non-partner.
    if (!(pro as { isHomicoPartner?: boolean }).isHomicoPartner) {
      throw new ForbiddenException(
        'This professional is not a Homico Partner and cannot be booked',
      );
    }

    // Validate the requested slot is within pro's schedule. The slot is
    // reserved at this step even though payment hasn't happened yet -
    // AWAITING_PAYMENT bookings count toward conflict checks so the slot
    // doesn't get poached during the payment window.
    this.validateAgainstSchedule(pro, date, startHour, endHour);
    await this.checkConflicts(professionalId, date, startHour, endHour);

    // Sanity-check each service: positive quantity + non-negative price,
    // and discount within 0-100%. Without these a buggy client could
    // submit negative prices (free booking with NEGATIVE total caught
    // later) or 110% discount (price < 0). Reject early with a clear
    // 400 instead of letting downstream math produce nonsense.
    for (const s of services || []) {
      if (!Number.isFinite(s.quantity) || s.quantity <= 0) {
        throw new BadRequestException(
          `Service ${s.name}: quantity must be > 0`,
        );
      }
      if (!Number.isFinite(s.unitPrice) || s.unitPrice < 0) {
        throw new BadRequestException(
          `Service ${s.name}: unitPrice must be >= 0`,
        );
      }
      const d = s.discount || 0;
      if (!Number.isFinite(d) || d < 0 || d > 100) {
        throw new BadRequestException(
          `Service ${s.name}: discount must be 0-100`,
        );
      }
    }

    // Calculate service subtotals and total amount.
    const computedServices = (services || []).map((s) => {
      const discount = s.discount || 0;
      const subtotal = s.unitPrice * s.quantity * (1 - discount / 100);
      return { ...s, discount, subtotal };
    });
    const totalAmount = computedServices.reduce((sum, s) => sum + s.subtotal, 0);
    // GEL -> tetri. Round to avoid float drift.
    const totalAmountMinor = Math.round(totalAmount * 100);

    if (totalAmountMinor <= 0) {
      throw new BadRequestException('Booking total must be greater than zero');
    }

    const currency = (pro as { currency?: string }).currency ?? 'GEL';
    if (currency !== 'GEL') {
      // Multi-currency support is on the Phase 3 roadmap. Until then
      // the booking must be in GEL because our only payment provider
      // settles in GEL.
      throw new BadRequestException(
        `Bookings in ${currency} are not yet supported - only GEL`,
      );
    }

    const booking = new this.bookingModel({
      professional: new Types.ObjectId(professionalId),
      client: new Types.ObjectId(clientId),
      date,
      startHour,
      endHour,
      note,
      services: computedServices,
      totalAmount,
      totalAmountMinor,
      currency,
      address,
      status: BookingStatus.AWAITING_PAYMENT,
      paymentStatus: BookingPaymentStatus.UNPAID,
      projectId: projectId ? new Types.ObjectId(projectId) : undefined,
      engagementId,
    });

    const saved = await booking.save();

    // If this booking fills a Project role, link it back to the engagement
    // (invite-mode, hired). Best-effort - a link failure must not block the
    // booking/payment flow.
    if (projectId && engagementId) {
      try {
        await this.projectRequestModel.updateOne(
          { _id: projectId, 'engagements.id': engagementId },
          {
            $set: {
              'engagements.$.mode': EngagementMode.INVITE,
              'engagements.$.status': EngagementStatus.HIRED,
              'engagements.$.assignedProId': new Types.ObjectId(professionalId),
              'engagements.$.bookingId': saved._id,
            },
          },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to link booking ${saved._id} to engagement: ${(err as Error).message}`,
        );
      }
    }

    // Founder analytics: persist the booking-created event so the admin
    // dashboard can chart bookings over time. `target` is the pro's id so
    // /analytics/summary?event=booking_created can show top-booked pros.
    this.analyticsService.trackEvent(
      'booking_created',
      saved.professional.toString(),
      String(saved.totalAmountMinor ?? ''),
    );

    // Create the payment intent. Return URL points at our own page which
    // calls /payments/:id/reconcile to confirm before showing success.
    const appUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const bookingId = saved._id.toString();

    let intentResult: { paymentId: string; redirectUrl: string };
    try {
      intentResult = await this.paymentsService.createIntentForEntity({
        entityType: 'booking',
        entityId: bookingId,
        amountMinor: totalAmountMinor,
        currency: 'GEL',
        description: `Homico booking ${date} ${startHour}:00`,
        payerUserId: clientId,
        payeeUserId: professionalId,
        returnUrl: `${appUrl}/bookings/${bookingId}/pay/return`,
        cancelUrl: `${appUrl}/bookings/${bookingId}/pay/cancelled`,
      });
    } catch (err) {
      // Roll back the booking if we couldn't even spin up an intent.
      // The slot's not reserved if there's no intent.
      await this.bookingModel.findByIdAndDelete(saved._id).exec();
      this.logger.error(
        `Failed to create payment intent for booking ${bookingId}: ${(err as Error).message}`,
      );
      throw new BadRequestException('Could not initialize payment - please try again');
    }

    saved.paymentId = new Types.ObjectId(intentResult.paymentId);
    await saved.save();

    // Note: we do NOT notify the professional yet. They get the booking
    // notification only after payment succeeds (handled in syncPaymentStatus
    // when the status transitions AWAITING_PAYMENT -> PENDING).

    return {
      booking: saved,
      paymentRedirectUrl: intentResult.redirectUrl,
      paymentId: intentResult.paymentId,
    };
  }

  /**
   * Read the latest Payment + Escrow for this booking and update the
   * booking's status/paymentStatus to match. Idempotent. Called on:
   *   - findById (so every detail page sees fresh state)
   *   - findUserBookings (batched, called per booking)
   *   - Frontend's reconcile endpoint after the user returns from the
   *     payment provider
   *
   * Returns the (possibly mutated) booking doc.
   */
  private async syncPaymentStatus(booking: Booking): Promise<Booking> {
    const bookingId = booking._id.toString();
    const payment = await this.paymentsService.findLatestPaymentForEntity(
      'booking',
      bookingId,
    );
    if (!payment) return booking;

    let mutated = false;

    if (payment.status === 'succeeded' && booking.status === BookingStatus.AWAITING_PAYMENT) {
      // Founder analytics: real money landed. This is THE conversion event -
      // fires exactly once per booking (guarded by status === AWAITING_PAYMENT
      // so subsequent syncPaymentStatus calls don't double-count).
      this.analyticsService.trackEvent(
        'booking_payment_confirmed',
        booking.professional.toString(),
        String(booking.totalAmountMinor ?? ''),
      );

      // Payment confirmed: move into the legacy "awaiting pro confirmation"
      // state (PENDING) and surface the notification to the pro.
      booking.status = BookingStatus.PENDING;
      booking.paymentStatus = BookingPaymentStatus.PAID;
      // Stamp the moment the SLA-accept timer should start counting
      // from. The SLA cron (`SlaCronService.scanBookings`) compares
      // `now - pendingSince` against the 30-min threshold. Reset the
      // miss latch defensively in case this booking was re-paid
      // after a previous cancel/restore flow.
      booking.pendingSince = new Date();
      booking.slaMissRecorded = false;
      const escrow = await this.paymentsService.findEscrowForEntity('booking', bookingId);
      if (escrow) {
        booking.escrowId = escrow._id;
      }
      mutated = true;
      await this.notificationsService.notify(
        booking.professional.toString(),
        NotificationType.NEW_BOOKING,
        'New Booking Request',
        `You have a new booking for ${booking.date} at ${booking.startHour}:00`,
        {
          link: '/bookings',
          referenceId: bookingId,
          referenceModel: 'Booking',
          i18n: {
            titleKey: 'notifications.types.new_booking.title',
            messageKey: 'notifications.types.new_booking.message',
            params: { date: booking.date, time: `${booking.startHour}:00` },
          },
        },
      );
    } else if (
      (payment.status === 'failed' || payment.status === 'cancelled') &&
      booking.status === BookingStatus.AWAITING_PAYMENT
    ) {
      // Payment failed: free the slot immediately so other clients can book it.
      booking.status = BookingStatus.CANCELLED;
      booking.cancelReason = `Payment ${payment.status}`;
      mutated = true;
    }

    // Dispute resolution self-heal: if the booking is currently DISPUTED
    // but the escrow has moved out of `in_dispute` (because admin
    // resolved), reflect the resolution on the booking so the client +
    // pro don't see "Disputed" forever. `paymentsService.resolveDispute`
    // intentionally only touches the escrow + dispute docs to avoid a
    // payments->bookings cycle; this is the bookings side catching up.
    if (booking.status === BookingStatus.DISPUTED) {
      const escrow = await this.paymentsService.findEscrowForEntity(
        'booking',
        bookingId,
      );
      if (escrow && escrow.status !== 'in_dispute') {
        // Compare what was refunded vs the held total - this tells us
        // the split regardless of the escrow's final lifecycle state
        // (the escrow might be at pending_release with a partial refund
        // attached, or fully refunded, or untouched).
        const total = escrow.amountHeldMinor;
        const refunded = escrow.refundedAmountMinor ?? 0;
        if (refunded >= total) {
          booking.status = BookingStatus.CANCELLED;
          booking.paymentStatus = BookingPaymentStatus.REFUNDED;
        } else if (refunded > 0) {
          booking.status = BookingStatus.COMPLETED;
          booking.paymentStatus = BookingPaymentStatus.PARTIALLY_REFUNDED;
          booking.clientConfirmedAt = booking.clientConfirmedAt ?? new Date();
        } else {
          // No refund issued = ruled in favour of the pro.
          booking.status = BookingStatus.COMPLETED;
          booking.paymentStatus = BookingPaymentStatus.PAID;
          booking.clientConfirmedAt = booking.clientConfirmedAt ?? new Date();
        }
        mutated = true;
      }
    }

    if (mutated) await booking.save();
    return booking;
  }

  async getPendingCount(userId: string): Promise<{ count: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const count = await this.bookingModel.countDocuments({
      $or: [
        { professional: userObjectId },
        { client: userObjectId },
      ],
      status: { $in: ['pending', 'confirmed'] },
    });
    return { count };
  }

  async findUserBookings(
    userId: string,
    options: { status?: string; upcoming?: boolean } = {},
  ) {
    const query: any = {
      $or: [
        { professional: new Types.ObjectId(userId) },
        { client: new Types.ObjectId(userId) },
      ],
    };

    if (options.status) {
      query.status = options.status;
    }

    if (options.upcoming) {
      const today = new Date().toISOString().split('T')[0];
      query.date = { $gte: today };
      query.status = {
        $in: [
          BookingStatus.PENDING,
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS,
          BookingStatus.AWAITING_CLIENT_CONFIRMATION,
        ],
      };
    }

    // Sync any AWAITING_PAYMENT bookings before the lean fetch. This is the
    // only status where the payment side might have moved without us
    // knowing (webhook delayed or missed). Other statuses are owned by
    // booking-side actions.
    const awaitingPaymentIds = await this.bookingModel
      .find({ ...query, status: BookingStatus.AWAITING_PAYMENT })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();
    for (const row of awaitingPaymentIds) {
      const hydrated = await this.bookingModel.findById(row._id);
      if (hydrated) await this.syncPaymentStatus(hydrated);
    }

    return this.bookingModel
      .find(query)
      .populate('professional', 'name avatar phone accountType')
      .populate('client', 'name avatar phone')
      .sort({ date: 1, startHour: 1 })
      .lean();
  }

  async findById(bookingId: string, userId: string) {
    // We need the hydrated doc first to call syncPaymentStatus, then
    // re-fetch as lean for the populated response. Slight extra cost but
    // ensures the booking is always up-to-date with payment state.
    const hydrated = await this.bookingModel.findById(bookingId);
    if (!hydrated) {
      throw new NotFoundException('Booking not found');
    }
    await this.syncPaymentStatus(hydrated);

    const booking = await this.bookingModel
      .findById(bookingId)
      .populate('professional', 'name avatar phone accountType')
      .populate('client', 'name avatar phone')
      .lean();

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const proId = (booking.professional as any)._id?.toString() || booking.professional.toString();
    const cliId = (booking.client as any)._id?.toString() || booking.client.toString();

    if (proId !== userId && cliId !== userId) {
      throw new ForbiddenException('Not authorized to view this booking');
    }

    return booking;
  }

  /**
   * Return the payment summary for a booking. Frontend pay page uses this
   * to render the "Pay X" button - returns the provider's redirect URL,
   * the amount, and the current intent status. Returns null when no intent
   * exists yet (shouldn't happen post-create but defensive).
   *
   * Only the booking's client may call this.
   */
  async getPaymentSummary(bookingId: string, userId: string) {
    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.client.toString() !== userId) {
      throw new ForbiddenException('Only the client can view payment');
    }
    return this.paymentsService.findPaymentSummaryForEntity('booking', bookingId);
  }

  /**
   * Create a fresh payment intent for a booking that's still in
   * AWAITING_PAYMENT (e.g. previous intent timed out or failed). Returns
   * the new redirect URL. Refuses if the booking already has a succeeded
   * payment or is no longer in AWAITING_PAYMENT.
   */
  async retryPayment(bookingId: string, userId: string) {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.client.toString() !== userId) {
      throw new ForbiddenException('Only the client can retry payment');
    }
    if (booking.status !== BookingStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(
        `Cannot retry payment from status ${booking.status}`,
      );
    }
    if (!booking.totalAmountMinor) {
      throw new BadRequestException('Booking has no total amount set');
    }

    const appUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const result = await this.paymentsService.createIntentForEntity({
      entityType: 'booking',
      entityId: bookingId,
      amountMinor: booking.totalAmountMinor,
      currency: 'GEL',
      description: `Homico booking retry ${booking.date} ${booking.startHour}:00`,
      payerUserId: userId,
      payeeUserId: booking.professional.toString(),
      returnUrl: `${appUrl}/bookings/${bookingId}/pay/return`,
      cancelUrl: `${appUrl}/bookings/${bookingId}/pay/cancelled`,
    });
    booking.paymentId = new Types.ObjectId(result.paymentId);
    await booking.save();
    return {
      paymentId: result.paymentId,
      redirectUrl: result.redirectUrl,
    };
  }

  /**
   * Force-refresh payment state from the provider, then return the latest
   * booking. Called by the frontend's pay/return page so the UI reflects
   * the truth even when the webhook is delayed.
   */
  async reconcilePayment(bookingId: string, userId: string) {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (booking.client.toString() !== userId) {
      throw new ForbiddenException('Only the client can reconcile payment');
    }
    if (booking.paymentId) {
      // Ping the provider, ignore the doc - syncPaymentStatus reads the
      // updated Payment row right after.
      await this.paymentsService.reconcileFromReturnUrl(booking.paymentId.toString())
        .catch((err: Error) => {
          this.logger.warn(
            `Provider reconcile failed for booking ${bookingId}: ${err.message}`,
          );
        });
    }
    return this.syncPaymentStatus(booking);
  }

  async updateStatus(
    bookingId: string,
    userId: string,
    dto: UpdateBookingStatusDto,
  ): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const proId = booking.professional.toString();
    const cliId = booking.client.toString();

    if (proId !== userId && cliId !== userId) {
      throw new ForbiddenException('Not authorized to update this booking');
    }

    // Validate transitions
    const { status, cancelReason } = dto;

    if (status === BookingStatus.CONFIRMED && userId !== proId) {
      throw new ForbiddenException('Only the professional can confirm bookings');
    }

    if (status === BookingStatus.COMPLETED && userId !== proId) {
      throw new ForbiddenException('Only the professional can mark bookings as completed');
    }

    if (status === BookingStatus.IN_PROGRESS && userId !== proId) {
      throw new ForbiddenException('Only the professional can start work on bookings');
    }

    if (status === BookingStatus.CANCELLED) {
      booking.cancelledBy = new Types.ObjectId(userId);
      booking.cancelReason = cancelReason;
    }

    booking.status = status;
    const updated = await booking.save();

    // Notify the other party
    const notifyUserId = userId === proId ? cliId : proId;
    const statusMessages: Record<string, { title: string; message: string }> = {
      [BookingStatus.CONFIRMED]: {
        title: 'Booking Confirmed',
        message: `Your booking for ${booking.date} at ${booking.startHour}:00 has been confirmed`,
      },
      [BookingStatus.IN_PROGRESS]: {
        title: 'Work Started',
        message: `Pro has started work on your booking for ${booking.date}`,
      },
      [BookingStatus.CANCELLED]: {
        title: 'Booking Cancelled',
        message: `Booking for ${booking.date} at ${booking.startHour}:00 has been cancelled`,
      },
      [BookingStatus.COMPLETED]: {
        title: 'Booking Completed',
        message: `Booking for ${booking.date} at ${booking.startHour}:00 has been completed`,
      },
    };

    const msg = statusMessages[status];
    if (msg) {
      const notificationTypeMap: Record<string, NotificationType> = {
        [BookingStatus.CONFIRMED]: NotificationType.BOOKING_CONFIRMED,
        [BookingStatus.IN_PROGRESS]: NotificationType.BOOKING_STARTED,
        [BookingStatus.CANCELLED]: NotificationType.BOOKING_CANCELLED,
        [BookingStatus.COMPLETED]: NotificationType.BOOKING_COMPLETED,
      };
      const i18nKeyByStatus: Record<string, string> = {
        [BookingStatus.CONFIRMED]: 'booking_confirmed',
        [BookingStatus.IN_PROGRESS]: 'booking_started',
        [BookingStatus.CANCELLED]: 'booking_cancelled',
        [BookingStatus.COMPLETED]: 'booking_completed',
      };
      const i18nBase = i18nKeyByStatus[status] || 'booking_completed';
      await this.notificationsService.notify(
        notifyUserId,
        notificationTypeMap[status] || NotificationType.BOOKING_COMPLETED,
        msg.title,
        msg.message,
        {
          link: `/bookings`,
          referenceId: bookingId,
          referenceModel: 'Booking',
          i18n: {
            titleKey: `notifications.types.${i18nBase}.title`,
            messageKey: `notifications.types.${i18nBase}.message`,
            params: { date: booking.date, time: `${booking.startHour}:00` },
          },
        },
      );
    }

    // Send review prompt to client when booking is completed
    if (status === BookingStatus.COMPLETED) {
      await this.notificationsService.notify(
        cliId,
        NotificationType.REVIEW_PROMPT,
        'How was your experience?',
        'Leave a review for your booking',
        {
          referenceId: bookingId,
          referenceModel: 'Booking',
          link: `/review/booking/${bookingId}`,
          i18n: {
            titleKey: 'notifications.types.review_prompt.title',
            messageKey: 'notifications.types.review_prompt.message',
          },
          metadata: {
            proId: proId,
            bookingId: bookingId,
          },
        },
      );
    }

    return updated;
  }

  async startWork(
    bookingId: string,
    userId: string,
    dto: StartWorkDto,
  ): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const proId = booking.professional.toString();
    if (proId !== userId) {
      throw new ForbiddenException('Only the professional can start work');
    }

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Booking must be confirmed before starting work');
    }

    booking.status = BookingStatus.IN_PROGRESS;
    booking.startedAt = new Date();
    if (dto.beforePhotos && dto.beforePhotos.length > 0) {
      booking.beforePhotos = dto.beforePhotos;
    }

    const updated = await booking.save();

    this.analyticsService.trackEvent(
      'booking_started',
      booking.professional.toString(),
    );

    const cliId = booking.client.toString();
    await this.notificationsService.notify(
      cliId,
      NotificationType.BOOKING_STARTED,
      'Work Started',
      `Pro has started work on your booking for ${booking.date}`,
      {
        link: `/bookings`,
        referenceId: bookingId,
        referenceModel: 'Booking',
        i18n: {
          titleKey: 'notifications.types.booking_started.title',
          messageKey: 'notifications.types.booking_started.message',
          params: { date: booking.date },
        },
      },
    );

    return updated;
  }

  async completeWork(
    bookingId: string,
    userId: string,
    dto: CompleteWorkDto,
  ): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const proId = booking.professional.toString();
    if (proId !== userId) {
      throw new ForbiddenException('Only the professional can complete work');
    }

    if (booking.status !== BookingStatus.IN_PROGRESS) {
      throw new BadRequestException('Booking must be in progress before completing');
    }

    // After payments: pro pressing "complete" doesn't immediately release
    // the escrow. Booking goes to AWAITING_CLIENT_CONFIRMATION; client has
    // 48h to confirm or dispute. Auto-confirmation job (Task #7) fires the
    // transition to COMPLETED if the client doesn't act.
    booking.status = BookingStatus.AWAITING_CLIENT_CONFIRMATION;
    booking.completedAt = new Date();
    booking.afterPhotos = dto.afterPhotos;
    if (dto.videos?.length) booking.videos = dto.videos;

    const updated = await booking.save();

    const cliId = booking.client.toString();

    await this.notificationsService.notify(
      cliId,
      NotificationType.BOOKING_COMPLETED,
      'Confirm work completion',
      'Pro marked the job complete. Please confirm or report an issue within 48h.',
      {
        link: `/bookings`,
        referenceId: bookingId,
        referenceModel: 'Booking',
        i18n: {
          titleKey: 'notifications.types.work_completed.title',
          messageKey: 'notifications.types.work_completed.message',
        },
      },
    );

    await this.notificationsService.notify(
      cliId,
      NotificationType.REVIEW_PROMPT,
      'How was your experience?',
      'Leave a review for your booking',
      {
        referenceId: bookingId,
        referenceModel: 'Booking',
        link: `/review/booking/${bookingId}`,
        i18n: {
          titleKey: 'notifications.types.review_prompt.title',
          messageKey: 'notifications.types.review_prompt.message',
        },
        metadata: {
          proId: proId,
          bookingId: bookingId,
        },
      },
    );

    return updated;
  }

  /**
   * Per-day availability summary for a date range. Used by the booking
   * modal to mark unavailable days BEFORE the user clicks each one - 14
   * round-trips on every modal open is wasteful, and forcing the user
   * to discover availability by trial-and-click is bad UX. The summary
   * collapses each day to a single `hasSlots` boolean; the per-slot
   * detail is fetched lazily when the user actually picks a date.
   *
   * The query is capped at 31 days to keep the worst-case work bounded
   * (one schema read + N day computations + one bookings query).
   */
  async getAvailabilityRange(
    proId: string,
    from: string,
    to: string,
  ): Promise<{ date: string; hasSlots: boolean }[]> {
    const pro = await this.userModel.findById(proId).lean();
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      throw new BadRequestException('Invalid from/to range');
    }
    const dayMs = 86_400_000;
    const dayCount = Math.floor((end.getTime() - start.getTime()) / dayMs) + 1;
    if (dayCount > 31) {
      throw new BadRequestException('Range cannot exceed 31 days');
    }

    // One bookings query for the whole range - much cheaper than N
    // queries from a per-day getAvailability loop.
    const allBookings = await this.bookingModel
      .find({
        professional: new Types.ObjectId(proId),
        date: { $gte: from, $lte: to },
        status: {
          $in: [
            BookingStatus.AWAITING_PAYMENT,
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
            BookingStatus.IN_PROGRESS,
            BookingStatus.AWAITING_CLIENT_CONFIRMATION,
            BookingStatus.DISPUTED,
          ],
        },
      })
      .lean();

    const bookingsByDate = new Map<string, typeof allBookings>();
    for (const b of allBookings) {
      const arr = bookingsByDate.get(b.date) ?? [];
      arr.push(b);
      bookingsByDate.set(b.date, arr);
    }

    const out: { date: string; hasSlots: boolean }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const d = new Date(start.getTime() + i * dayMs);
      const iso = d.toISOString().split('T')[0];
      const dayOfWeek = this.getDayOfWeek(iso);

      // Mirror getAvailability's resolution order: overrides win,
      // else weekly schedule. A day with no entry / explicit unavailable
      // entry / explicit block returns hasSlots: false.
      const override = (pro.scheduleOverrides || []).find((o) => o.date === iso);
      let startHour: number | null = null;
      let endHour: number | null = null;
      if (override?.isBlocked) {
        out.push({ date: iso, hasSlots: false });
        continue;
      }
      if (override && !override.isBlocked && override.startHour != null && override.endHour != null) {
        startHour = override.startHour;
        endHour = override.endHour;
      } else {
        const daySchedule = (pro.weeklySchedule || []).find((d2) => d2.dayOfWeek === dayOfWeek);
        if (!daySchedule || !daySchedule.isAvailable) {
          out.push({ date: iso, hasSlots: false });
          continue;
        }
        startHour = daySchedule.startHour;
        endHour = daySchedule.endHour;
      }

      const dayBookings = bookingsByDate.get(iso) ?? [];
      const slots = this.generateSlots(startHour, endHour, dayBookings);
      const hasSlots = slots.some((s) => s.available);
      out.push({ date: iso, hasSlots });
    }
    return out;
  }

  async getAvailability(
    proId: string,
    date: string,
  ): Promise<{ hour: number; available: boolean }[]> {
    const pro = await this.userModel.findById(proId).lean();
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    const dayOfWeek = this.getDayOfWeek(date);

    // Check schedule overrides first
    const override = (pro.scheduleOverrides || []).find((o) => o.date === date);
    if (override?.isBlocked) {
      return this.generateSlots(0, 0, []); // all unavailable
    }

    let startHour: number;
    let endHour: number;

    if (override && !override.isBlocked && override.startHour != null && override.endHour != null) {
      startHour = override.startHour;
      endHour = override.endHour;
    } else {
      const daySchedule = (pro.weeklySchedule || []).find((d) => d.dayOfWeek === dayOfWeek);
      if (!daySchedule || !daySchedule.isAvailable) {
        return this.generateSlots(0, 0, []);
      }
      startHour = daySchedule.startHour;
      endHour = daySchedule.endHour;
    }

    // Fetch existing bookings for this date
    const existingBookings = await this.bookingModel.find({
      professional: new Types.ObjectId(proId),
      date,
      // Any status that "holds" a slot blocks availability. AWAITING_PAYMENT
      // counts - we hold the slot during the payment window so it doesn't
      // get poached. AWAITING_CLIENT_CONFIRMATION + DISPUTED too because
      // the slot is conceptually still consumed.
      status: {
        $in: [
          BookingStatus.AWAITING_PAYMENT,
          BookingStatus.PENDING,
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS,
          BookingStatus.AWAITING_CLIENT_CONFIRMATION,
          BookingStatus.DISPUTED,
        ],
      },
    }).lean();

    return this.generateSlots(startHour, endHour, existingBookings);
  }

  /**
   * Internal helper that performs the actual completion transition.
   * Shared by `clientConfirm` (user-initiated) and the cron auto-confirm
   * (system-initiated after 48h). Bypasses ownership checks - callers
   * are responsible for authorization.
   */
  private async transitionToCompleted(
    booking: Booking,
    via: 'client' | 'auto',
  ): Promise<Booking> {
    booking.status = BookingStatus.COMPLETED;
    booking.clientConfirmedAt = new Date();
    await booking.save();

    // If this booking fills a Project role, mark the engagement completed
    // so the project dashboard rolls progress forward. Best-effort.
    if (booking.projectId && booking.engagementId) {
      try {
        await this.projectRequestModel.updateOne(
          { _id: booking.projectId, 'engagements.id': booking.engagementId },
          { $set: { 'engagements.$.status': EngagementStatus.COMPLETED } },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to complete engagement for booking ${booking._id}: ${(err as Error).message}`,
        );
      }
    }

    // Founder analytics: the only "money fully earned" event. Fires once per
    // booking from both client-confirm and auto-confirm paths (this helper is
    // the single transition point both call). Label distinguishes which path.
    this.analyticsService.trackEvent(
      'booking_completed',
      booking.professional.toString(),
      via,
    );

    if (booking.escrowId) {
      await this.paymentsService.markEscrowPendingRelease(
        booking.escrowId.toString(),
      );
    }

    // Promote the booking into the pro's portfolio. Mirrors what
    // project-tracking.confirmCompletion does for the longer-running flow.
    // Best-effort: a portfolio write failure should never block the payout
    // transition above.
    try {
      await this.addBookingToPortfolio(booking);
    } catch (err) {
      this.logger.warn(
        `Portfolio promotion failed for booking ${booking._id}: ${(err as Error).message}`,
      );
    }

    await this.notificationsService.notify(
      booking.professional.toString(),
      NotificationType.BOOKING_COMPLETED,
      via === 'auto' ? 'Booking auto-confirmed' : 'Booking marked complete',
      via === 'auto'
        ? 'Client did not respond within 48h. Payout will release on the next batch.'
        : 'Client confirmed your work. Payout will be released on the next batch.',
      {
        link: '/bookings',
        referenceId: booking._id.toString(),
        referenceModel: 'Booking',
        i18n: {
          titleKey: 'notifications.types.work_completed.title',
          messageKey: 'notifications.types.work_completed.message',
        },
      },
    );

    return booking;
  }

  /**
   * Promote a completed booking into the pro's portfolio. Creates a row in
   * the PortfolioItem collection (what the public `/portfolio/pro/:id`
   * endpoint reads) AND pushes a copy into the user's embedded
   * `portfolioProjects[]` array (what the profile page also blends in).
   *
   * Skips silently when there are no after-photos - an empty portfolio card
   * is worse than no card at all. Idempotent on bookingId via
   * `createFromBooking`'s upsert behavior, so safe to call twice.
   */
  private async addBookingToPortfolio(booking: Booking): Promise<void> {
    const afterPhotos = booking.afterPhotos || [];
    const beforePhotos = booking.beforePhotos || [];
    if (afterPhotos.length === 0) return;

    // Pair before/after by index where both exist; remaining afters appear
    // as standalone images in the gallery.
    const beforeAfterPairs: { before: string; after: string }[] = [];
    const pairLen = Math.min(beforePhotos.length, afterPhotos.length);
    for (let i = 0; i < pairLen; i++) {
      beforeAfterPairs.push({
        before: beforePhotos[i],
        after: afterPhotos[i],
      });
    }

    // Title comes from the first service. Prefer the Georgian name since the
    // marketplace is Tbilisi-first and the portfolio schema only carries one
    // title slot. If the booking spans multiple services, append a count so
    // viewers see this was a multi-service job rather than just the first one.
    const firstService = booking.services?.[0];
    const baseTitle =
      firstService?.nameKa || firstService?.name || 'Completed booking';
    const extraCount = Math.max(0, (booking.services?.length || 0) - 1);
    const title = extraCount > 0 ? `${baseTitle} +${extraCount}` : baseTitle;
    const category = firstService?.serviceKey;
    const proId = booking.professional.toString();
    const clientId = booking.client.toString();
    const bookingId = booking._id.toString();

    const client = await this.userModel
      .findById(clientId)
      .select('name')
      .lean<{ name?: string }>();

    const portfolioItem = await this.portfolioService.createFromBooking({
      proId,
      bookingId,
      title,
      images: afterPhotos,
      beforeAfterPairs,
      category,
      location: booking.address,
      clientId,
      clientName: client?.name,
      completedDate: booking.completedAt || new Date(),
    });

    // Mirror into the embedded array used by the pro profile page.
    // `bookingId` lets us de-dup on the embedded side too.
    const portfolioItemId = (portfolioItem._id as Types.ObjectId).toString();
    const alreadyEmbedded = await this.userModel.exists({
      _id: new Types.ObjectId(proId),
      'portfolioProjects.jobId': bookingId,
    });
    if (alreadyEmbedded) return;

    await this.userModel.findByIdAndUpdate(proId, {
      $push: {
        portfolioProjects: {
          id: portfolioItemId,
          title,
          description: '',
          images: afterPhotos,
          beforeAfterPairs: beforeAfterPairs.map((p, i) => ({
            id: `pair-${bookingId}-${i}`,
            beforeImage: p.before,
            afterImage: p.after,
          })),
          location: booking.address,
          jobId: bookingId,
          source: 'homico',
          completedDate: (booking.completedAt || new Date()).toISOString(),
        },
      },
    });
  }

  /**
   * Client confirms work was done. Moves booking to COMPLETED and flips
   * the escrow to PENDING_RELEASE so admin can payout. Only the client
   * can call this; pros can't self-confirm.
   *
   * Auto-confirmation (Task #7) fires this same code path after 48h.
   */
  async clientConfirm(bookingId: string, userId: string): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.client.toString() !== userId) {
      throw new ForbiddenException('Only the client can confirm completion');
    }
    if (booking.status !== BookingStatus.AWAITING_CLIENT_CONFIRMATION) {
      throw new BadRequestException(
        'Booking is not awaiting client confirmation',
      );
    }
    return this.transitionToCompleted(booking, 'client');
  }

  /**
   * System auto-confirms a booking after the 48h client-confirmation
   * window expires. Called by the cron service - never by a user. No
   * ownership check; the cron caller is responsible for filtering.
   *
   * Returns null if the booking is no longer in AWAITING_CLIENT_CONFIRMATION
   * (race: client confirmed or raised dispute between query and write).
   */
  async autoConfirm(bookingId: string): Promise<Booking | null> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) return null;
    // Re-check: another transition may have happened in the time between
    // the cron query and this write.
    if (booking.status !== BookingStatus.AWAITING_CLIENT_CONFIRMATION) {
      return null;
    }
    return this.transitionToCompleted(booking, 'auto');
  }

  /**
   * Cancel an AWAITING_PAYMENT booking that the client never paid for.
   * Called by the cron service after the 15-min payment window expires.
   * Frees the slot for other bookings. No refund needed (no money was
   * ever taken).
   */
  async autoCancelStalePayment(bookingId: string): Promise<Booking | null> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) return null;
    if (booking.status !== BookingStatus.AWAITING_PAYMENT) return null;

    booking.status = BookingStatus.CANCELLED;
    booking.cancelReason = 'Payment window expired (15 min)';
    await booking.save();

    this.logger.log(
      `Auto-cancelled stale AWAITING_PAYMENT booking ${booking._id}`,
    );
    return booking;
  }

  /**
   * Find bookings whose scheduled time passed by 30+ minutes without the
   * pro pressing "Start work", and ping the client to check whether the
   * pro arrived. The client can then raise a dispute via the normal flow.
   *
   * Returns the count of pings sent so the cron service can log it.
   */
  async pingClientsForPotentialNoShows(): Promise<number> {
    // Anything from booking time + 30min in the past until 2h in the past.
    // 2h cap so we don't keep pinging on ancient bookings - one notification
    // per booking is enough.
    const now = Date.now();
    const TBILISI_OFFSET_MS = 4 * 60 * 60 * 1000;
    const minBookingMs = now - 2 * 60 * 60 * 1000; // 2h ago
    const maxBookingMs = now - 30 * 60 * 1000; // 30min ago

    // Pull confirmed bookings whose date/startHour falls in the window.
    // We can't filter directly in Mongo (date is a string, startHour is
    // separate) so we fetch all CONFIRMED-status and filter in memory.
    // Volume is bounded by recent activity - acceptable for Phase 1.
    const confirmed = await this.bookingModel
      .find({
        status: BookingStatus.CONFIRMED,
        // Exclude already-pinged via metadata. We don't track that today,
        // so add a simple flag check.
        noShowPingedAt: { $exists: false },
      })
      .lean<
        Array<{
          _id: Types.ObjectId;
          client: Types.ObjectId;
          professional: Types.ObjectId;
          date: string;
          startHour: number;
        }>
      >()
      .exec();

    let pinged = 0;
    for (const b of confirmed) {
      const hh = String(b.startHour).padStart(2, '0');
      const bookingMs = Date.parse(`${b.date}T${hh}:00:00+04:00`);
      if (Number.isNaN(bookingMs)) continue;
      if (bookingMs < minBookingMs || bookingMs > maxBookingMs) continue;
      void TBILISI_OFFSET_MS; // tag value kept for clarity

      // Send the client a notification with the "report issue" CTA. The
      // existing dispute flow handles the rest.
      await this.notificationsService.notify(
        b.client.toString(),
        NotificationType.BOOKING_DISPUTED,
        'Did your pro arrive?',
        'Your booking started 30 min ago but the pro hasn\'t marked it as started. If they didn\'t show, you can report it.',
        {
          link: '/bookings',
          referenceId: b._id.toString(),
          referenceModel: 'Booking',
          i18n: {
            titleKey: 'notifications.types.booking_disputed.title',
            messageKey: 'notifications.types.booking_disputed.message',
          },
        },
      );
      // Mark pinged so we don't re-ping every cron tick.
      await this.bookingModel.updateOne(
        { _id: b._id },
        { $set: { noShowPingedAt: new Date() } },
      );
      pinged++;
    }
    return pinged;
  }

  /**
   * Cancel a booking. Either party can cancel, but the refund policy
   * depends on WHO is cancelling and HOW CLOSE to the booking time.
   *
   * Policy (also expressed in `computeCancellationQuote` below):
   *   Pro cancels (any time)       -> 100% refund to client. Pro strike.
   *   Client cancels >24h before   -> 100% refund. No payout to pro.
   *   Client cancels 24h-2h before -> 50% refund / 50% to pro.
   *   Client cancels <2h before    -> 0% refund. 100% to pro.
   *
   * Permitted booking states: AWAITING_PAYMENT, PENDING, CONFIRMED.
   * IN_PROGRESS and later: use dispute instead - cancellation is
   * conceptually a "we didn't do the work yet" action.
   */
  async cancel(
    bookingId: string,
    userId: string,
    reason?: string,
  ): Promise<Booking> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');

    const proId = booking.professional.toString();
    const clientId = booking.client.toString();
    if (userId !== proId && userId !== clientId) {
      throw new ForbiddenException('Not authorized to cancel this booking');
    }

    const cancellableStates: BookingStatus[] = [
      BookingStatus.AWAITING_PAYMENT,
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ];
    if (!cancellableStates.includes(booking.status)) {
      throw new BadRequestException(
        `Booking in status ${booking.status} cannot be cancelled - raise a dispute instead`,
      );
    }

    const isProCancelling = userId === proId;
    const quote = this.computeCancellationQuote(booking, isProCancelling);

    booking.status = BookingStatus.CANCELLED;
    booking.cancelledBy = new Types.ObjectId(userId);
    booking.cancelReason = reason;

    // Apply the refund + payout split if money has actually been collected.
    // AWAITING_PAYMENT bookings have no escrow yet, so we just cancel.
    if (booking.paymentStatus === BookingPaymentStatus.PAID && booking.totalAmountMinor) {
      if (quote.refundMinor > 0) {
        try {
          await this.paymentsService.refundForEntity(
            'booking',
            bookingId,
            quote.refundMinor,
            reason ?? `Cancelled by ${isProCancelling ? 'professional' : 'client'} (policy: ${quote.policy})`,
          );
        } catch (err) {
          this.logger.error(
            `Refund failed for cancelled booking ${bookingId}: ${(err as Error).message}`,
          );
          // Don't block the cancellation. Admin can manually issue the
          // refund from /admin/payouts. Booking still moves to CANCELLED.
        }
      }
      // If the pro is owed anything from the policy split, queue the
      // remaining escrow amount for payout. The admin payouts UI picks
      // this up from PENDING_RELEASE escrows.
      if (quote.payoutMinor > 0 && booking.escrowId) {
        try {
          await this.paymentsService.markEscrowPendingRelease(
            booking.escrowId.toString(),
          );
        } catch (err) {
          this.logger.error(
            `Marking escrow ${booking.escrowId} for release failed on cancellation: ${(err as Error).message}`,
          );
        }
      }
      // Booking-side paymentStatus reflects the outcome.
      if (quote.refundMinor === booking.totalAmountMinor) {
        booking.paymentStatus = BookingPaymentStatus.REFUNDED;
      } else if (quote.refundMinor > 0) {
        booking.paymentStatus = BookingPaymentStatus.PARTIALLY_REFUNDED;
      } else {
        // 0% refund means pro keeps everything - the escrow is heading to
        // pro payout, so reflect that on the booking side.
        booking.paymentStatus = BookingPaymentStatus.RELEASED;
      }
    }

    await booking.save();

    // Founder analytics: who cancelled (pro/client) is the label so the
    // dashboard can split cancellations by who acted. Refund amount goes
    // into the target so summary endpoint can group by pro.
    this.analyticsService.trackEvent(
      'booking_cancelled',
      booking.professional.toString(),
      isProCancelling ? 'pro' : 'client',
    );

    // Notify the OTHER party.
    const otherUserId = isProCancelling ? clientId : proId;
    await this.notificationsService.notify(
      otherUserId,
      NotificationType.BOOKING_CANCELLED,
      'Booking cancelled',
      reason ?? 'Booking was cancelled',
      {
        link: '/bookings',
        referenceId: bookingId,
        referenceModel: 'Booking',
        i18n: {
          titleKey: 'notifications.types.booking_cancelled.title',
          messageKey: 'notifications.types.booking_cancelled.message',
        },
      },
    );

    return booking;
  }

  /**
   * Public quote API. Used by the cancel-confirmation modal to render the
   * refund amount BEFORE the user commits. Same calculation as `cancel`
   * uses internally - keeps quote and execution in sync.
   *
   * Either party can request the quote (each sees their own side's split).
   * Returns null if the booking is in a non-cancellable state.
   */
  async getCancellationQuote(bookingId: string, userId: string) {
    const booking = await this.bookingModel.findById(bookingId).lean();
    if (!booking) throw new NotFoundException('Booking not found');

    const proId = booking.professional.toString();
    const clientId = booking.client.toString();
    if (userId !== proId && userId !== clientId) {
      throw new ForbiddenException('Not authorized');
    }

    const cancellableStates: BookingStatus[] = [
      BookingStatus.AWAITING_PAYMENT,
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ];
    const cancellable = cancellableStates.includes(booking.status);

    const quote = this.computeCancellationQuote(booking, userId === proId);
    return {
      cancellable,
      isProCancelling: userId === proId,
      currency: booking.currency ?? 'GEL',
      ...quote,
    };
  }

  /**
   * Pure calculation of the cancellation refund/payout split. Exported as
   * a private method on the service so `cancel()` and `getCancellationQuote()`
   * always agree.
   *
   * `policy` is a human-readable label included in the cancellation reason
   * so admins can later audit which rule fired.
   */
  private computeCancellationQuote(
    booking: Pick<
      Booking,
      'date' | 'startHour' | 'totalAmountMinor' | 'paymentStatus' | 'status'
    >,
    isProCancelling: boolean,
  ): {
    refundMinor: number;
    payoutMinor: number;
    refundPercent: number;
    payoutPercent: number;
    policy:
      | 'pro_cancel'
      | 'client_unconfirmed'
      | 'client_24h'
      | 'client_2h'
      | 'client_late'
      | 'no_payment';
    hoursUntilBooking: number;
  } {
    // If nothing was paid yet (still AWAITING_PAYMENT), the split doesn't
    // matter - there's no money to move.
    if (
      !booking.totalAmountMinor ||
      booking.paymentStatus !== BookingPaymentStatus.PAID
    ) {
      return {
        refundMinor: 0,
        payoutMinor: 0,
        refundPercent: 0,
        payoutPercent: 0,
        policy: 'no_payment',
        hoursUntilBooking: 0,
      };
    }

    const hoursUntilBooking = this.hoursUntilBooking(
      booking.date,
      booking.startHour,
    );
    const total = booking.totalAmountMinor;

    // Pro cancels: client gets full refund regardless of timing. Strike
    // handled separately (Task #6 + manual admin review).
    if (isProCancelling) {
      return {
        refundMinor: total,
        payoutMinor: 0,
        refundPercent: 100,
        payoutPercent: 0,
        policy: 'pro_cancel',
        hoursUntilBooking,
      };
    }

    // Client cancels while the pro hasn't accepted yet (status PENDING).
    // The 2h / 24h late-cancel penalties only kick in once the pro has
    // CONFIRMED - because that's when the pro has committed and the slot
    // becomes a real loss for them. A still-unconfirmed booking is risk-
    // free for the pro to release, so it'd be unfair to charge the
    // client for a slot the pro never actually claimed.
    if (booking.status === BookingStatus.PENDING) {
      return {
        refundMinor: total,
        payoutMinor: 0,
        refundPercent: 100,
        payoutPercent: 0,
        policy: 'client_unconfirmed',
        hoursUntilBooking,
      };
    }

    // Client cancels: time-based split (only applies once the pro has CONFIRMED).
    if (hoursUntilBooking >= 24) {
      return {
        refundMinor: total,
        payoutMinor: 0,
        refundPercent: 100,
        payoutPercent: 0,
        policy: 'client_24h',
        hoursUntilBooking,
      };
    }
    if (hoursUntilBooking >= 2) {
      const refundMinor = Math.round(total / 2);
      return {
        refundMinor,
        payoutMinor: total - refundMinor,
        refundPercent: 50,
        payoutPercent: 50,
        policy: 'client_2h',
        hoursUntilBooking,
      };
    }
    return {
      refundMinor: 0,
      payoutMinor: total,
      refundPercent: 0,
      payoutPercent: 100,
      policy: 'client_late',
      hoursUntilBooking,
    };
  }

  /**
   * Calculate hours from now until the booking's start. Treats the
   * booking time as Tbilisi local (UTC+4) because that's the canonical
   * marketplace timezone and the app stores `startHour` as wall-clock.
   *
   * Returns a fractional positive value for future bookings, negative
   * for past bookings (caller decides how to interpret).
   */
  private hoursUntilBooking(date: string, startHour: number): number {
    const TBILISI_OFFSET = '+04:00';
    const hh = String(startHour).padStart(2, '0');
    const bookingMs = Date.parse(`${date}T${hh}:00:00${TBILISI_OFFSET}`);
    if (Number.isNaN(bookingMs)) return 0;
    return (bookingMs - Date.now()) / (1000 * 60 * 60);
  }

  /**
   * Raise a dispute. Either party can raise. Creates a Dispute doc, flips
   * the booking to DISPUTED, and freezes the escrow. Admin UI (Task #5)
   * picks up the dispute for review and resolution.
   *
   * Permitted from: IN_PROGRESS or AWAITING_CLIENT_CONFIRMATION (the
   * states where the work is happening or has just happened).
   */
  async raiseDispute(
    bookingId: string,
    userId: string,
    args: {
      type: 'pro_noshow' | 'client_noshow' | 'quality' | 'other';
      description: string;
      evidenceUrls?: string[];
    },
  ): Promise<Booking> {
    // Validate up front - the dispute description ends up rendered in
    // the admin queue + the user-visible status timeline, so cap it.
    // Also cap evidence URL count to prevent unbounded array growth.
    const description = (args.description || '').trim();
    if (!description) {
      throw new BadRequestException('Dispute description is required');
    }
    if (description.length > 2000) {
      throw new BadRequestException(
        'Dispute description is too long (max 2000 characters)',
      );
    }
    if (args.evidenceUrls && args.evidenceUrls.length > 20) {
      throw new BadRequestException(
        'Too many evidence files (max 20)',
      );
    }

    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) throw new NotFoundException('Booking not found');

    const proId = booking.professional.toString();
    const clientId = booking.client.toString();
    if (userId !== proId && userId !== clientId) {
      throw new ForbiddenException('Not authorized to raise dispute');
    }

    const disputableStates: BookingStatus[] = [
      BookingStatus.CONFIRMED,
      BookingStatus.IN_PROGRESS,
      BookingStatus.AWAITING_CLIENT_CONFIRMATION,
    ];
    if (!disputableStates.includes(booking.status)) {
      throw new BadRequestException(
        `Cannot raise a dispute from status ${booking.status}`,
      );
    }
    if (!booking.escrowId) {
      throw new BadRequestException(
        'Cannot raise a dispute: booking has no escrow (was it paid?)',
      );
    }

    const raisedAgainst = userId === proId ? clientId : proId;
    const dispute = await this.disputeModel.create({
      entityType: 'booking',
      entityId: bookingId,
      escrowId: booking.escrowId,
      raisedByUserId: new Types.ObjectId(userId),
      raisedAgainstUserId: new Types.ObjectId(raisedAgainst),
      type: args.type,
      description,
      evidenceUrls: args.evidenceUrls ?? [],
      status: 'open',
    });

    booking.status = BookingStatus.DISPUTED;
    booking.disputeId = dispute._id as Types.ObjectId;
    booking.paymentStatus = BookingPaymentStatus.IN_DISPUTE;
    await booking.save();

    // Freeze the escrow so it can't release/refund until admin acts.
    await this.paymentsService.markEscrowInDispute(
      booking.escrowId.toString(),
      dispute._id.toString(),
    );

    // Notify the other party AND admin (admin via the dispute admin UI -
    // they poll /admin/disputes; no separate notification needed in Phase 1).
    await this.notificationsService.notify(
      raisedAgainst,
      NotificationType.BOOKING_DISPUTED,
      'Dispute raised on your booking',
      args.description.slice(0, 120),
      {
        link: '/bookings',
        referenceId: bookingId,
        referenceModel: 'Booking',
        i18n: {
          titleKey: 'notifications.types.booking_disputed.title',
          messageKey: 'notifications.types.booking_disputed.message',
        },
      },
    );

    return booking;
  }

  private validateAgainstSchedule(
    pro: any,
    date: string,
    startHour: number,
    endHour: number,
  ): void {
    const dayOfWeek = this.getDayOfWeek(date);

    const override = (pro.scheduleOverrides || []).find((o: any) => o.date === date);
    if (override?.isBlocked) {
      throw new BadRequestException('Professional is not available on this date');
    }

    let schedStart: number;
    let schedEnd: number;

    if (override && !override.isBlocked && override.startHour != null && override.endHour != null) {
      schedStart = override.startHour;
      schedEnd = override.endHour;
    } else {
      const daySchedule = (pro.weeklySchedule || []).find((d: any) => d.dayOfWeek === dayOfWeek);
      if (!daySchedule || !daySchedule.isAvailable) {
        throw new BadRequestException('Professional is not available on this day');
      }
      schedStart = daySchedule.startHour;
      schedEnd = daySchedule.endHour;
    }

    if (startHour < schedStart || endHour > schedEnd) {
      throw new BadRequestException('Requested time is outside professional\'s availability');
    }
  }

  private async checkConflicts(
    proId: string,
    date: string,
    startHour: number,
    endHour: number,
  ): Promise<void> {
    const conflict = await this.bookingModel.findOne({
      professional: new Types.ObjectId(proId),
      date,
      // Same set as getAvailability above - any "holding" status blocks new
      // bookings on the same slot.
      status: {
        $in: [
          BookingStatus.AWAITING_PAYMENT,
          BookingStatus.PENDING,
          BookingStatus.CONFIRMED,
          BookingStatus.IN_PROGRESS,
          BookingStatus.AWAITING_CLIENT_CONFIRMATION,
          BookingStatus.DISPUTED,
        ],
      },
      $or: [
        { startHour: { $lt: endHour }, endHour: { $gt: startHour } },
      ],
    });

    if (conflict) {
      throw new BadRequestException('This time slot is already booked');
    }
  }

  private generateSlots(
    startHour: number,
    endHour: number,
    bookings: any[],
  ): { hour: number; available: boolean }[] {
    const slots: { hour: number; available: boolean }[] = [];

    for (let h = 6; h < 22; h++) {
      const withinSchedule = h >= startHour && h < endHour;
      const isBooked = bookings.some(
        (b) => h >= b.startHour && h < b.endHour,
      );
      slots.push({ hour: h, available: withinSchedule && !isBooked });
    }

    return slots;
  }

  private getDayOfWeek(dateStr: string): number {
    const d = new Date(dateStr + 'T12:00:00Z');
    // JS: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
    const jsDay = d.getUTCDay();
    return jsDay === 0 ? 6 : jsDay - 1;
  }
}
