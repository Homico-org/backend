import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Lifecycle of a single moderation request. PENDING ones await an admin
// decision; SUPERSEDED is set when the same pro submits a newer edit while
// an older one is still waiting (last-write-wins, only the newest is live).
export enum ChangeRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUPERSEDED = 'superseded',
}

// Which service path applies the change on approval. We replay the exact
// same update method the user originally hit so every server-side
// derivation (name from first/last, pricing normalization, etc.) runs
// identically to a non-moderated save.
export enum ChangeRequestSource {
  PROFILE = 'profile', // PATCH /users/me           -> usersService.update
  PRO_PROFILE = 'proProfile', // POST/PATCH /users/me/pro-profile -> updateProProfile
}

// One field-level before/after entry. Captured at submission time purely
// for the admin diff view; the actual apply replays `payload`, not this.
export interface FieldChange {
  field: string;
  oldValue: any;
  newValue: any;
}

@Schema({ timestamps: true, collection: 'profile_change_requests' })
export class ProfileChangeRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  proId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ChangeRequestSource),
    required: true,
  })
  source: ChangeRequestSource;

  @Prop({
    type: String,
    enum: Object.values(ChangeRequestStatus),
    default: ChangeRequestStatus.PENDING,
    index: true,
  })
  status: ChangeRequestStatus;

  // Raw submitted payload, limited to moderated (public-profile) fields.
  // Replayed verbatim on approval so derived fields stay consistent.
  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  // Field-by-field before/after, computed at submission for the admin UI.
  @Prop({ type: [Object], default: [] })
  changes: FieldChange[];

  // Denormalized pro identity so the admin list renders without a populate.
  @Prop({ default: null })
  proName: string | null;

  @Prop({ default: null })
  proAvatar: string | null;

  @Prop({ default: null })
  proUid: number | null;

  // Decision metadata (set when an admin approves/rejects).
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  reviewedBy: Types.ObjectId | null;

  @Prop({ default: null })
  reviewedAt: Date | null;

  // Free-text reason, required on rejection so the pro knows what to fix.
  @Prop({ default: null })
  reason: string | null;
}

export const ProfileChangeRequestSchema =
  SchemaFactory.createForClass(ProfileChangeRequest);

// Admin queue: list pending first, newest first within a status.
ProfileChangeRequestSchema.index({ status: 1, createdAt: -1 });
// Fast supersede lookup + per-pro history.
ProfileChangeRequestSchema.index({ proId: 1, status: 1 });
