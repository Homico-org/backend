import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest' })
  projectRequestId: Types.ObjectId;

  @Prop()
  lastMessageAt: Date;

  @Prop()
  lastMessagePreview: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  lastMessageBy: Types.ObjectId;

  @Prop({ default: 0 })
  unreadCountClient: number;

  @Prop({ default: 0 })
  unreadCountPro: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ clientId: 1 });
ConversationSchema.index({ proId: 1 });
ConversationSchema.index({ projectRequestId: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
