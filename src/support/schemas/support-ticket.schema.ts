import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportMessageStatus = 'sent' | 'delivered' | 'read';

@Schema({ timestamps: true })
export class SupportMessage {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  senderId: Types.ObjectId;

  @Prop({ required: true })
  content: string;

  @Prop({ default: false })
  isAdmin: boolean;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' })
  status: SupportMessageStatus;

  @Prop()
  deliveredAt: Date;

  @Prop()
  readAt: Date;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);

@Schema({ timestamps: true })
export class SupportTicket extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  // For guest/unauthenticated contact submissions
  @Prop()
  guestEmail: string;

  @Prop()
  guestPhone: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  category: string;

  @Prop()
  subcategory: string;

  @Prop({ type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' })
  status: TicketStatus;

  @Prop({ type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: TicketPriority;

  @Prop({ type: [SupportMessageSchema], default: [] })
  messages: SupportMessage[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo: Types.ObjectId;

  @Prop()
  relatedItemType: string;

  @Prop({ type: Types.ObjectId })
  relatedItemId: Types.ObjectId;

  @Prop({ default: false })
  hasUnreadUserMessages: boolean;

  @Prop({ default: false })
  hasUnreadAdminMessages: boolean;

  @Prop()
  lastMessageAt: Date;

  @Prop()
  resolvedAt: Date;

  @Prop()
  closedAt: Date;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);

SupportTicketSchema.index({ userId: 1, status: 1 });
SupportTicketSchema.index({ status: 1, priority: -1 });
SupportTicketSchema.index({ assignedTo: 1, status: 1 });
SupportTicketSchema.index({ hasUnreadUserMessages: 1 });
SupportTicketSchema.index({ lastMessageAt: -1 });
