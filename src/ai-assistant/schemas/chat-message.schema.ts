import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class ChatMessage extends Document {
  @Prop({ type: Types.ObjectId, ref: 'ChatSession', required: true, index: true })
  sessionId: Types.ObjectId;

  @Prop({ enum: ['user', 'assistant'], required: true })
  role: 'user' | 'assistant';

  @Prop({ required: true })
  content: string;

  @Prop({ type: Object })
  metadata?: {
    tokensUsed?: number;
    model?: string;
    processingTimeMs?: number;
    suggestedActions?: Array<{
      type: 'link' | 'action';
      label: string;
      labelKa?: string;
      url?: string;
      action?: string;
    }>;
  };
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// Index for fetching conversation history
ChatMessageSchema.index({ sessionId: 1, createdAt: 1 });
