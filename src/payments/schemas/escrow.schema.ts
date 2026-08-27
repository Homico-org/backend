import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { PaymentEntityType } from "./payment.schema";

/**
 * Represents money Homico is HOLDING on behalf of one party for the benefit
 * of another. One Escrow per booking (or per project milestone).
 *
 * Created when a payment SUCCEEDS, never before. Status transitions:
 *   held -> pending_release -> released
 *   held -> refunded         (full cancellation)
 *   held -> partially_refunded (cancellation with split)
 *   held -> in_dispute -> (admin resolution) -> released/refunded/split
 *
 * `payeeUserId` is who receives the money when released (the pro).
 * `payerUserId` is who paid in (the client). Both are kept on the escrow
 * directly so we don't have to join through bookings/projects for payout UI.
 *
 * `platformFeeMinor` is Homico's cut, deducted from the payout to the pro.
 * Computed at escrow-creation time and frozen so fee changes don't
 * retroactively affect in-flight escrows.
 */

export type EscrowStatus =
  | "held"
  | "pending_release"
  | "released"
  | "refunded"
  | "partially_refunded"
  | "in_dispute";

@Schema({ timestamps: true, collection: "escrows" })
export class Escrow extends Document {
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

  @Prop({ type: Types.ObjectId, ref: "Payment", required: true, index: true })
  paymentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  payerUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  payeeUserId: Types.ObjectId;

  @Prop({ required: true })
  amountHeldMinor: number;

  /** Homico's fee, deducted from the payout to the pro. */
  @Prop({ required: true })
  platformFeeMinor: number;

  @Prop({ required: true, default: "GEL" })
  currency: string;

  @Prop({
    required: true,
    enum: [
      "held",
      "pending_release",
      "released",
      "refunded",
      "partially_refunded",
      "in_dispute",
    ],
    default: "held",
    index: true,
  })
  status: EscrowStatus;

  /** When the escrow moved from PENDING_RELEASE to RELEASED. */
  @Prop()
  releasedAt?: Date;

  /** Link to the Payout that included this escrow. */
  @Prop({ type: Types.ObjectId, ref: "Payout" })
  releasedToPayoutId?: Types.ObjectId;

  /** When admin/policy moved this to REFUNDED or PARTIALLY_REFUNDED. */
  @Prop()
  refundedAt?: Date;

  /** Cumulative refunded amount (in minor units). */
  @Prop({ required: true, default: 0 })
  refundedAmountMinor: number;

  /** Active dispute, if any. */
  @Prop({ type: Types.ObjectId, ref: "Dispute" })
  disputeId?: Types.ObjectId;

  // Mongoose adds these via `timestamps: true`. Declared so TypeScript
  // sees them on the schema class for .toObject() calls.
  createdAt: Date;
  updatedAt: Date;
}

export const EscrowSchema = SchemaFactory.createForClass(Escrow);

// Unique: exactly one escrow per entity (booking / milestone / order). Without
// this, two concurrent payment-success paths (e.g. the return page polling
// reconcile every 1.5s) both pass the findOne guard in createEscrow and insert
// duplicate escrows. The unique index makes the second insert fail (E11000),
// which createEscrow catches and resolves to the existing row.
EscrowSchema.index({ entityType: 1, entityId: 1 }, { unique: true });
EscrowSchema.index({ payeeUserId: 1, status: 1 }); // pro payout listings
EscrowSchema.index({ payerUserId: 1, status: 1 }); // client refund listings

export interface EscrowDoc {
  _id: Types.ObjectId;
  entityType: PaymentEntityType;
  entityId: string;
  paymentId: Types.ObjectId;
  payerUserId: Types.ObjectId;
  payeeUserId: Types.ObjectId;
  amountHeldMinor: number;
  platformFeeMinor: number;
  currency: string;
  status: EscrowStatus;
  releasedAt?: Date;
  releasedToPayoutId?: Types.ObjectId;
  refundedAt?: Date;
  refundedAmountMinor: number;
  disputeId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
