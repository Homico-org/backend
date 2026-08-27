import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

/**
 * One row per payment ATTEMPT - whether it succeeded, failed, was cancelled,
 * or is still pending. Stores the bridge between Homico's internal entities
 * (bookings, project milestones) and the external payment provider's intent.
 *
 * Amounts are stored in MINOR units (tetri for GEL) to avoid floating-point
 * arithmetic on currency. A `1000 amountMinor` for GEL means 10.00 GEL.
 *
 * `providerIntentId` is the provider's canonical reference (e.g. Flitt's
 * order_id). This is also our idempotency key - webhooks with the same
 * providerIntentId are safe to handle multiple times.
 */

export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded";

export type PaymentEntityType =
  | "booking"
  | "project_milestone"
  | "premium"
  | "product_order"
  | "cancellation_fee";

export type PaymentProviderName = "mock" | "flitt";

@Schema({ timestamps: true, collection: "payments" })
export class Payment extends Document {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  userId: Types.ObjectId;

  /**
   * Who will receive the money when escrow releases. Stored on the Payment
   * (not just the Escrow) because we need it at escrow-creation time and
   * can't trust the provider to echo our metadata back unchanged.
   */
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  payeeUserId: Types.ObjectId;

  @Prop({ required: true, index: true })
  provider: PaymentProviderName;

  /**
   * Provider's canonical reference (Flitt order_id). Unique per provider -
   * we use the (provider, providerIntentId)
   * pair as our idempotency key when handling webhooks.
   */
  @Prop({ required: true, index: true })
  providerIntentId: string;

  @Prop({ required: true })
  amountMinor: number;

  @Prop({ required: true, default: "GEL" })
  currency: string;

  @Prop({
    required: true,
    enum: [
      "pending",
      "succeeded",
      "failed",
      "cancelled",
      "refunded",
      "partially_refunded",
    ],
    default: "pending",
    index: true,
  })
  status: PaymentStatus;

  @Prop({
    required: true,
    enum: [
      "booking",
      "project_milestone",
      "premium",
      "product_order",
      "cancellation_fee",
    ],
    index: true,
  })
  entityType: PaymentEntityType;

  @Prop({ required: true, index: true })
  entityId: string;

  /** Cumulative refunded amount in minor units. Equals amountMinor when fully refunded. */
  @Prop({ required: true, default: 0 })
  refundedAmountMinor: number;

  /** Raw provider payload, useful for support / debugging. */
  @Prop({ type: Object })
  providerRawData?: unknown;

  /**
   * Our own correlation metadata (entity ids, and for premium: tier, period,
   * promoCode). Persisted so the grant step + admin reporting can read the
   * plan/promo from the Payment alone without re-deriving from entityId.
   */
  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  /** Hosted-page URL the user was redirected to. Kept for support / audit. */
  @Prop()
  redirectUrl?: string;

  /** When the provider confirmed success (succeeded transition). */
  @Prop()
  succeededAt?: Date;

  /** When the user was redirected back to our return URL. */
  @Prop()
  returnedAt?: Date;

  // Mongoose adds these via `timestamps: true`. Declared here so TypeScript
  // sees them on the schema class (otherwise .toObject() doesn't satisfy
  // PaymentDoc which lists them).
  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.index({ provider: 1, providerIntentId: 1 }, { unique: true });
PaymentSchema.index({ entityType: 1, entityId: 1 });

/**
 * Plain-object shape from `.lean()` queries. Mirrors schema without mongoose
 * Document inheritance noise.
 */
export interface PaymentDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  payeeUserId: Types.ObjectId;
  provider: PaymentProviderName;
  providerIntentId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  entityType: PaymentEntityType;
  entityId: string;
  refundedAmountMinor: number;
  providerRawData?: unknown;
  redirectUrl?: string;
  succeededAt?: Date;
  returnedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
