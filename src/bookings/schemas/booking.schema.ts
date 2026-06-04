import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * Booking lifecycle WITH payments (added 2026-05).
 *
 * AWAITING_PAYMENT          - just created, escrow not yet funded.
 *                             15-min timeout auto-cancels if not paid.
 * PENDING                   - paid, awaiting pro confirmation. Money is in escrow.
 * CONFIRMED                 - pro accepted. Money is in escrow.
 * IN_PROGRESS               - pro started work.
 * AWAITING_CLIENT_CONFIRMATION - pro marked work done. Client has 48h to
 *                             confirm or dispute. Auto-confirm fires after 48h.
 * COMPLETED                 - work confirmed by client (or auto-confirmed).
 *                             Escrow moves to PENDING_RELEASE and awaits payout.
 * CANCELLED                 - cancelled by either side. Refund follows policy.
 * DISPUTED                  - either party raised a complaint. Escrow is frozen
 *                             until admin resolves. May exit to COMPLETED,
 *                             CANCELLED, or PARTIALLY_REFUNDED state.
 */
export enum BookingStatus {
  AWAITING_PAYMENT = 'awaiting_payment',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  AWAITING_CLIENT_CONFIRMATION = 'awaiting_client_confirmation',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  DISPUTED = 'disputed',
}

/**
 * Snapshot of the payment side of the booking. Lives on the booking
 * directly so list/detail UIs don't have to join through Payment + Escrow
 * collections to render the right CTA. Authoritative source remains the
 * Payment + Escrow records - this is a cached projection updated by
 * BookingsService.syncPaymentStatus.
 */
export enum BookingPaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  IN_DISPUTE = 'in_dispute',
  RELEASED = 'released',
}

@Schema({ timestamps: true })
export class Booking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  professional: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  client: Types.ObjectId;

  @Prop({ required: true })
  date: string; // "YYYY-MM-DD"

  @Prop({ required: true, min: 0, max: 23 })
  startHour: number;

  @Prop({ required: true, min: 0, max: 23 })
  endHour: number;

  @Prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.AWAITING_PAYMENT,
  })
  status: BookingStatus;

  // === Payment fields (added 2026-05) ===

  /** Cached payment status - projection of Payment + Escrow for fast UI. */
  @Prop({
    type: String,
    enum: Object.values(BookingPaymentStatus),
    default: BookingPaymentStatus.UNPAID,
    index: true,
  })
  paymentStatus: BookingPaymentStatus;

  /** Link to the Payment row (one per booking; recreated on retry). */
  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  paymentId?: Types.ObjectId;

  /** Link to the Escrow row (created on payment success). */
  @Prop({ type: Types.ObjectId, ref: 'Escrow' })
  escrowId?: Types.ObjectId;

  /** Canonical price in MINOR units (tetri for GEL). Derived from
   *  totalAmount * 100 at creation. New code should read this; existing
   *  totalAmount is kept for backwards compatibility with old documents. */
  @Prop({ type: Number })
  totalAmountMinor?: number;

  /** When client confirmed work was done (or auto-confirmation fired). */
  @Prop()
  clientConfirmedAt?: Date;

  /** Active dispute, if any. Same id as in Payments module's Dispute doc. */
  @Prop({ type: Types.ObjectId, ref: 'Dispute' })
  disputeId?: Types.ObjectId;

  /** Set when the no-show ping cron has notified the client. Prevents
   *  the cron from re-pinging on every tick once flagged. */
  @Prop()
  noShowPingedAt?: Date;

  /** When the booking transitioned to PENDING (paid, awaiting pro
   *  confirmation). Stamped by BookingsService on the
   *  AWAITING_PAYMENT -> PENDING transition. Drives the SLA-accept
   *  timer: pro must confirm/decline within 30 min of `pendingSince`
   *  or the SLA cron records a miss. `updatedAt` is too noisy
   *  (changes on every status update) so we keep a dedicated stamp.
   *  Optional because legacy bookings predate this field; the SLA
   *  cron filters via `pendingSince: { $exists: true }`. */
  @Prop()
  pendingSince?: Date;

  /** Latch so the SLA cron doesn't record a duplicate miss for the
   *  same booking on every 5-min tick. Set to true the first time
   *  scanBookings() records a miss for this booking, regardless of
   *  pro's eventual response. */
  @Prop({ default: false })
  slaMissRecorded?: boolean;

  @Prop()
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancelReason?: string;

  @Prop({ type: [Object], default: [] })
  services: {
    serviceKey: string;
    name: string;
    nameKa: string;
    quantity: number;
    unitPrice: number;
    unit: string;
    discount: number;
    subtotal: number;
  }[];

  @Prop({ default: 0 })
  totalAmount: number;

  // ISO 4217 currency code (added 2026-05). Inherits from the pro's
  // country at booking time. Stored alongside `totalAmount` so a future
  // FX-rate change can never corrupt historical booking totals.
  @Prop({ type: String, default: undefined })
  currency: string;

  // ISO 3166-1 alpha-2 country code where the service is performed
  // (added 2026-05). Mirrors the job's country. Indexed so we can scope
  // admin dashboards and earnings reports per marketplace.
  @Prop({ type: String, index: true })
  country: string;

  @Prop()
  address?: string;

  @Prop({ type: [String], default: [] })
  beforePhotos: string[];

  @Prop({ type: [String], default: [] })
  afterPhotos: string[];

  @Prop({ type: [String], default: [] })
  videos: string[];

  @Prop()
  startedAt: Date;

  @Prop()
  completedAt: Date;

  // === Project umbrella linkage (2026-05) ===
  // Set when this booking fills a role inside a Project. On completion the
  // parent engagement is marked completed (transitionToCompleted).
  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest', index: true })
  projectId?: Types.ObjectId;

  @Prop({ type: String })
  engagementId?: string;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index({ professional: 1, date: 1, status: 1 });
BookingSchema.index({ client: 1, status: 1, createdAt: -1 });
