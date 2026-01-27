import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class JobComment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  authorId: Types.ObjectId;

  @Prop({ required: true, maxlength: 2000 })
  content: string;

  // Optional: Pro can share their phone number
  @Prop({ type: String })
  phoneNumber?: string;

  // Optional: Pro can share portfolio project IDs
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Portfolio' }], default: [] })
  portfolioItems: Types.ObjectId[];

  // Whether to show a link to the pro's full profile
  @Prop({ type: Boolean, default: true })
  showProfile: boolean;

  // For nested replies - reference to parent comment
  @Prop({ type: Types.ObjectId, ref: 'JobComment' })
  parentId?: Types.ObjectId;

  // Depth level (0 = top-level, 1 = reply, etc.) - limit to 2 levels
  @Prop({ type: Number, default: 0 })
  depth: number;

  // Whether this comment is from the job owner (client)
  @Prop({ type: Boolean, default: false })
  isClientReply: boolean;

  // Client can mark a professional as "interesting" / shortlisted
  @Prop({ type: Boolean, default: false })
  isMarkedInteresting: boolean;

  // Soft delete
  @Prop({ type: Boolean, default: false })
  isDeleted: boolean;

  // Populated fields (virtual)
  author?: {
    _id: Types.ObjectId;
    name: string;
    avatar?: string;
    role: string;
    rating?: number;
    completedJobs?: number;
    responseTime?: string;
    skills?: string[];
  };

  replies?: JobComment[];
  portfolioDetails?: {
    _id: Types.ObjectId;
    title: string;
    images: string[];
  }[];
}

export const JobCommentSchema = SchemaFactory.createForClass(JobComment);

// Index for efficient queries
JobCommentSchema.index({ jobId: 1, createdAt: -1 });
JobCommentSchema.index({ jobId: 1, isMarkedInteresting: 1 });
JobCommentSchema.index({ authorId: 1, createdAt: -1 });
