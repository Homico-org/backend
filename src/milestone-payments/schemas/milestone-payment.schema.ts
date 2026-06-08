import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * A single installment in a renovation engagement's payment schedule.
 *
 * This is a STANDALONE collection (like Booking), not embedded on the project,
 * because two different surfaces act on it: the client funds/confirms from the
 * project page, and the pro proposes/marks-done from their /my-space order.
 * Embedding on ProjectRequest would lock the pro out (they have no project
 * access). The document's own _id is the Escrow/Payment `entityId`.
 *
 * Money lives in the shared payments engine (Payment + Escrow): funding rides
 * `createIntentForEntity({ entityType: 'project_milestone' })`, release rides
 * `markEscrowPendingRelease`, disputes ride the existing Dispute flow. This
 * doc only carries the schedule lifecycle + a projection of the escrow state.
 */
export enum MilestonePaymentStatus {
  /** Pro drafted it; awaiting the client's approval. */
  PROPOSED = 'proposed',
  /** Client approved the schedule; the installment is now fundable. */
  APPROVED = 'approved',
  /** Client rejected this installment. */
  DECLINED = 'declined',
  /** Client paid; money is held in escrow. */
  FUNDED = 'funded',
  /** Pro marked the work done; the auto-confirm timer is running. */
  SUBMITTED = 'submitted',
  /** Client confirmed (or auto-confirmed); escrow is pending_release. */
  CONFIRMED = 'confirmed',
  /** Paid out to the pro. */
  RELEASED = 'released',
  /** Frozen while a dispute is resolved. */
  IN_DISPUTE = 'in_dispute',
  /** Money returned to the client. */
  REFUNDED = 'refunded',
  /** Cancelled before any money moved. */
  CANCELLED = 'cancelled',
}

export type MilestonePaymentDocument = MilestonePayment & Document;

@Schema({ timestamps: true, collection: 'milestonepayments' })
export class MilestonePayment extends Document {
  // --- Context (denormalized at propose time so auth/display need no joins) ---
  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest', required: true, index: true })
  projectId: Types.ObjectId;

  /** The engagement's stable id within the project (e.g. "E1"). */
  @Prop({ required: true, index: true })
  engagementId: string;

  /** Payer / project owner. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  clientId: Types.ObjectId;

  /** Payee / assigned pro (the engagement's assignedProId). */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  proId: Types.ObjectId;

  /** Role label snapshot for display ("Plumber (Main)"). */
  @Prop({ default: '' })
  roleLabel: string;

  // --- The installment itself ---
  /** Human label: "Deposit", "After demolition sign-off". User content. */
  @Prop({ required: true })
  label: string;

  /** Amount the client pays, in minor units (tetri). Pro nets 95% (5% fee). */
  @Prop({ required: true })
  amountMinor: number;

  @Prop({ default: 'GEL' })
  currency: string;

  /** Order within the engagement's schedule. */
  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({
    type: String,
    enum: Object.values(MilestonePaymentStatus),
    default: MilestonePaymentStatus.PROPOSED,
    index: true,
  })
  status: MilestonePaymentStatus;

  // --- Payment/escrow projection (mirrors Booking) ---
  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  paymentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Escrow' })
  escrowId?: Types.ObjectId;

  /** Latest provider payment status: pending | succeeded | failed | ... */
  @Prop()
  paymentStatus?: string;

  @Prop({ type: Types.ObjectId, ref: 'Dispute' })
  disputeId?: Types.ObjectId;

  // --- Lifecycle stamps ---
  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: Date })
  fundedAt?: Date;

  /** When the pro marked the work done - starts the 7-day auto-confirm timer. */
  @Prop({ type: Date })
  proMarkedDoneAt?: Date;

  @Prop({ type: Date })
  clientConfirmedAt?: Date;
}

export const MilestonePaymentSchema =
  SchemaFactory.createForClass(MilestonePayment);

MilestonePaymentSchema.index({ projectId: 1, engagementId: 1, sortOrder: 1 });
MilestonePaymentSchema.index({ proId: 1, status: 1 });
MilestonePaymentSchema.index({ clientId: 1, status: 1 });
