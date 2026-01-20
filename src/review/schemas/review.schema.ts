import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ReviewSource {
  HOMICO = 'homico',      // From completed Homico job
  EXTERNAL = 'external',  // From review request link
}

@Schema({ timestamps: true })
export class Review extends Document {
  // Legacy field - kept for backwards compatibility
  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest' })
  projectId?: Types.ObjectId;

  // New field - reference to Job
  @Prop({ type: Types.ObjectId, ref: 'Job' })
  jobId?: Types.ObjectId;

  // For Homico reviews - the registered client
  @Prop({ type: Types.ObjectId, ref: 'User' })
  clientId?: Types.ObjectId;

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

  // Review source - homico or external
  @Prop({ 
    type: String, 
    enum: Object.values(ReviewSource), 
    default: ReviewSource.HOMICO 
  })
  source: ReviewSource;

  // External review fields
  @Prop()
  externalClientName?: string;

  @Prop()
  externalClientPhone?: string;

  @Prop()
  externalClientEmail?: string;

  @Prop()
  externalVerifiedAt?: Date;

  // Token used to submit the review (for tracking)
  @Prop()
  reviewRequestToken?: string;

  // Anonymous review option
  @Prop({ default: false })
  isAnonymous: boolean;

  // Project title for external reviews (since no job reference)
  @Prop()
  projectTitle?: string;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ proId: 1, createdAt: -1 });
ReviewSchema.index({ clientId: 1 });
ReviewSchema.index({ projectId: 1 });
ReviewSchema.index({ jobId: 1 });
ReviewSchema.index({ rating: 1 });
