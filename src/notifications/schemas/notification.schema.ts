import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum NotificationType {
  // Job related
  NEW_PROPOSAL = 'new_proposal',
  PROPOSAL_ACCEPTED = 'proposal_accepted',
  PROPOSAL_REJECTED = 'proposal_rejected',
  JOB_COMPLETED = 'job_completed',
  JOB_CANCELLED = 'job_cancelled',

  // Message related
  NEW_MESSAGE = 'new_message',

  // Review related
  NEW_REVIEW = 'new_review',

  // System related
  ACCOUNT_VERIFIED = 'account_verified',
  PROFILE_UPDATE = 'profile_update',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
}

@Schema({ timestamps: true })
export class Notification extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(NotificationType),
    required: true,
  })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: Boolean, default: false, index: true })
  isRead: boolean;

  @Prop({ type: String })
  link?: string;

  @Prop({ type: Types.ObjectId, refPath: 'referenceModel' })
  referenceId?: Types.ObjectId;

  @Prop({ type: String, enum: ['Job', 'User', 'Review', 'Message', 'Proposal'] })
  referenceModel?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Compound index for efficient queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
