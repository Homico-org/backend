import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// Top-level project status. DRAFT/ACTIVE added in the 2026-05 "project
// umbrella" evolution; NEW/IN_PROGRESS/COMPLETED/CANCELLED kept for
// back-compat with any pre-existing ProjectRequest documents.
export enum ProjectStatus {
  DRAFT = 'draft',
  NEW = 'new',
  ACTIVE = 'active',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

// How a worker/role gets filled within a project.
export enum EngagementMode {
  INVITE = 'invite', // client invites a specific pro
  OPEN = 'open', // client opens the role; pros apply/quote (scoped job)
}

export enum EngagementStatus {
  DRAFT = 'draft',
  INVITED = 'invited',
  OPEN = 'open',
  HIRED = 'hired',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum MilestoneStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DONE = 'done',
  BLOCKED = 'blocked',
}

// Renovation phases - the project page is organized around these. Roles
// (engagements) and milestones belong to a phase; phases run in this order.
export enum ProjectPhase {
  DESIGN = 'design',
  PERMITS = 'permits',
  CONSTRUCTION = 'construction',
  FINISHING = 'finishing',
}

// Design-deliverable progression for architect/designer engagements
// (mirrors the job schema's projectPhase values).
export enum DesignPhase {
  CONCEPT = 'concept',
  SCHEMATIC = 'schematic',
  DETAILED = 'detailed',
  CONSTRUCTION_DOCS = 'construction',
}

export enum ApprovalStatus {
  NONE = 'none',
  PENDING = 'pending',
  APPROVED = 'approved',
  CHANGES_REQUESTED = 'changes_requested',
}

// Project document / deliverable. Mirrors ProjectAttachment but adds a
// category (so we can split drawings/permits/contracts/moodboard) and a
// client approval state for design deliverables.
export enum DocumentCategory {
  DELIVERABLE = 'deliverable',
  DRAWING = 'drawing',
  PERMIT = 'permit',
  CONTRACT = 'contract',
  MOODBOARD = 'moodboard',
  OTHER = 'other',
}

// A superseded prior version of a document. The live document's top-level
// fields (url/fileType/version) always describe the CURRENT version; each
// time a new version is uploaded the outgoing one is snapshotted here so
// the full history (and prior files) stays accessible.
@Schema({ _id: false })
export class ProjectDocumentVersion {
  @Prop({ required: true })
  version: number;

  @Prop({ required: true })
  url: string;

  @Prop()
  fileType?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectDocumentVersionSchema = SchemaFactory.createForClass(
  ProjectDocumentVersion,
);

// A discussion comment on a document. `authorId` is set server-side from
// the JWT (source of truth); `authorName` is a denormalized display label.
@Schema({ _id: false })
export class ProjectDocumentComment {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  authorId?: Types.ObjectId;

  @Prop()
  authorName?: string;

  // Optional pin location for image markup, as fractions (0-1) of the
  // image's width/height. When both are set the comment is a pinned
  // annotation; otherwise it's a general comment on the document.
  @Prop()
  x?: number;

  @Prop()
  y?: number;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectDocumentCommentSchema = SchemaFactory.createForClass(
  ProjectDocumentComment,
);

@Schema({ _id: false })
export class ProjectDocument {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  url: string;

  @Prop()
  fileType?: string;

  @Prop({
    type: String,
    enum: Object.values(DocumentCategory),
    default: DocumentCategory.OTHER,
  })
  category: DocumentCategory;

  @Prop({ type: String, enum: Object.values(ProjectPhase) })
  phase?: ProjectPhase;

  @Prop()
  engagementId?: string;

  @Prop()
  stepId?: string; // links to ProjectStep.id; groups the document under a step

  @Prop()
  roomId?: string; // links to Room.id; files a document under a space

  @Prop()
  group?: string; // free-text label the uploader gives (e.g. "Renders")

  @Prop({ default: 1 })
  version: number;

  // Prior versions, oldest-first. Empty until the document is re-uploaded.
  @Prop({ type: [ProjectDocumentVersionSchema], default: [] })
  versions: ProjectDocumentVersion[];

  // Discussion thread on the document, oldest-first.
  @Prop({ type: [ProjectDocumentCommentSchema], default: [] })
  comments: ProjectDocumentComment[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ApprovalStatus),
    default: ApprovalStatus.NONE,
  })
  approvalStatus: ApprovalStatus;

  @Prop()
  note?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectDocumentSchema =
  SchemaFactory.createForClass(ProjectDocument);

// Procurement status for a shopping-list item. Doubles as the stock view:
// ORDERED + DELIVERED items are "in the pipeline", DELIVERED is on-site stock.
export enum ProductStatus {
  TO_BUY = 'to_buy',
  ORDERED = 'ordered',
  DELIVERED = 'delivered',
}

// A product to buy for the renovation (fixtures, tiles, appliances...).
// The shopping list + stock view are both built from these.
@Schema({ _id: false })
export class ProjectProduct {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: 1, min: 0 })
  qty: number;

  @Prop({ default: 0, min: 0 })
  unitPrice: number;

  @Prop()
  vendor?: string;

  @Prop()
  url?: string;

  @Prop()
  imageUrl?: string;

  // Links this shopping-list row back to a supplier-catalog product so it
  // can be ordered through the real checkout (Flitt + delivery). Present only
  // for products added from the catalog; manual rows leave it empty and are
  // not orderable. `supplierProductId` is the catalog product's Mongo _id.
  @Prop()
  supplierProductId?: string;

  @Prop()
  supplierKey?: string;

  @Prop({ type: String, enum: Object.values(ProjectPhase) })
  phase?: ProjectPhase;

  @Prop()
  engagementId?: string;

  @Prop()
  roomId?: string; // links to Room.id; absent = whole-object / general

  @Prop()
  stepId?: string; // links to ProjectStep.id; ties the product to a plan step

  @Prop()
  category?: string; // user-defined grouping label (e.g. "Lighting")

  // === FF&E schedule / procurement details ===
  @Prop()
  sku?: string; // supplier reference / model number

  @Prop()
  dimensions?: string; // free-text, e.g. "120 x 60 x H85 cm"

  @Prop({ min: 0 })
  leadTimeDays?: number; // vendor lead time in days

  @Prop({ type: Date })
  etaDate?: Date; // expected delivery date

  // Client sign-off on this line item (the FF&E "approved to buy" gate).
  @Prop({
    type: String,
    enum: Object.values(ApprovalStatus),
    default: ApprovalStatus.NONE,
  })
  approvalStatus: ApprovalStatus;

  @Prop({ type: Date })
  approvedAt?: Date;

  // Set when this product was materialized from a Selection's chosen option.
  @Prop()
  selectionId?: string;

  @Prop({
    type: String,
    enum: Object.values(ProductStatus),
    default: ProductStatus.TO_BUY,
  })
  status: ProductStatus;

  @Prop()
  note?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectProductSchema =
  SchemaFactory.createForClass(ProjectProduct);

// One entry in the shopping activity log. `action` is one of:
// added | edited | removed | to_buy | ordered | delivered (the status
// values double as actions for status changes). `name` is denormalized so
// removed products still read in the history.
@Schema({ _id: false })
export class ProductLogEntry {
  @Prop({ required: true })
  action: string;

  @Prop()
  name?: string;

  @Prop({ type: Date, default: Date.now })
  at: Date;
}
export const ProductLogEntrySchema =
  SchemaFactory.createForClass(ProductLogEntry);

// A logged decision. `decidedBy` is set server-side from the JWT (source
// of truth); `decidedByName` is a denormalized display label.
@Schema({ _id: false })
export class ProjectDecision {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  decidedBy?: Types.ObjectId;

  @Prop()
  decidedByName?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ProjectDecisionSchema =
  SchemaFactory.createForClass(ProjectDecision);

// Palette & selections - designer/architect tooling. A Selection is one
// decision point (e.g. "Living-room wall color"); the designer proposes one
// or more options (a color swatch or a material) and the client picks one.
export enum SelectionStatus {
  PROPOSED = 'proposed',
  APPROVED = 'approved',
  CHANGES_REQUESTED = 'changes_requested',
}

export enum SelectionOptionType {
  COLOR = 'color',
  MATERIAL = 'material',
}

@Schema({ _id: false })
export class SelectionOption {
  @Prop({ required: true })
  id: string;

  @Prop({
    type: String,
    enum: Object.values(SelectionOptionType),
    default: SelectionOptionType.MATERIAL,
  })
  type: SelectionOptionType;

  @Prop({ required: true })
  name: string;

  @Prop()
  colorHex?: string;

  @Prop()
  imageUrl?: string;

  @Prop()
  brand?: string;

  @Prop()
  product?: string;

  @Prop()
  price?: number;

  @Prop()
  vendor?: string;

  @Prop()
  url?: string;

  @Prop()
  note?: string;
}

export const SelectionOptionSchema =
  SchemaFactory.createForClass(SelectionOption);

@Schema({ _id: false })
export class Selection {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  // Forward-compatible links (Rooms phase): which room / surface this is for.
  @Prop()
  roomId?: string;

  @Prop()
  surface?: string;

  @Prop({ type: String, enum: Object.values(ProjectPhase) })
  phase?: ProjectPhase;

  @Prop({ type: [SelectionOptionSchema], default: [] })
  options: SelectionOption[];

  // The option the client picked.
  @Prop()
  chosenOptionId?: string;

  // Link to the schedule product materialized from this selection's chosen
  // option, so the design choice flows into procurement (and isn't re-added).
  @Prop()
  productId?: string;

  @Prop({
    type: String,
    enum: Object.values(SelectionStatus),
    default: SelectionStatus.PROPOSED,
  })
  status: SelectionStatus;

  @Prop()
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const SelectionSchema = SchemaFactory.createForClass(Selection);

// A room / space in the renovation. Selections (and later docs/photos) can
// be organized per room; dimensions feed area and quantity estimates.
@Schema({ _id: false })
export class Room {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  length?: number;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop()
  area?: number;

  @Prop()
  wallArea?: number; // total wall surface in m² (for paint / tiling takeoff)

  @Prop()
  budget?: number;

  @Prop()
  note?: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

// A line in the takeoff / bill of works: a catalog service with a quantity
// and unit (m², point, piece...), optionally scoped to a room and assigned
// to one of the project's engagements (the worker responsible for it).
@Schema({ _id: false })
export class ScopeItem {
  @Prop({ required: true })
  id: string; // client-generated, e.g. "SC1"

  @Prop()
  roomId?: string; // links to Room.id; absent = whole-apartment / general

  @Prop()
  stepId?: string; // links to ProjectStep.id; groups the service under a step

  @Prop()
  categoryKey?: string; // catalog category/role key (drives worker mapping)

  @Prop()
  serviceKey?: string; // catalog service key

  @Prop({ required: true })
  name: string; // denormalized service name for display

  @Prop()
  quantity?: number;

  @Prop()
  unit?: string; // 'm2' | 'point' | 'piece' | 'count' | ...

  @Prop()
  unitLabel?: string; // denormalized unit label for display

  @Prop()
  unitPrice?: number; // optional estimate, prefilled from the catalog

  @Prop()
  engagementId?: string; // assigned worker/role (ProjectEngagement.id)

  @Prop()
  note?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const ScopeItemSchema = SchemaFactory.createForClass(ScopeItem);

// A moodboard inspiration image - either uploaded, or pulled from a pasted
// link's og:image (a Pinterest pin, a store product page, a blog). Kept
// lightweight: an image plus optional source/title/note, ordered for the grid.
@Schema({ _id: false })
export class MoodboardItem {
  @Prop({ required: true })
  id: string; // client-stable, e.g. "MB..."

  @Prop({ required: true })
  imageUrl: string;

  @Prop()
  title?: string;

  @Prop()
  sourceUrl?: string; // the link it was pulled from

  @Prop()
  note?: string;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;
}

export const MoodboardItemSchema =
  SchemaFactory.createForClass(MoodboardItem);

// Per-engagement design-phase gate (architect/designer). Tracks which
// design phase the pro is on and the client's sign-off on it.
@Schema({ _id: false })
export class DesignApproval {
  @Prop({ type: String, enum: Object.values(DesignPhase) })
  phase?: DesignPhase;

  @Prop({
    type: String,
    enum: Object.values(ApprovalStatus),
    default: ApprovalStatus.NONE,
  })
  status: ApprovalStatus;

  @Prop()
  note?: string;
}

export const DesignApprovalSchema =
  SchemaFactory.createForClass(DesignApproval);

// One worker/role within a project. The reuse-link fields tie the
// engagement to the existing job/proposal/booking/project-tracking
// machinery so a hired worker gets the full single-pro workspace for
// free (see project-tracking.service.createProjectTracking).
@Schema({ _id: false })
export class ProjectEngagement {
  @Prop({ required: true })
  id: string; // stable client-generated id (e.g. "E1")

  @Prop({ required: true })
  roleKey: string; // e.g. "plumber"

  @Prop({ required: true })
  roleLabel: string; // human label as picked in the team builder

  @Prop()
  scope?: string;

  @Prop()
  budget?: number;

  @Prop({
    type: String,
    enum: Object.values(EngagementMode),
    default: EngagementMode.OPEN,
  })
  mode: EngagementMode;

  @Prop({
    type: String,
    enum: Object.values(EngagementStatus),
    default: EngagementStatus.DRAFT,
  })
  status: EngagementStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedProId?: Types.ObjectId;

  // Client-granted "can manage the project" flag. When true, the assigned pro
  // becomes an editor (full project access, like a project manager). When
  // false (default) the pro is a worker: no project-page access - they work
  // from their service order in my-work.
  @Prop({ default: false })
  canManage: boolean;

  // Reuse links - populated as the engagement progresses.
  @Prop({ type: Types.ObjectId, ref: 'Job' })
  jobId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Proposal' })
  proposalId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Booking' })
  bookingId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProjectTracking' })
  projectTrackingId?: Types.ObjectId;

  // When the client wants the work to start, and a free-text period/duration
  // (e.g. "2 weeks"). Captured at invite time, shown to the pro on the order.
  @Prop({ type: Date })
  scheduledStart?: Date;

  @Prop()
  period?: string;

  // Which renovation phase this role belongs to. Auto-assigned from the
  // role's catalog category on create; client can re-assign.
  @Prop({
    type: String,
    enum: Object.values(ProjectPhase),
    default: ProjectPhase.CONSTRUCTION,
  })
  phase: ProjectPhase;

  // Optional pointer to a user-defined project step (`steps[].id`). When
  // set, the UI groups the engagement under that step; when null, the UI
  // falls back to the legacy `phase` enum so existing projects still render.
  @Prop()
  stepId?: string;

  // Design-deliverable gate (only meaningful for architect/designer roles).
  @Prop({ type: DesignApprovalSchema })
  designApproval?: DesignApproval;
}

export const ProjectEngagementSchema =
  SchemaFactory.createForClass(ProjectEngagement);

// User-defined project step. Replaces the rigid 4-value ProjectPhase enum
// on a per-project basis: each project authors its own ordered list of
// steps (e.g. "Design", "Electricity", "Tiling"). Each engagement may
// reference one step via `stepId`; engagements without a stepId fall back
// to the legacy `phase` enum so old projects keep rendering.
@Schema({ _id: false })
export class ProjectStep {
  @Prop({ required: true })
  id: string; // stable client-generated id (e.g. "S1")

  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  // Sort order within the project. Lower = earlier.
  @Prop({ default: 0 })
  order: number;

  // Optional accent hex. Lets the UI render a per-step chip color.
  @Prop()
  color?: string;
}

export const ProjectStepSchema = SchemaFactory.createForClass(ProjectStep);

// A project-level milestone. Ordered, optionally linked to engagements
// whose completion drives the milestone. Start simple (ordered list);
// dependency/critical-path scheduling is deferred.
@Schema({ _id: false })
export class Milestone {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({
    type: String,
    enum: Object.values(MilestoneStatus),
    default: MilestoneStatus.PENDING,
  })
  status: MilestoneStatus;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ type: [String], default: [] })
  linkedEngagementIds: string[];

  @Prop({ type: String, enum: Object.values(ProjectPhase) })
  phase?: ProjectPhase;
}

export const MilestoneSchema = SchemaFactory.createForClass(Milestone);

@Schema({ timestamps: true })
export class ProjectRequest extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  // Legacy single-pro assignment (pre-umbrella). Multi-worker projects
  // use `engagements` instead; kept for back-compat.
  @Prop({ type: Types.ObjectId, ref: 'User' })
  proId: Types.ObjectId;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  title: string;

  // Optional since the creation wizard no longer collects a description
  // (task 1.2). Defaults to '' so existing string reads stay safe.
  @Prop({ default: '' })
  description: string;

  @Prop({ required: true })
  location: string;

  @Prop()
  address: string;

  @Prop()
  budgetMin: number;

  @Prop()
  budgetMax: number;

  @Prop()
  currency: string;

  @Prop()
  estimatedStartDate: Date;

  @Prop()
  estimatedEndDate: Date;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop()
  coverImage?: string;

  // Rolled up from engagement progress (0-100).
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  progress: number;

  @Prop({
    type: String,
    enum: Object.values(ProjectStatus),
    default: ProjectStatus.DRAFT,
  })
  status: ProjectStatus;

  // Multi-worker roster.
  @Prop({ type: [ProjectEngagementSchema], default: [] })
  engagements: ProjectEngagement[];

  // User-defined ordered steps for this project. Empty when the project
  // still uses the legacy 4-phase model; populated once the client
  // authors their own steps in the Team tab.
  @Prop({ type: [ProjectStepSchema], default: [] })
  steps: ProjectStep[];

  // Project-level timeline.
  @Prop({ type: [MilestoneSchema], default: [] })
  milestones: Milestone[];

  // Document / deliverable repository (drawings, permits, contracts,
  // moodboard images). Design deliverables carry an approval state.
  @Prop({ type: [ProjectDocumentSchema], default: [] })
  documents: ProjectDocument[];

  // Shopping list / procurement. Drives the Shopping tab and the stock view.
  @Prop({ type: [ProjectProductSchema], default: [] })
  products: ProjectProduct[];

  // Shopping activity history (added / edited / status changes / removed).
  @Prop({ type: [ProductLogEntrySchema], default: [] })
  productLog: ProductLogEntry[];

  // Decision log: a running record of decisions made on the project so
  // choices ("client chose oak flooring") don't get lost in chat.
  @Prop({ type: [ProjectDecisionSchema], default: [] })
  decisions: ProjectDecision[];

  // Palette & selections: designer proposes color/material options per
  // decision; client picks one and approves.
  @Prop({ type: [SelectionSchema], default: [] })
  selections: Selection[];

  // Rooms / spaces - organize selections, photos, dimensions, and budget.
  @Prop({ type: [RoomSchema], default: [] })
  rooms: Room[];

  // Takeoff / bill of works: catalog services with quantities, organized
  // by room and assigned to engagements. Drives the Scope tab + cost rollup.
  @Prop({ type: [ScopeItemSchema], default: [] })
  scopeItems: ScopeItem[];

  // Moodboard: inspiration images (uploaded or pulled from a pasted link).
  @Prop({ type: [MoodboardItemSchema], default: [] })
  moodboardItems: MoodboardItem[];

  // Which phase the renovation is currently in (drives the timeline UI).
  @Prop({
    type: String,
    enum: Object.values(ProjectPhase),
    default: ProjectPhase.DESIGN,
  })
  currentPhase: ProjectPhase;

  // === Site info (architecture projects) - mirrors the job fields ===
  @Prop()
  cadastralId?: string;

  @Prop()
  landArea?: number;

  @Prop()
  floorCount?: number;

  @Prop()
  propertyType?: string;

  @Prop()
  acceptedOfferId: Types.ObjectId;

  // Soft delete. When set, the project is hidden from every read path (see the
  // query hooks below) but the document - and all its team/materials/files
  // history - is preserved and recoverable. Owner-only delete sets this.
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: Types.ObjectId })
  deletedBy?: Types.ObjectId;
}

export const ProjectRequestSchema = SchemaFactory.createForClass(ProjectRequest);

// Soft-delete guard: every query through this model hides soft-deleted docs
// unless the caller explicitly references `deletedAt` in the filter (e.g. an
// admin restore/trash view passing `{ deletedAt: { $ne: null } }`). `null`
// matches both an explicit null and a missing field, so pre-existing projects
// (no `deletedAt`) are unaffected.
function excludeSoftDeleted(this: any, next: (err?: unknown) => void): void {
  const filter = this.getFilter ? this.getFilter() : this._conditions;
  if (!filter || !('deletedAt' in filter)) {
    this.where({ deletedAt: null });
  }
  next();
}
// Cast for registration: Mongoose's typed `pre` overloads don't accept a
// shared `this: any` query-middleware fn across these hook names.
const softDeleteSchema = ProjectRequestSchema as unknown as {
  pre: (hook: string, fn: typeof excludeSoftDeleted) => void;
};
softDeleteSchema.pre('find', excludeSoftDeleted);
softDeleteSchema.pre('findOne', excludeSoftDeleted);
softDeleteSchema.pre('findOneAndUpdate', excludeSoftDeleted);
softDeleteSchema.pre('countDocuments', excludeSoftDeleted);

ProjectRequestSchema.index({ clientId: 1 });
ProjectRequestSchema.index({ proId: 1 });
ProjectRequestSchema.index({ category: 1 });
ProjectRequestSchema.index({ status: 1 });
ProjectRequestSchema.index({ location: 1 });
ProjectRequestSchema.index({ createdAt: -1 });
ProjectRequestSchema.index({ deletedAt: 1 });
ProjectRequestSchema.index({ 'engagements.jobId': 1 });
