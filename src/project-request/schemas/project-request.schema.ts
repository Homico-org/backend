import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProjectStatus {
  NEW = 'new',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class ProjectRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  proId: Types.ObjectId;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  location: string;

  @Prop()
  address: string;

  @Prop()
  budgetMin: number;

  @Prop()
  budgetMax: number;

  @Prop()
  currency: string;

  @Prop()
  estimatedStartDate: Date;

  @Prop()
  estimatedEndDate: Date;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({
    type: String,
    enum: Object.values(ProjectStatus),
    default: ProjectStatus.NEW
  })
  status: ProjectStatus;

  @Prop()
  acceptedOfferId: Types.ObjectId;
}

export const ProjectRequestSchema = SchemaFactory.createForClass(ProjectRequest);

ProjectRequestSchema.index({ clientId: 1 });
ProjectRequestSchema.index({ proId: 1 });
ProjectRequestSchema.index({ category: 1 });
ProjectRequestSchema.index({ status: 1 });
ProjectRequestSchema.index({ location: 1 });
ProjectRequestSchema.index({ createdAt: -1 });
