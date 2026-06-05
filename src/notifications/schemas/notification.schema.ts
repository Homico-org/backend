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
  JOB_MATCH = 'job_match',
  DIRECT_REQUEST_TAKEN = 'direct_request_taken',

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

  // Booking related
  NEW_BOOKING = 'new_booking',
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_STARTED = 'booking_started',
  BOOKING_CANCELLED = 'booking_cancelled',
  BOOKING_COMPLETED = 'booking_completed',
  BOOKING_DISPUTED = 'booking_disputed',

  // Review prompt
  REVIEW_PROMPT = 'review_prompt',

  // SLA accountability (added 2026-05). Fired by SlaService when a pro
  // misses a response deadline or has their penalty level change. See
  // `~/.claude/plans/staged-crunching-meadow.md`.
  SLA_WARNING = 'sla_warning',
  SLA_DEMOTED = 'sla_demoted',
  SLA_PAUSED = 'sla_paused',
  SLA_RECOVERED = 'sla_recovered',
  PROFILE_INCOMPLETE_NAG = 'profile_incomplete_nag',
  NEW_ORDER = 'new_order',
  ORDER_UPDATE = 'order_update',
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

  // The English fallback copy. Kept required so legacy documents and
  // surfaces that don't read i18nKey (push, email digests, admin
  // logs) always have something to render.
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  // i18n keys for localized rendering on the frontend (added 2026-05).
  // When present, the bell-icon feed resolves `t(titleKey, params)` /
  // `t(messageKey, params)` against the active locale. The `title` /
  // `message` strings above are the EN fallback used when the i18n
  // map doesn't include the key (e.g. older notification types).
  //
  // Format: `notif.<type>.title`, `notif.<type>.message` - matches
  // the frontend locale namespace.
  @Prop({ type: String })
  titleKey?: string;

  @Prop({ type: String })
  messageKey?: string;

  // Interpolation params for {placeholder}-style values inside the
  // localized title/message (e.g. job title, client name, amount).
  // Stored as a plain object to avoid coupling to a specific i18n
  // library's argument format.
  @Prop({ type: Object })
  i18nParams?: Record<string, string | number>;

  @Prop({ type: Boolean, default: false, index: true })
  isRead: boolean;

  @Prop({ type: String })
  link?: string;

  @Prop({ type: Types.ObjectId, refPath: 'referenceModel' })
  referenceId?: Types.ObjectId;

  @Prop({ type: String, enum: ['Job', 'User', 'Review', 'Message', 'Proposal', 'Booking', 'Order'] })
  referenceModel?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Compound index for efficient queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
