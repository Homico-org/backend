import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum LikeTargetType {
  PRO_PROFILE = 'pro_profile',
  PORTFOLIO_ITEM = 'portfolio_item',
  FEED_ITEM = 'feed_item',
}

@Schema({ timestamps: true })
export class Like extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(LikeTargetType),
    required: true,
  })
  targetType: LikeTargetType;

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;
}

export const LikeSchema = SchemaFactory.createForClass(Like);

// Compound unique index to prevent duplicate likes
LikeSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
// For counting likes on a target
LikeSchema.index({ targetType: 1, targetId: 1 });
// For getting user's liked items
LikeSchema.index({ userId: 1, targetType: 1 });
