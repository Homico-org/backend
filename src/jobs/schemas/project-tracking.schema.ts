import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProjectStage {
  HIRED = 'hired',
  STARTED = 'started',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true })
export class ProjectComment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar?: string;

  @Prop({ required: true, enum: ['client', 'pro'] })
  userRole: 'client' | 'pro';

  @Prop({ default: '' })
  content: string;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectCommentSchema = SchemaFactory.createForClass(ProjectComment);

@Schema({ timestamps: true })
export class ProjectAttachment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  @Prop({ required: true })
  uploaderName: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  fileType: string; // image, document, video, other

  @Prop()
  fileSize?: number; // in bytes

  @Prop()
  description?: string;

  @Prop({ type: Date, default: Date.now })
  uploadedAt: Date;
}

export const ProjectAttachmentSchema = SchemaFactory.createForClass(ProjectAttachment);

@Schema({ timestamps: true })
export class StageHistory {
  @Prop({ type: String, enum: Object.values(ProjectStage), required: true })
  stage: ProjectStage;

  @Prop({ type: Date, required: true })
  enteredAt: Date;

  @Prop({ type: Date })
  exitedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  changedBy?: Types.ObjectId;

  @Prop()
  note?: string;
}

export const StageHistorySchema = SchemaFactory.createForClass(StageHistory);

// Comprehensive history event types
export enum ProjectHistoryEventType {
  // Stage changes
  STAGE_CHANGED = 'stage_changed',

  // Poll events
  POLL_CREATED = 'poll_created',
  POLL_VOTED = 'poll_voted',
  POLL_CLOSED = 'poll_closed',
  POLL_OPTION_SELECTED = 'poll_option_selected',

  // Resource/Material events
  RESOURCE_ADDED = 'resource_added',
  RESOURCE_REMOVED = 'resource_removed',
  RESOURCE_EDITED = 'resource_edited',
  RESOURCE_ITEM_ADDED = 'resource_item_added',
  RESOURCE_ITEM_REMOVED = 'resource_item_removed',
  RESOURCE_ITEM_EDITED = 'resource_item_edited',
  RESOURCE_REACTION = 'resource_reaction',

  // Attachment events
  ATTACHMENT_ADDED = 'attachment_added',
  ATTACHMENT_REMOVED = 'attachment_removed',

  // Message events (optional, for key messages)
  MESSAGE_SENT = 'message_sent',

  // Project events
  PROJECT_CREATED = 'project_created',
  PROJECT_COMPLETED = 'project_completed',
  PRICE_UPDATED = 'price_updated',
  DEADLINE_UPDATED = 'deadline_updated',
}

@Schema({ timestamps: true })
export class ProjectHistoryEvent {
  @Prop({ type: String, enum: Object.values(ProjectHistoryEventType), required: true })
  eventType: ProjectHistoryEventType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar?: string;

  @Prop({ required: true, enum: ['client', 'pro', 'system'] })
  userRole: 'client' | 'pro' | 'system';

  @Prop({ type: Object })
  metadata?: {
    // For stage changes
    fromStage?: string;
    toStage?: string;

    // For polls
    pollId?: string;
    pollTitle?: string;
    optionText?: string;

    // For resources
    resourceId?: string;
    resourceName?: string;
    itemId?: string;
    itemName?: string;
    reactionType?: string;

    // For attachments
    fileName?: string;
    fileUrl?: string;

    // For price/deadline updates
    oldValue?: string | number;
    newValue?: string | number;

    // Generic description
    description?: string;
  };

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectHistoryEventSchema = SchemaFactory.createForClass(ProjectHistoryEvent);

@Schema({ timestamps: true })
export class ProjectTracking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, unique: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Proposal', required: true })
  proposalId: Types.ObjectId;

  // Current stage
  @Prop({
    type: String,
    enum: Object.values(ProjectStage),
    default: ProjectStage.HIRED,
  })
  currentStage: ProjectStage;

  // Progress percentage (0-100)
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  progress: number;

  // Timeline
  @Prop({ type: Date })
  hiredAt: Date;

  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  expectedEndDate?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // Stage history for tracking transitions
  @Prop({ type: [StageHistorySchema], default: [] })
  stageHistory: StageHistory[];

  // Comments/Notes
  @Prop({ type: [ProjectCommentSchema], default: [] })
  comments: ProjectComment[];

  // Attachments
  @Prop({ type: [ProjectAttachmentSchema], default: [] })
  attachments: ProjectAttachment[];

  // Comprehensive history log
  @Prop({ type: [ProjectHistoryEventSchema], default: [] })
  history: ProjectHistoryEvent[];

  // Quick notes for each stage (set by pro)
  @Prop({ type: Map, of: String })
  stageNotes?: Map<string, string>;

  // Agreed price from proposal
  @Prop({ type: Number })
  agreedPrice?: number;

  // Estimated duration from proposal
  @Prop({ type: Number })
  estimatedDuration?: number;

  @Prop()
  estimatedDurationUnit?: string;
}

export const ProjectTrackingSchema = SchemaFactory.createForClass(ProjectTracking);

// Create indexes
ProjectTrackingSchema.index({ jobId: 1 });
ProjectTrackingSchema.index({ clientId: 1 });
ProjectTrackingSchema.index({ proId: 1 });
ProjectTrackingSchema.index({ currentStage: 1 });
