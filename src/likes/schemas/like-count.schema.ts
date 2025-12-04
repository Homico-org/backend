import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LikeTargetType } from './like.schema';

@Schema({ timestamps: true })
export class LikeCount extends Document {
  @Prop({
    type: String,
    enum: Object.values(LikeTargetType),
    required: true,
  })
  targetType: LikeTargetType;

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ default: 0 })
  count: number;
}

export const LikeCountSchema = SchemaFactory.createForClass(LikeCount);

// Unique index for target
LikeCountSchema.index({ targetType: 1, targetId: 1 }, { unique: true });
