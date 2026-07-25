import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum AssistedJobStatus {
  PENDING = 'pending', // link generated, awaiting client approval
  APPROVED = 'approved', // client approved → a real Job was created
  EXPIRED = 'expired', // link lifetime elapsed before approval
  CANCELLED = 'cancelled', // admin cancelled the draft
}

/**
 * An admin-prepared job draft. The admin fills it in on behalf of a client and
 * shares a single-use token/link; the client opens it, signs in (or sets a
 * password), and approves — which creates the real Job owned by the client.
 */
@Schema({ timestamps: true })
export class AssistedJob extends Document {
  // Unguessable, single-use token that keys the client-facing link.
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({
    type: String,
    enum: Object.values(AssistedJobStatus),
    default: AssistedJobStatus.PENDING,
    index: true,
  })
  status: AssistedJobStatus;

  // Which admin created this draft (audit trail).
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdByAdmin: Types.ObjectId;

  // ── Target client (as dictated to the admin) ──
  @Prop({ required: true, trim: true })
  clientName: string;

  @Prop({ required: true, trim: true })
  clientPhone: string;

  @Prop({ trim: true })
  clientEmail?: string;

  // ── Pre-filled job payload ──
  @Prop({ required: true })
  category: string;

  @Prop()
  subcategory?: string;

  @Prop({ type: [Object], default: [] })
  services: Record<string, unknown>[];

  @Prop()
  propertyType?: string;

  @Prop()
  description?: string;

  @Prop()
  areaSize?: string;

  @Prop()
  timing?: string;

  @Prop()
  budgetType?: string;

  @Prop()
  budgetMin?: string;

  @Prop()
  budgetMax?: string;

  @Prop()
  location?: string;

  @Prop({ type: Object })
  coordinates?: { lat: number; lng: number };

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: [String], default: [] })
  videos: string[];

  // Pros the admin chose to invite directly, on top of the open marketplace.
  // Passed to createJob at approval time (which notifies them).
  @Prop({ type: [String], default: [] })
  invitedPros: string[];

  // ── Lifecycle ──
  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  approvedAt?: Date;

  // Set once approved.
  @Prop({ type: Types.ObjectId, ref: 'Job' })
  createdJobId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  clientUserId?: Types.ObjectId;
}

export const AssistedJobSchema = SchemaFactory.createForClass(AssistedJob);

// Admin listing: newest drafts first, by creator.
AssistedJobSchema.index({ createdByAdmin: 1, createdAt: -1 });
