import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum CompanyJobStatus {
  PENDING = 'pending',           // New job, not assigned
  ASSIGNED = 'assigned',         // Assigned to worker(s)
  IN_PROGRESS = 'in_progress',   // Work started
  COMPLETED = 'completed',       // Work finished
  CANCELLED = 'cancelled',       // Job cancelled
}

export enum JobPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ timestamps: true })
export class CompanyJob extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Company', required: true })
  companyId: Types.ObjectId;

  // Source of the job
  @Prop({ type: Types.ObjectId, ref: 'Job' })
  originalJobId: Types.ObjectId; // If from job marketplace

  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest' })
  projectRequestId: Types.ObjectId; // If from project request

  // Client Info
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop()
  clientName: string;

  @Prop()
  clientPhone: string;

  @Prop()
  clientEmail: string;

  // Job Details
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop()
  category: string;

  @Prop({ type: [String], default: [] })
  skills: string[];

  // Location
  @Prop()
  location: string;

  @Prop()
  address: string;

  @Prop({ type: { lat: Number, lng: Number } })
  coordinates: { lat: number; lng: number };

  // Scheduling
  @Prop()
  scheduledDate: Date;

  @Prop()
  scheduledTime: string;

  @Prop()
  estimatedDuration: string;

  @Prop()
  deadline: Date;

  // Priority & Status
  @Prop({
    type: String,
    enum: Object.values(JobPriority),
    default: JobPriority.MEDIUM,
  })
  priority: JobPriority;

  @Prop({
    type: String,
    enum: Object.values(CompanyJobStatus),
    default: CompanyJobStatus.PENDING,
  })
  status: CompanyJobStatus;

  // Assignment
  @Prop({ type: [{ type: Types.ObjectId, ref: 'CompanyEmployee' }], default: [] })
  assignedEmployees: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'CompanyEmployee' })
  leadEmployee: Types.ObjectId;

  @Prop()
  assignedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedBy: Types.ObjectId;

  // Pricing
  @Prop()
  quotedPrice: number;

  @Prop()
  finalPrice: number;

  @Prop({ default: 'GEL' })
  currency: string;

  @Prop()
  paymentStatus: string;

  // Progress
  @Prop()
  startedAt: Date;

  @Prop()
  completedAt: Date;

  @Prop({ type: [String], default: [] })
  progressNotes: string[];

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: [String], default: [] })
  completionPhotos: string[];

  // Rating (after completion)
  @Prop()
  clientRating: number;

  @Prop()
  clientReview: string;

  // Internal Notes
  @Prop()
  internalNotes: string;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const CompanyJobSchema = SchemaFactory.createForClass(CompanyJob);

CompanyJobSchema.index({ companyId: 1 });
CompanyJobSchema.index({ clientId: 1 });
CompanyJobSchema.index({ status: 1 });
CompanyJobSchema.index({ companyId: 1, status: 1 });
CompanyJobSchema.index({ assignedEmployees: 1 });
CompanyJobSchema.index({ scheduledDate: 1 });
CompanyJobSchema.index({ createdAt: -1 });
