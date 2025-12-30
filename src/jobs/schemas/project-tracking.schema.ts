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
