import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QuoteRequestStatus = 'new' | 'contacted' | 'converted' | 'closed';
export type ServiceType = 'cleaning' | 'repair' | 'design' | 'construction' | 'other';
export type PreferredPlan = 'on_demand' | 'standard' | 'business' | 'not_sure';

@Schema({ timestamps: true })
export class QuoteRequest extends Document {
  @Prop({ required: true })
  companyName: string;

  @Prop({ required: true })
  contactName: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ type: String, enum: ['cleaning', 'repair', 'design', 'construction', 'other'], required: true })
  serviceType: ServiceType;

  @Prop()
  description: string;

  @Prop({ type: String, enum: ['on_demand', 'standard', 'business', 'not_sure'], default: 'not_sure' })
  preferredPlan: PreferredPlan;

  @Prop({ type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' })
  status: QuoteRequestStatus;
}

export const QuoteRequestSchema = SchemaFactory.createForClass(QuoteRequest);

QuoteRequestSchema.index({ status: 1, createdAt: -1 });
QuoteRequestSchema.index({ email: 1 });
