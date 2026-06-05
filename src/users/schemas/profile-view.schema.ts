import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ProfileViewType {
  PROFILE = 'profile',
  PHONE = 'phone',
}

@Schema({ timestamps: true })
export class ProfileView extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ required: true })
  ip: string;

  @Prop({
    type: String,
    enum: Object.values(ProfileViewType),
    required: true,
  })
  type: ProfileViewType;

  @Prop({ required: true, default: () => new Date() })
  viewedAt: Date;
}

export const ProfileViewSchema = SchemaFactory.createForClass(ProfileView);

// One row per (pro, ip, type) within the TTL window — the unique index makes
// the upsert idempotent so refreshes from the same IP never double-count.
ProfileViewSchema.index({ proId: 1, ip: 1, type: 1 }, { unique: true });
// Auto-delete rows 24h after viewedAt so the same IP can count again later.
ProfileViewSchema.index({ viewedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
