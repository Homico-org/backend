import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document, Types } from "mongoose";

/**
 * A push Expo accepted but has not yet confirmed delivery for.
 *
 * Expo's send call returns a *ticket* (queued), not proof of delivery. The
 * real outcome - including a revoked APNs cert or a token that died between
 * send and delivery - only shows up in the *receipt*, available a few minutes
 * later. These rows are the queue of receipts still to be collected; they are
 * deleted once read.
 */
@Schema({ timestamps: true, collection: "push_receipts" })
export class PushReceipt {
  @Prop({ type: String, required: true, unique: true, index: true })
  ticketId: string;

  @Prop({ type: Types.ObjectId, ref: "User", required: true, index: true })
  userId: Types.ObjectId;

  /** Kept so a failed receipt can prune the exact token that failed. */
  @Prop({ type: String, required: true })
  token: string;
}

export type PushReceiptDocument = PushReceipt & Document;
export const PushReceiptSchema = SchemaFactory.createForClass(PushReceipt);

// Receipts are only available for ~24h; anything older is unreadable, so let
// Mongo expire the row rather than polling it forever.
PushReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });
