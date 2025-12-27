import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'activity_logs' })
export class ActivityLog extends Document {
  @Prop({ required: true, index: true })
  type: string;

  @Prop({ index: true })
  userId: string;

  @Prop({ index: true })
  userEmail: string;

  @Prop()
  userName: string;

  @Prop()
  targetId: string;

  @Prop()
  targetType: string;

  @Prop({ type: Object })
  details: Record<string, any>;

  @Prop()
  ip: string;

  @Prop()
  userAgent: string;

  @Prop({ default: Date.now, index: true })
  timestamp: Date;
}

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// Add TTL index to auto-delete logs after 90 days (optional, remove if you want to keep forever)
// ActivityLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Compound indexes for common queries
ActivityLogSchema.index({ type: 1, timestamp: -1 });
ActivityLogSchema.index({ userId: 1, timestamp: -1 });
ActivityLogSchema.index({ userEmail: 1, timestamp: -1 });
