import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProposalStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
}

@Schema({ timestamps: true })
export class Proposal extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  // proProfileId is now deprecated - proId already references the User
  // Keeping for backwards compatibility during migration
  @Prop({ type: Types.ObjectId, ref: 'User' })
  proProfileId: Types.ObjectId;

  @Prop({ required: true })
  coverLetter: string;

  @Prop({ type: Number })
  proposedPrice: number;

  @Prop({ type: Number })
  estimatedDuration: number; // in days

  @Prop({ type: String })
  estimatedDurationUnit: string; // days, weeks, months

  @Prop({
    type: String,
    enum: Object.values(ProposalStatus),
    default: ProposalStatus.PENDING
  })
  status: ProposalStatus;

  @Prop({ type: Boolean, default: false })
  contactRevealed: boolean;

  @Prop({ type: Date })
  revealedAt: Date;

  // Track if the client has seen this proposal
  @Prop({ type: Boolean, default: false })
  viewedByClient: boolean;

  // Track if the pro has seen the status update (when accepted/rejected)
  @Prop({ type: Boolean, default: true })
  viewedByPro: boolean;
}

export const ProposalSchema = SchemaFactory.createForClass(Proposal);
