import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true })
export class Booking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  professional: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  client: Types.ObjectId;

  @Prop({ required: true })
  date: string; // "YYYY-MM-DD"

  @Prop({ required: true, min: 0, max: 23 })
  startHour: number;

  @Prop({ required: true, min: 0, max: 23 })
  endHour: number;

  @Prop({
    type: String,
    enum: Object.values(BookingStatus),
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Prop()
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;

  @Prop()
  cancelReason?: string;

  @Prop({ type: [Object], default: [] })
  services: {
    serviceKey: string;
    name: string;
    nameKa: string;
    quantity: number;
    unitPrice: number;
    unit: string;
    discount: number;
    subtotal: number;
  }[];

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop()
  address?: string;

  @Prop({ type: [String], default: [] })
  beforePhotos: string[];

  @Prop({ type: [String], default: [] })
  afterPhotos: string[];

  @Prop({ type: [String], default: [] })
  videos: string[];

  @Prop()
  startedAt: Date;

  @Prop()
  completedAt: Date;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);

BookingSchema.index({ professional: 1, date: 1, status: 1 });
BookingSchema.index({ client: 1, status: 1, createdAt: -1 });
