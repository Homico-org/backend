import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProjectType {
  QUICK = 'quick',      // Small quick jobs (< 1 day)
  PROJECT = 'project',  // Medium projects (days to weeks)
  JOB = 'job',          // Large jobs (weeks to months)
}

export enum ProjectStatus {
  COMPLETED = 'completed',
  IN_PROGRESS = 'in_progress',
}

@Schema({ timestamps: true })
export class PortfolioItem extends Document {
  @Prop({ type: Types.ObjectId, ref: 'ProProfile', required: true })
  proId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop()
  projectDate: Date;

  @Prop()
  completedDate: Date;

  @Prop()
  location: string;

  @Prop({ default: 0 })
  displayOrder: number;

  // Project type categorization
  @Prop({
    type: String,
    enum: Object.values(ProjectType),
    default: ProjectType.PROJECT
  })
  projectType: ProjectType;

  @Prop({
    type: String,
    enum: Object.values(ProjectStatus),
    default: ProjectStatus.COMPLETED
  })
  status: ProjectStatus;

  // Client information
  @Prop({ type: Types.ObjectId, ref: 'User' })
  clientId: Types.ObjectId;

  @Prop()
  clientName: string;

  @Prop()
  clientAvatar: string;

  @Prop()
  clientCity: string;

  // Project details
  @Prop()
  duration: string; // e.g., "2 days", "1 week", "3 months"

  @Prop()
  category: string;

  @Prop({ type: Number })
  rating: number;

  @Prop()
  review: string;

  // Before/After images
  @Prop()
  beforeImage: string;

  @Prop()
  afterImage: string;
}

export const PortfolioItemSchema = SchemaFactory.createForClass(PortfolioItem);

PortfolioItemSchema.index({ proId: 1 });
PortfolioItemSchema.index({ tags: 1 });
PortfolioItemSchema.index({ projectType: 1 });
PortfolioItemSchema.index({ clientId: 1 });
