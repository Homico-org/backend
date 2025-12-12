import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Conversation extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProProfile', required: true })
  proId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest' })
  projectRequestId: Types.ObjectId;

  // Link to job and proposal for proposal-based conversations
  @Prop({ type: Types.ObjectId, ref: 'Job' })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Proposal' })
  proposalId: Types.ObjectId;

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
ConversationSchema.index({ jobId: 1 });
ConversationSchema.index({ proposalId: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
