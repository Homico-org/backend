import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProposalStatus {
  PENDING = 'pending',
  IN_DISCUSSION = 'in_discussion', // Client started a chat
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn',
  COMPLETED = 'completed',
}

@Schema({ timestamps: true })
export class Proposal extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProProfile' })
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

  // Link to conversation when client starts chatting
  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId: Types.ObjectId;

  // Track when client first responded
  @Prop({ type: Date })
  clientRespondedAt: Date;

  // Track when proposal was accepted
  @Prop({ type: Date })
  acceptedAt: Date;

  // Client's note when rejecting
  @Prop({ type: String })
  rejectionNote: string;
}

export const ProposalSchema = SchemaFactory.createForClass(Proposal);

// Indexes for efficient queries
ProposalSchema.index({ jobId: 1, status: 1 });
ProposalSchema.index({ proId: 1, status: 1 });
ProposalSchema.index({ conversationId: 1 });
