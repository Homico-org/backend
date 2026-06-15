import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ProfileViewType } from './profile-view.schema';

// Persistent, append-only log of every profile/phone open on a pro profile.
// Deliberately separate from `ProfileView` (which is deduped-by-IP + 24h TTL and
// only powers the live counters): this one keeps EVERY open forever so admins
// get full traceability and can rank pros by how often they were viewed.
// No unique index and no TTL on purpose - one document per open.
@Schema({ timestamps: true, collection: 'view_logs' })
export class ViewLog extends Document {
  // The pro whose profile/phone was opened.
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  proId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ProfileViewType),
    required: true,
    index: true,
  })
  type: ProfileViewType;

  // The visitor, when authenticated. Null for anonymous visitors (we still keep
  // their IP). Name is snapshotted so the admin list renders without a populate.
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  viewerId: Types.ObjectId | null;

  @Prop({ type: String, default: null })
  viewerName: string | null;

  @Prop({ required: true })
  ip: string;
}

export const ViewLogSchema = SchemaFactory.createForClass(ViewLog);

// Rank pros by views of a given type (admin stats), and page the journal newest-first.
ViewLogSchema.index({ type: 1, proId: 1 });
ViewLogSchema.index({ type: 1, createdAt: -1 });
