import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Review extends Document {
  // Legacy field - kept for backwards compatibility
  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest' })
  projectId?: Types.ObjectId;

  // New field - reference to Job
  @Prop({ type: Types.ObjectId, ref: 'Job' })
  jobId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop()
  text: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Review' })
  proResponseId: Types.ObjectId;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ proId: 1, createdAt: -1 });
ReviewSchema.index({ clientId: 1 });
ReviewSchema.index({ projectId: 1 });
ReviewSchema.index({ jobId: 1 });
ReviewSchema.index({ rating: 1 });
