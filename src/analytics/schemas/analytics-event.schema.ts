import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class AnalyticsEvent extends Document {
  @Prop({ required: true })
  event: string;

  @Prop({ required: true })
  target: string;

  @Prop({ default: '' })
  label: string;

  @Prop({ required: true })
  date: string; // YYYY-MM-DD

  @Prop({ default: 0 })
  count: number;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);

// Unique compound index for upsert operations
AnalyticsEventSchema.index({ event: 1, target: 1, date: 1 }, { unique: true });
// For querying by event type within a date range
AnalyticsEventSchema.index({ event: 1, date: -1 });
