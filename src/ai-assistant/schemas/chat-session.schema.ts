import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ChatSession extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
visitorId?: Types.ObjectId;

  @Prop({ index: true })
  anonymousId?: string; // For non-logged-in users

  @Prop({ enum: ['active', 'closed'], default: 'active' })
  status: string;

  @Prop({ default: 0 })
  messageCount: number;

  @Prop()
  lastMessageAt?: Date;

  @Prop({ type: Object })
  context?: {
    page?: string;
    userRole?: 'client' | 'pro' | 'guest';
    preferredLocale?: 'en' | 'ka' | 'ru';
  };
}

export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);

// Index for finding active sessions
ChatSessionSchema.index({ visitorId: 1, status: 1 });
ChatSessionSchema.index({ anonymousId: 1, status: 1 });
ChatSessionSchema.index({ createdAt: -1 });
