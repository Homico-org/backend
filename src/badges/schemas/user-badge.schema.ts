import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * One row = one badge unlocked by one user. Badge *definitions* (title, icon,
 * rule) live in code (badges.registry.ts); this collection only records who
 * unlocked what and when.
 */
@Schema({ timestamps: true })
export class UserBadge extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Matches a BadgeDefinition.key in the registry.
  @Prop({ required: true })
  badgeKey: string;

  @Prop({ type: Date, default: Date.now })
  unlockedAt: Date;

  // Optional snapshot of the values that unlocked the badge (e.g. rating).
  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const UserBadgeSchema = SchemaFactory.createForClass(UserBadge);

// Idempotence: a user can hold a given badge at most once. The unique index
// makes re-evaluation safe — a duplicate insert throws E11000 and is ignored.
// Its userId prefix also serves the "badges for this user" lookup.
UserBadgeSchema.index({ userId: 1, badgeKey: 1 }, { unique: true });
