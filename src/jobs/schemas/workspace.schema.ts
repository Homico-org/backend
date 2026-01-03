import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum WorkspaceItemType {
  IMAGE = 'image',
  FILE = 'file',
  LINK = 'link',
  PRODUCT = 'product',
}

export type ReactionType = 'like' | 'love' | 'approved';

@Schema({ timestamps: true })
export class ItemReaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar?: string;

  @Prop({ required: true, enum: ['like', 'love', 'approved'] })
  type: ReactionType;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ItemReactionSchema = SchemaFactory.createForClass(ItemReaction);

@Schema({ timestamps: true })
export class ItemComment {
  @Prop({ type: Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar?: string;

  @Prop({ required: true, enum: ['client', 'pro'] })
  userRole: 'client' | 'pro';

  @Prop({ required: true })
  content: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ItemCommentSchema = SchemaFactory.createForClass(ItemComment);

@Schema({ timestamps: true })
export class WorkspaceItem {
  @Prop({ type: Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: Object.values(WorkspaceItemType), required: true })
  type: WorkspaceItemType;

  // For images/files
  @Prop()
  fileUrl?: string;

  // For links
  @Prop()
  linkUrl?: string;

  // For products
  @Prop()
  price?: number;

  @Prop()
  currency?: string;

  @Prop()
  storeName?: string;

  @Prop()
  storeAddress?: string;

  // Reactions and comments
  @Prop({ type: [ItemReactionSchema], default: [] })
  reactions: ItemReaction[];

  @Prop({ type: [ItemCommentSchema], default: [] })
  comments: ItemComment[];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const WorkspaceItemSchema = SchemaFactory.createForClass(WorkspaceItem);

@Schema({ timestamps: true })
export class SectionAttachment {
  @Prop({ type: Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileUrl: string;

  @Prop({ required: true })
  fileType: string; // 'image' | 'document' | 'other'

  @Prop()
  fileSize?: number;

  @Prop({ type: Date, default: Date.now })
  uploadedAt: Date;
}

export const SectionAttachmentSchema = SchemaFactory.createForClass(SectionAttachment);

@Schema({ timestamps: true })
export class WorkspaceSection {
  @Prop({ type: Types.ObjectId, required: true })
  _id: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: [SectionAttachmentSchema], default: [] })
  attachments: SectionAttachment[];

  @Prop({ type: [WorkspaceItemSchema], default: [] })
  items: WorkspaceItem[];

  @Prop({ type: Number, default: 0 })
  order: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const WorkspaceSectionSchema = SchemaFactory.createForClass(WorkspaceSection);

@Schema({ timestamps: true })
export class ProjectWorkspace extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Job', required: true, unique: true })
  jobId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  proId: Types.ObjectId;

  @Prop({ type: [WorkspaceSectionSchema], default: [] })
  sections: WorkspaceSection[];
}

export const ProjectWorkspaceSchema = SchemaFactory.createForClass(ProjectWorkspace);

// Create indexes
ProjectWorkspaceSchema.index({ jobId: 1 });
ProjectWorkspaceSchema.index({ clientId: 1 });
ProjectWorkspaceSchema.index({ proId: 1 });
