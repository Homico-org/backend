import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

/**
 * A batch of escrows being paid out to a single pro. In Phase 1, admin
 * creates these manually via /admin/payouts (groups all PENDING_RELEASE
 * escrows for one pro, marks the bank transfer as done).
 *
 * In Phase 3, a scheduled job creates these automatically and triggers
 * bank-API transfers.
 *
 * `proBankAccountSnapshot` freezes the bank details AT PAYOUT TIME so
 * later changes to the pro's bank account don't make historical payouts
 * look like they went somewhere else.
 */

export type PayoutStatus = "pending" | "processed" | "failed";

export interface BankAccountSnapshot {
  bankCode: string;
  accountNumber: string;
  holderName: string;
}

@Schema({ timestamps: true, collection: "payouts" })
export class Payout extends Document {
  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  proUserId: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: "Escrow" }], default: [] })
  escrowIds: Types.ObjectId[];

  @Prop({ required: true })
  totalAmountMinor: number;

  @Prop({ required: true, default: "GEL" })
  currency: string;

  @Prop({
    required: true,
    enum: ["pending", "processed", "failed"],
    default: "pending",
    index: true,
  })
  status: PayoutStatus;

  @Prop({
    type: {
      bankCode: { type: String, required: true },
      accountNumber: { type: String, required: true },
      holderName: { type: String, required: true },
    },
    required: true,
  })
  proBankAccountSnapshot: BankAccountSnapshot;

  /** Transfer reference number admin records after sending the wire. */
  @Prop({ trim: true })
  transferReference?: string;

  @Prop({ type: Types.ObjectId, ref: "User" })
  processedByUserId?: Types.ObjectId;

  @Prop()
  processedAt?: Date;

  @Prop({ trim: true })
  notes?: string;

  // Mongoose adds these via `timestamps: true`. Declared so TypeScript
  // sees them on the schema class for .toObject() calls.
  createdAt: Date;
  updatedAt: Date;
}

export const PayoutSchema = SchemaFactory.createForClass(Payout);

PayoutSchema.index({ proUserId: 1, status: 1, createdAt: -1 });

export interface PayoutDoc {
  _id: Types.ObjectId;
  proUserId: Types.ObjectId;
  escrowIds: Types.ObjectId[];
  totalAmountMinor: number;
  currency: string;
  status: PayoutStatus;
  proBankAccountSnapshot: BankAccountSnapshot;
  transferReference?: string;
  processedByUserId?: Types.ObjectId;
  processedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
