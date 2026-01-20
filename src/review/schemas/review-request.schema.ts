import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ReviewRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  proId: Types.ObjectId;

  // Unique token for the review link
  @Prop({ required: true, unique: true, index: true })
  token: string;

  // Optional: Pro can send invitation to specific phone/email
  @Prop()
  invitedPhone?: string;

  @Prop()
  invitedEmail?: string;

  @Prop()
  invitedName?: string;

  // Tracking
  @Prop({ default: false })
  isUsed: boolean;

  @Prop()
  usedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'Review' })
  reviewId?: Types.ObjectId;

  // For rate limiting - count how many invites sent this month
  @Prop({ default: 0 })
  invitesSentCount: number;

  // Expiration (optional - tokens can expire after X days)
  @Prop()
  expiresAt?: Date;

  // IP tracking for fraud prevention
  @Prop({ type: [String], default: [] })
  accessedFromIps: string[];
}

export const ReviewRequestSchema = SchemaFactory.createForClass(ReviewRequest);

// Index for finding pro's review requests
ReviewRequestSchema.index({ proId: 1, createdAt: -1 });
