import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum NotificationType {
  // Job related
  NEW_PROPOSAL = 'new_proposal',
  PROPOSAL_ACCEPTED = 'proposal_accepted',
  PROPOSAL_REJECTED = 'proposal_rejected',
  JOB_COMPLETED = 'job_completed',
  JOB_CANCELLED = 'job_cancelled',
  JOB_INVITATION = 'job_invitation',

  // Message related
  NEW_MESSAGE = 'new_message',

  // Project related
  PROJECT_MESSAGE = 'project_message',
  PROJECT_POLL_CREATED = 'project_poll_created',
  PROJECT_POLL_VOTED = 'project_poll_voted',
  PROJECT_POLL_APPROVED = 'project_poll_approved',
  PROJECT_MATERIAL_ADDED = 'project_material_added',
  PROJECT_STAGE_CHANGED = 'project_stage_changed',

  // Review related
  NEW_REVIEW = 'new_review',

  // System related
  ACCOUNT_VERIFIED = 'account_verified',
  PROFILE_UPDATE = 'profile_update',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
  
  // Admin actions
  PROFILE_APPROVED = 'profile_approved',
  PROFILE_REJECTED = 'profile_rejected',
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
