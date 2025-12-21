import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum OfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

@Schema({ timestamps: true })
export class Offer extends Document {
  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest', required: true })
  projectRequestId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ required: true })
  priceEstimate: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop()
  estimatedStartDate: Date;

  @Prop()
  estimatedDurationDays: number;

  @Prop()
  description: string;

  @Prop({
    type: String,
    enum: Object.values(OfferStatus),
    default: OfferStatus.PENDING
  })
  status: OfferStatus;

  @Prop()
  expiresAt: Date;
}

export const OfferSchema = SchemaFactory.createForClass(Offer);

OfferSchema.index({ projectRequestId: 1 });
OfferSchema.index({ proId: 1 });
OfferSchema.index({ status: 1 });
OfferSchema.index({ createdAt: -1 });
