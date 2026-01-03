import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum PollStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  APPROVED = 'approved',
}

@Schema({ _id: true })
export class PollOption {
  @Prop({ type: Types.ObjectId, auto: true })
  _id: Types.ObjectId;

  @Prop({ type: String })
  text?: string;

  @Prop({ type: String })
  imageUrl?: string;
}

export const PollOptionSchema = SchemaFactory.createForClass(PollOption);

@Schema({ timestamps: true })
export class Poll extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, index: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: [PollOptionSchema], required: true })
  options: PollOption[];

  @Prop({
    type: String,
    enum: Object.values(PollStatus),
    default: PollStatus.ACTIVE,
  })
  status: PollStatus;

  @Prop({ type: Types.ObjectId })
  selectedOption?: Types.ObjectId; // Client's approved choice

  @Prop({ type: Types.ObjectId })
  clientVote?: Types.ObjectId; // Client's current vote (before approval)

  @Prop({ type: Date })
  closedAt?: Date;
}

export const PollSchema = SchemaFactory.createForClass(Poll);

// Index for finding polls by job
PollSchema.index({ jobId: 1, createdAt: -1 });
