import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProjectActivityDocument = ProjectActivity & Document;

/**
 * One row per meaningful action taken on a project, by anyone. Stored in a
 * SEPARATE collection (not embedded on the project doc) because the history is
 * unbounded and the project doc is already large + round-tripped on every
 * mutation. Powers the project "History" tab. Writes are fire-and-forget so a
 * logging failure never breaks the underlying action.
 */
@Schema({ collection: 'project_activities', timestamps: true })
export class ProjectActivity {
  @Prop({ type: Types.ObjectId, ref: 'ProjectRequest', required: true, index: true })
  projectId: Types.ObjectId;

  // Who did it. Name/avatar are resolved at read time via populate, so there
  // is no denormalization drift.
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  actorId?: Types.ObjectId;

  @Prop({ enum: ['client', 'editor', 'worker', 'system'], default: 'system' })
  actorRole: string;

  // e.g. "product.added", "project.status_changed" - see ProjectActivityType.
  @Prop({ required: true, index: true })
  type: string;

  // The touched entity: 'product' | 'room' | 'step' | 'document' |
  // 'engagement' | 'selection' | 'project' ... + its short id + a denormalized
  // label so the entry still reads well after the entity is deleted.
  @Prop()
  targetType?: string;

  @Prop()
  targetId?: string;

  @Prop()
  targetLabel?: string;

  // Free-form extras: { from, to, status, qty, ... }.
  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ProjectActivitySchema = SchemaFactory.createForClass(ProjectActivity);

// Primary read: a project's activity, newest first.
ProjectActivitySchema.index({ projectId: 1, createdAt: -1 });
