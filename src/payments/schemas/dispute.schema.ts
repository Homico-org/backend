import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";
import { PaymentEntityType } from "./payment.schema";

/**
 * A dispute is a disagreement requiring admin review. Created when either
 * party presses "report issue" (pro/client no-show, quality issue, cancellation
 * disagreement). While open, the associated Escrow has status `in_dispute`
 * and cannot release.
 *
 * Resolution outcomes:
 *   - resolved_for_client  -> refund full amount to client
 *   - resolved_for_pro     -> release full amount to pro
 *   - split                -> partial refund + partial release; admin sets
 *                             refundAmountMinor and payoutAmountMinor explicitly
 *   - rejected             -> no money moves (e.g. spurious dispute); release
 *                             proceeds normally
 */

export type DisputeType =
  | "pro_noshow"
  | "client_noshow"
  | "quality"
  | "cancellation"
  | "other";

export type DisputeStatus =
  | "open"
  | "resolved_for_client"
  | "resolved_for_pro"
  | "split"
  | "rejected";

@Schema({ timestamps: true, collection: "disputes" })
export class Dispute extends Document {
  @Prop({ required: true, enum: ["booking", "project_milestone"], index: true })
  entityType: PaymentEntityType;

  @Prop({ required: true, index: true })
  entityId: string;

  @Prop({ type: Types.ObjectId, ref: "Escrow", required: true, index: true })
  escrowId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  raisedByUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: "User", required: true })
  raisedAgainstUserId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ["pro_noshow", "client_noshow", "quality", "cancellation", "other"],
    index: true,
  })
  type: DisputeType;

  @Prop({ required: true, trim: true })
  description: string;

  /** URLs of evidence uploaded via /upload (photos, documents). */
  @Prop({ type: [String], default: [] })
  evidenceUrls: string[];

  @Prop({
    required: true,
    enum: [
      "open",
      "resolved_for_client",
      "resolved_for_pro",
      "split",
      "rejected",
    ],
    default: "open",
    index: true,
  })
  status: DisputeStatus;

  /** Admin's notes explaining the resolution. */
  @Prop({ trim: true })
  resolution?: string;

  /** Amount refunded to client (in minor units). Set when status becomes
   *  resolved_for_client or split. */
  @Prop({ default: 0 })
  refundAmountMinor: number;

  /** Amount released to pro (in minor units). Set when status becomes
   *  resolved_for_pro or split. */
  @Prop({ default: 0 })
  payoutAmountMinor: number;

  @Prop({ type: Types.ObjectId, ref: "User" })
  resolvedByUserId?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;

  // Mongoose adds these via `timestamps: true`. Declared so TypeScript
  // sees them on the schema class for .toObject() calls.
  createdAt: Date;
  updatedAt: Date;
}

export const DisputeSchema = SchemaFactory.createForClass(Dispute);

DisputeSchema.index({ status: 1, createdAt: -1 }); // admin queue: open disputes, newest first

export interface DisputeDoc {
  _id: Types.ObjectId;
  entityType: PaymentEntityType;
  entityId: string;
  escrowId: Types.ObjectId;
  raisedByUserId: Types.ObjectId;
  raisedAgainstUserId: Types.ObjectId;
  type: DisputeType;
  description: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  resolution?: string;
  refundAmountMinor: number;
  payoutAmountMinor: number;
  resolvedByUserId?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
