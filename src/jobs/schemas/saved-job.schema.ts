import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class SavedJob extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Job', required: true })
  jobId: Types.ObjectId;
}

export const SavedJobSchema = SchemaFactory.createForClass(SavedJob);

// Compound unique index to prevent duplicate saves
SavedJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
// For getting user's saved jobs efficiently
SavedJobSchema.index({ userId: 1, createdAt: -1 });
