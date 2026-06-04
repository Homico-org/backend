import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ApprovalStatus,
  DesignPhase,
  DocumentCategory,
  EngagementMode,
  EngagementStatus,
  Milestone,
  MilestoneStatus,
  ProductStatus,
  ProjectEngagement,
  ProjectPhase,
  ProjectRequest,
  ProjectStatus,
  SelectionStatus,
} from './schemas/project-request.schema';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import {
  AddDecisionDto,
  AddDocumentCommentDto,
  AddDocumentDto,
  AddDocumentVersionDto,
  AddEngagementDto,
  AddMilestoneDto,
  AddProductDto,
  ApproveDocumentDto,
  ChooseSelectionDto,
  CreateRoomDto,
  CreateScopeItemDto,
  CreateSelectionDto,
  DesignPhaseDto,
  ReviewSelectionDto,
  SelectionOptionDto,
  UpdateEngagementDto,
  UpdateMilestoneDto,
  UpdateProductDto,
  UpdateProjectDto,
  UpdateRoomDto,
  UpdateScopeItemDto,
  UpdateSelectionDto,
} from './dto/manage-project.dto';
import { JobsService } from '../jobs/jobs.service';
import { JobBudgetType, JobType } from '../jobs/schemas/job.schema';
import { ProjectTracking } from '../jobs/schemas/project-tracking.schema';
import { Booking, BookingStatus } from '../bookings/schemas/booking.schema';
import { Job } from '../jobs/schemas/job.schema';

// Engagement statuses that count as "done" when rolling up project progress.
const COMPLETED_ENGAGEMENT = EngagementStatus.COMPLETED;

// Phases run in this order on the timeline.
const PHASE_ORDER: ProjectPhase[] = [
  ProjectPhase.DESIGN,
  ProjectPhase.PERMITS,
  ProjectPhase.CONSTRUCTION,
  ProjectPhase.FINISHING,
];

// Map a role's catalog category key -> renovation phase. Design roles plan,
// trades build, finishers finish. Anything unknown defaults to construction.
// Keys match the live service-catalog category keys (plural), with a few
// legacy/singular aliases kept for safety. Everything not listed defaults
// to construction (see phaseForRole).
const DESIGN_ROLES = new Set([
  'architects',
  'designers',
  // legacy / aliases
  'architect',
  'interior_designer',
  'project_manager',
  'designer',
  'design',
  'architecture',
]);
const FINISHING_ROLES = new Set([
  'painters',
  'cleaning',
  'landscaping',
  'windows_doors',
  // legacy / aliases
  'painter',
  'painting',
  'cleaner',
  'flooring_specialist',
  'flooring',
  'glass_windows',
]);

function phaseForRole(roleKey: string): ProjectPhase {
  const k = (roleKey || '').toLowerCase();
  if (DESIGN_ROLES.has(k)) return ProjectPhase.DESIGN;
  if (FINISHING_ROLES.has(k)) return ProjectPhase.FINISHING;
  return ProjectPhase.CONSTRUCTION;
}

function isDesignRole(roleKey: string): boolean {
  return DESIGN_ROLES.has((roleKey || '').toLowerCase());
}

// Booking status -> rough progress %, so a booked engagement contributes to
// the project rollup the same way a workspace's `progress` does.
const BOOKING_PROGRESS: Record<string, number> = {
  [BookingStatus.AWAITING_PAYMENT]: 5,
  [BookingStatus.PENDING]: 15,
  [BookingStatus.CONFIRMED]: 35,
  [BookingStatus.IN_PROGRESS]: 65,
  [BookingStatus.AWAITING_CLIENT_CONFIRMATION]: 90,
  [BookingStatus.COMPLETED]: 100,
  [BookingStatus.CANCELLED]: 0,
  [BookingStatus.DISPUTED]: 65,
};

@Injectable()
export class ProjectRequestService {
  constructor(
    @InjectModel(ProjectRequest.name)
    private projectRequestModel: Model<ProjectRequest>,
    @InjectModel(ProjectTracking.name)
    private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(Booking.name)
    private bookingModel: Model<Booking>,
    @InjectModel(Job.name)
    private jobModel: Model<Job>,
    private readonly jobsService: JobsService,
  ) {}

  private shortId(prefix: string): string {
    return `${prefix}${new Types.ObjectId().toString().slice(-8)}`;
  }

  async create(
    clientId: string,
    createDto: CreateProjectRequestDto,
  ): Promise<ProjectRequest> {
    const engagements: Partial<ProjectEngagement>[] = (
      createDto.engagements ?? []
    ).map((e) => ({
      id: e.id || this.shortId('E'),
      roleKey: e.roleKey,
      roleLabel: e.roleLabel,
      scope: e.scope,
      budget: e.budget,
      mode: e.mode ?? EngagementMode.OPEN,
      status: EngagementStatus.DRAFT,
      phase: phaseForRole(e.roleKey),
      designApproval: isDesignRole(e.roleKey)
        ? { phase: DesignPhase.CONCEPT, status: ApprovalStatus.NONE }
        : undefined,
    }));

    const milestones: Partial<Milestone>[] = (createDto.milestones ?? []).map(
      (m, i) => ({
        id: m.id || this.shortId('M'),
        title: m.title,
        description: m.description,
        dueDate: m.dueDate ? new Date(m.dueDate) : undefined,
        status: MilestoneStatus.PENDING,
        sortOrder: i,
        linkedEngagementIds: m.linkedEngagementIds ?? [],
      }),
    );

    const { engagements: _e, milestones: _m, ...rest } = createDto;
    const request = new this.projectRequestModel({
      clientId,
      ...rest,
      engagements,
      milestones,
      status: ProjectStatus.DRAFT,
    });
    return request.save();
  }

  async findAll(filters?: {
    clientId?: string;
    proId?: string;
    category?: string;
    status?: ProjectStatus;
  }): Promise<ProjectRequest[]> {
    const query: any = {};

    if (filters?.clientId) query.clientId = filters.clientId;
    if (filters?.proId) query.proId = filters.proId;
    if (filters?.category) query.category = filters.category;
    if (filters?.status) query.status = filters.status;

    return this.projectRequestModel
      .find(query)
      .populate('clientId', 'name email avatar')
      .populate('proId')
      .sort({ createdAt: -1 })
      .exec();
  }

  // Projects the user participates in: owned (client) OR engaged on a role.
  // Used by the project switcher, independent of the account's global role.
  async findForUser(
    userId: string,
    filters?: { category?: string; status?: ProjectStatus },
  ): Promise<ProjectRequest[]> {
    const query: any = {
      $or: [{ clientId: userId }, { 'engagements.assignedProId': userId }],
    };
    if (filters?.category) query.category = filters.category;
    if (filters?.status) query.status = filters.status;
    return this.projectRequestModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<ProjectRequest> {
    // Guard against malformed ids (e.g. the literal "undefined" from a
    // broken client link) so they surface as a clean 404 instead of a
    // 500 Mongoose CastError.
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Project not found');
    }

    const request = await this.projectRequestModel
      .findById(id)
      .populate('clientId', 'name email phone avatar')
      .populate('proId')
      .populate('engagements.assignedProId', 'name avatar')
      .exec();

    if (!request) {
      throw new NotFoundException('Project not found');
    }

    return request;
  }

  // Aggregated dashboard view: enriches each engagement with its
  // per-worker workspace (stage + progress), rolls those up into a
  // project-level progress, merges every workspace's history into one
  // time-sorted activity feed, and auto-derives milestone status from
  // linked engagements. Returns a plain object (not a Mongoose doc).
  async getDashboard(id: string, userId: string): Promise<any> {
    // See findOne: reject malformed ids up front so a bad client link
    // ("/projects/undefined/dashboard") returns 404, not a 500 CastError.
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Project not found');
    }

    const project = await this.projectRequestModel
      .findById(id)
      .populate('clientId', 'name email phone avatar')
      // Lead/engagement pro cards on the dashboard show identity + trust + rate
      // (Overview meta lead card, Team featured lead), so pull the pro-profile
      // fields those surfaces render. Kept to a tight projection - no secrets.
      .populate(
        'engagements.assignedProId',
        'name avatar phone title yearsExperience basePrice maxPrice currency avgRating totalReviews verificationStatus',
      )
      .lean()
      .exec();
    if (!project) throw new NotFoundException('Project not found');

    // Role-aware: only the client or an engaged pro may view.
    const clientId =
      (project.clientId as any)?._id?.toString() ||
      project.clientId?.toString();
    const isClient = clientId === userId;
    const isPro = (project.engagements ?? []).some(
      (e: any) => e.assignedProId?._id?.toString() === userId,
    );
    if (!isClient && !isPro) {
      throw new ForbiddenException('Not your project');
    }
    const viewerRole: 'client' | 'pro' = isClient ? 'client' : 'pro';

    const trackingIds = (project.engagements ?? [])
      .map((e: any) => e.projectTrackingId)
      .filter(Boolean);

    const trackings = trackingIds.length
      ? await this.projectTrackingModel
          .find({ _id: { $in: trackingIds } })
          .lean()
          .exec()
      : [];
    const trackingById = new Map(
      trackings.map((t: any) => [t._id.toString(), t]),
    );

    // Booked engagements (no workspace) derive progress from booking status.
    const bookingIds = (project.engagements ?? [])
      .map((e: any) => e.bookingId)
      .filter(Boolean);
    const bookings = bookingIds.length
      ? await this.bookingModel
          .find({ _id: { $in: bookingIds } })
          .lean()
          .exec()
      : [];
    const bookingById = new Map(
      bookings.map((b: any) => [b._id.toString(), b]),
    );

    type FeedItem = {
      engagementId: string;
      roleLabel: string;
      eventType?: string;
      userName?: string;
      userRole?: string;
      metadata?: any;
      createdAt: Date;
    };
    const activity: FeedItem[] = [];
    let progressSum = 0;
    const total = (project.engagements ?? []).length;

    for (const eng of project.engagements ?? []) {
      const t = eng.projectTrackingId
        ? trackingById.get(eng.projectTrackingId.toString())
        : undefined;
      const b = eng.bookingId
        ? bookingById.get(eng.bookingId.toString())
        : undefined;
      if (t) {
        (eng as any).stage = t.currentStage;
        (eng as any).workspaceProgress = t.progress ?? 0;
        progressSum += t.progress ?? 0;
        for (const ev of t.history ?? []) {
          activity.push({
            engagementId: eng.id,
            roleLabel: eng.roleLabel,
            eventType: ev.eventType,
            userName: ev.userName,
            userRole: ev.userRole,
            metadata: ev.metadata,
            createdAt: ev.createdAt,
          });
        }
      } else if (b) {
        // Booked engagement: stage/progress from booking status.
        const pct = BOOKING_PROGRESS[b.status] ?? 0;
        (eng as any).stage = b.status;
        (eng as any).workspaceProgress = pct;
        progressSum += pct;
      } else if (eng.status === EngagementStatus.COMPLETED) {
        progressSum += 100;
      }
    }

    const progress = total ? Math.round(progressSum / total) : 0;
    activity.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Group engagements + milestones by phase, in canonical order. Each
    // phase gets its own averaged progress so the timeline can show per-
    // phase bars. Engagements were enriched with workspaceProgress above.
    const engagementsByPhase = (phase: ProjectPhase) =>
      (project.engagements ?? []).filter(
        (e: any) => (e.phase || ProjectPhase.CONSTRUCTION) === phase,
      );
    const phases = PHASE_ORDER.map((phase) => {
      const engs = engagementsByPhase(phase);
      const ms = (project.milestones ?? []).filter(
        (m: any) => m.phase === phase,
      );
      const docs = (project.documents ?? []).filter(
        (d: any) => d.phase === phase,
      );
      const phaseProgress = engs.length
        ? Math.round(
            engs.reduce(
              (s: number, e: any) =>
                s +
                (e.workspaceProgress ??
                  (e.status === EngagementStatus.COMPLETED ? 100 : 0)),
              0,
            ) / engs.length,
          )
        : 0;
      return {
        key: phase,
        engagementIds: engs.map((e: any) => e.id),
        milestoneIds: ms.map((m: any) => m.id),
        documentIds: docs.map((d: any) => d.id),
        progress: phaseProgress,
        roleCount: engs.length,
      };
    });

    // Budget rollup: planned = sum of engagement budgets; committed = sum
    // of agreed prices on hired/completed engagements (from their tracking).
    const budgetPlanned = (project.engagements ?? []).reduce(
      (s: number, e: any) => s + (e.budget || 0),
      0,
    );
    const budgetCommitted = (project.engagements ?? []).reduce(
      (s: number, e: any) => {
        const t = e.projectTrackingId
          ? trackingById.get(e.projectTrackingId.toString())
          : undefined;
        return s + (t?.agreedPrice || 0);
      },
      0,
    );

    // Auto-derive milestone status from linked engagements (manual status
    // is preserved when a milestone has no links).
    for (const ms of project.milestones ?? []) {
      const links = ms.linkedEngagementIds ?? [];
      if (links.length === 0) continue;
      const linked = (project.engagements ?? []).filter((e: any) =>
        links.includes(e.id),
      );
      if (linked.length === 0) continue;
      const allDone = linked.every(
        (e: any) => e.status === EngagementStatus.COMPLETED,
      );
      const anyActive = linked.some((e: any) =>
        [EngagementStatus.HIRED, EngagementStatus.IN_PROGRESS].includes(
          e.status,
        ),
      );
      (ms as any).status = allDone
        ? MilestoneStatus.DONE
        : anyActive
          ? MilestoneStatus.ACTIVE
          : ms.status;
    }

    // Procurement rollup: total cost of the shopping list + a stock split
    // (to-buy vs ordered vs delivered) for the Shopping/stock tab.
    const products = (project.products ?? []) as any[];
    const procurement = {
      total: products.reduce(
        (s, p) => s + (p.unitPrice || 0) * (p.qty || 0),
        0,
      ),
      toBuy: products.filter((p) => p.status === ProductStatus.TO_BUY).length,
      ordered: products.filter((p) => p.status === ProductStatus.ORDERED).length,
      delivered: products.filter((p) => p.status === ProductStatus.DELIVERED)
        .length,
      count: products.length,
    };

    return {
      ...project,
      progress,
      activity: activity.slice(0, 50),
      phases,
      budget: { planned: budgetPlanned, committed: budgetCommitted },
      procurement,
      viewerRole,
    };
  }

  // Load a project and assert the caller owns it (client). Used by all
  // mutating endpoints so one client can't edit another's project.
  private async findOwned(
    id: string,
    clientId: string,
  ): Promise<ProjectRequest> {
    const project = await this.projectRequestModel.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId.toString() !== clientId) {
      throw new ForbiddenException('Not your project');
    }
    return project;
  }

  // Is this user allowed to view the project? Client owner, or any pro with
  // an engagement on it (role-aware dashboard). Returns the participant role.
  private viewerRole(
    project: ProjectRequest,
    userId: string,
  ): 'client' | 'pro' | null {
    if (project.clientId.toString() === userId) return 'client';
    const isPro = (project.engagements ?? []).some(
      (e) => e.assignedProId?.toString() === userId,
    );
    return isPro ? 'pro' : null;
  }

  // Load + assert the user is the client or an engaged pro. Used by the
  // dashboard read and pro-side mutations (their own engagement only).
  private async findForViewer(
    id: string,
    userId: string,
  ): Promise<{ project: ProjectRequest; role: 'client' | 'pro' }> {
    const project = await this.projectRequestModel.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found');
    const role = this.viewerRole(project, userId);
    if (!role) throw new ForbiddenException('Not your project');
    return { project, role };
  }

  // === Documents / deliverables ===

  // Client or any engaged pro can upload. Pros' uploads default to a
  // deliverable pending the client's approval.
  async addDocument(
    id: string,
    userId: string,
    dto: AddDocumentDto,
  ): Promise<ProjectRequest> {
    const { project, role } = await this.findForViewer(id, userId);
    const isDeliverable =
      (dto.category ?? DocumentCategory.OTHER) === DocumentCategory.DELIVERABLE ||
      dto.category === DocumentCategory.DRAWING;
    project.documents.push({
      id: this.shortId('D'),
      name: dto.name,
      url: dto.url,
      fileType: dto.fileType,
      category: dto.category ?? DocumentCategory.OTHER,
      phase: dto.phase,
      engagementId: dto.engagementId,
      stepId: dto.stepId || undefined,
      version: 1,
      uploadedBy: new Types.ObjectId(userId),
      // A pro's deliverable starts pending the client's review; client's
      // own uploads need no approval.
      approvalStatus:
        role === 'pro' && isDeliverable
          ? ApprovalStatus.PENDING
          : ApprovalStatus.NONE,
      note: dto.note,
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  // Client approves / requests changes on a deliverable.
  async setDocumentApproval(
    id: string,
    clientId: string,
    docId: string,
    dto: ApproveDocumentDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const doc = project.documents.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Document not found');
    doc.approvalStatus = dto.status;
    if (dto.note !== undefined) doc.note = dto.note;
    return project.save();
  }

  // Upload a new version of an existing document. The outgoing version is
  // snapshotted into `versions[]` (so prior files stay reachable), the
  // top-level fields move to the new file, the version number bumps, and a
  // deliverable/drawing goes back to PENDING so the client re-approves the
  // new revision. Only the original uploader or the client can re-version.
  async addDocumentVersion(
    id: string,
    userId: string,
    docId: string,
    dto: AddDocumentVersionDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const doc = project.documents.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Document not found');
    const isClient = project.clientId.toString() === userId;
    if (!isClient && doc.uploadedBy?.toString() !== userId) {
      throw new ForbiddenException('Cannot version this document');
    }
    // Snapshot the current (outgoing) version into history.
    if (!Array.isArray(doc.versions)) doc.versions = [];
    doc.versions.push({
      version: doc.version,
      url: doc.url,
      fileType: doc.fileType,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt,
    } as any);
    // Promote the new file to current.
    doc.version = (doc.version ?? 1) + 1;
    doc.url = dto.url;
    if (dto.name) doc.name = dto.name;
    doc.fileType = dto.fileType;
    doc.uploadedBy = new Types.ObjectId(userId);
    doc.createdAt = new Date();
    doc.note = undefined;
    // A re-issued deliverable/drawing needs fresh client sign-off.
    const needsApproval =
      doc.category === DocumentCategory.DELIVERABLE ||
      doc.category === DocumentCategory.DRAWING;
    doc.approvalStatus = needsApproval
      ? ApprovalStatus.PENDING
      : ApprovalStatus.NONE;
    return project.save();
  }

  async removeDocument(
    id: string,
    userId: string,
    docId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const doc = project.documents.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Document not found');
    // Only the uploader or the client can remove.
    const isClient = project.clientId.toString() === userId;
    if (!isClient && doc.uploadedBy?.toString() !== userId) {
      throw new ForbiddenException('Cannot remove this document');
    }
    project.documents = project.documents.filter((d) => d.id !== docId);
    return project.save();
  }

  // Any project participant (client or engaged pro) can comment on a
  // document. `authorId` is taken from the JWT; `authorName` is a
  // denormalized display label supplied by the client.
  async addDocumentComment(
    id: string,
    userId: string,
    docId: string,
    dto: AddDocumentCommentDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const doc = project.documents.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Document not found');
    const text = (dto.text || '').trim();
    if (!text) throw new ForbiddenException('Comment cannot be empty');
    if (!Array.isArray(doc.comments)) doc.comments = [];
    // A pin requires both coordinates; otherwise it's a general comment.
    const hasPin =
      typeof dto.x === 'number' && typeof dto.y === 'number';
    doc.comments.push({
      id: this.shortId('C'),
      text,
      authorId: new Types.ObjectId(userId),
      authorName: dto.authorName,
      x: hasPin ? dto.x : undefined,
      y: hasPin ? dto.y : undefined,
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  async removeDocumentComment(
    id: string,
    userId: string,
    docId: string,
    commentId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const doc = project.documents.find((d) => d.id === docId);
    if (!doc) throw new NotFoundException('Document not found');
    const comment = (doc.comments ?? []).find((c) => c.id === commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    // Only the comment's author or the client can remove it.
    const isClient = project.clientId.toString() === userId;
    if (!isClient && comment.authorId?.toString() !== userId) {
      throw new ForbiddenException('Cannot remove this comment');
    }
    doc.comments = (doc.comments ?? []).filter((c) => c.id !== commentId);
    return project.save();
  }

  // === Decision log ===

  // Any project participant can log a decision. `decidedBy` comes from the
  // JWT; `decidedByName` is a denormalized display label from the client.
  async addDecision(
    id: string,
    userId: string,
    dto: AddDecisionDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const text = (dto.text || '').trim();
    if (!text) throw new ForbiddenException('Decision cannot be empty');
    if (!Array.isArray(project.decisions)) project.decisions = [];
    project.decisions.push({
      id: this.shortId('DEC'),
      text,
      decidedBy: new Types.ObjectId(userId),
      decidedByName: dto.decidedByName,
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  async removeDecision(
    id: string,
    userId: string,
    decisionId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const decision = (project.decisions ?? []).find((d) => d.id === decisionId);
    if (!decision) throw new NotFoundException('Decision not found');
    // Only the author or the client can remove a logged decision.
    const isClient = project.clientId.toString() === userId;
    if (!isClient && decision.decidedBy?.toString() !== userId) {
      throw new ForbiddenException('Cannot remove this decision');
    }
    project.decisions = (project.decisions ?? []).filter(
      (d) => d.id !== decisionId,
    );
    return project.save();
  }

  // === Palette & selections (designer/architect) ===

  private mapOption(dto: SelectionOptionDto): any {
    return {
      id: this.shortId('SO'),
      type: dto.type ?? 'material',
      name: dto.name,
      colorHex: dto.colorHex,
      imageUrl: dto.imageUrl,
      brand: dto.brand,
      product: dto.product,
      price: dto.price,
      vendor: dto.vendor,
      url: dto.url,
      note: dto.note,
    };
  }

  async addSelection(
    id: string,
    userId: string,
    dto: CreateSelectionDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    if (!Array.isArray(project.selections)) project.selections = [];
    project.selections.push({
      id: this.shortId('SEL'),
      title: dto.title,
      roomId: dto.roomId,
      surface: dto.surface,
      phase: dto.phase,
      options: (dto.options ?? []).map((o) => this.mapOption(o)),
      status: SelectionStatus.PROPOSED,
      note: dto.note,
      createdBy: new Types.ObjectId(userId),
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  async updateSelection(
    id: string,
    userId: string,
    selectionId: string,
    dto: UpdateSelectionDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const sel = (project.selections ?? []).find((s) => s.id === selectionId);
    if (!sel) throw new NotFoundException('Selection not found');
    Object.assign(
      sel,
      Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    );
    return project.save();
  }

  async removeSelection(
    id: string,
    userId: string,
    selectionId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    project.selections = (project.selections ?? []).filter(
      (s) => s.id !== selectionId,
    );
    return project.save();
  }

  async addSelectionOption(
    id: string,
    userId: string,
    selectionId: string,
    dto: SelectionOptionDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const sel = (project.selections ?? []).find((s) => s.id === selectionId);
    if (!sel) throw new NotFoundException('Selection not found');
    sel.options.push(this.mapOption(dto));
    return project.save();
  }

  async updateSelectionOption(
    id: string,
    userId: string,
    selectionId: string,
    optionId: string,
    dto: SelectionOptionDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const sel = (project.selections ?? []).find((s) => s.id === selectionId);
    if (!sel) throw new NotFoundException('Selection not found');
    const opt = sel.options.find((o) => o.id === optionId);
    if (!opt) throw new NotFoundException('Option not found');
    Object.assign(
      opt,
      Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    );
    return project.save();
  }

  async removeSelectionOption(
    id: string,
    userId: string,
    selectionId: string,
    optionId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const sel = (project.selections ?? []).find((s) => s.id === selectionId);
    if (!sel) throw new NotFoundException('Selection not found');
    sel.options = sel.options.filter((o) => o.id !== optionId);
    if (sel.chosenOptionId === optionId) sel.chosenOptionId = undefined;
    return project.save();
  }

  // Client picks an option - records the choice and approves the selection.
  async chooseSelection(
    id: string,
    clientId: string,
    selectionId: string,
    dto: ChooseSelectionDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const sel = (project.selections ?? []).find((s) => s.id === selectionId);
    if (!sel) throw new NotFoundException('Selection not found');
    if (!sel.options.some((o) => o.id === dto.chosenOptionId)) {
      throw new NotFoundException('Option not found');
    }
    sel.chosenOptionId = dto.chosenOptionId;
    sel.status = SelectionStatus.APPROVED;
    return project.save();
  }

  // Client approves / requests changes on a selection.
  async reviewSelection(
    id: string,
    clientId: string,
    selectionId: string,
    dto: ReviewSelectionDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const sel = (project.selections ?? []).find((s) => s.id === selectionId);
    if (!sel) throw new NotFoundException('Selection not found');
    sel.status = dto.status;
    if (dto.note !== undefined) sel.note = dto.note;
    return project.save();
  }

  // === Rooms / spaces ===

  private withArea(data: {
    length?: number;
    width?: number;
    area?: number;
  }): number | undefined {
    if (data.area != null) return data.area;
    if (data.length != null && data.width != null) {
      return Math.round(data.length * data.width * 100) / 100;
    }
    return undefined;
  }

  async addRoom(
    id: string,
    userId: string,
    dto: CreateRoomDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    if (!Array.isArray(project.rooms)) project.rooms = [];
    project.rooms.push({
      id: this.shortId('RM'),
      name: dto.name,
      length: dto.length,
      width: dto.width,
      height: dto.height,
      area: this.withArea(dto),
      budget: dto.budget,
      note: dto.note,
      photos: dto.photos ?? [],
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  async updateRoom(
    id: string,
    userId: string,
    roomId: string,
    dto: UpdateRoomDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const room = (project.rooms ?? []).find((r) => r.id === roomId);
    if (!room) throw new NotFoundException('Room not found');
    Object.assign(
      room,
      Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)),
    );
    // Recompute area unless explicitly provided.
    if (dto.area == null) {
      const a = this.withArea({
        length: room.length,
        width: room.width,
      });
      if (a != null) room.area = a;
    }
    return project.save();
  }

  async removeRoom(
    id: string,
    userId: string,
    roomId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    project.rooms = (project.rooms ?? []).filter((r) => r.id !== roomId);
    // Unlink selections that pointed at this room.
    for (const sel of project.selections ?? []) {
      if (sel.roomId === roomId) sel.roomId = undefined;
    }
    return project.save();
  }

  // === Scope / takeoff (bill of works) ===

  async addScopeItem(
    id: string,
    clientId: string,
    dto: CreateScopeItemDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    if (!Array.isArray(project.scopeItems)) project.scopeItems = [];
    project.scopeItems.push({
      id: this.shortId('SC'),
      roomId: dto.roomId || undefined,
      stepId: dto.stepId || undefined,
      categoryKey: dto.categoryKey,
      serviceKey: dto.serviceKey,
      name: dto.name,
      quantity: dto.quantity,
      unit: dto.unit,
      unitLabel: dto.unitLabel,
      unitPrice: dto.unitPrice,
      engagementId: dto.engagementId || undefined,
      note: dto.note,
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  async updateScopeItem(
    id: string,
    clientId: string,
    itemId: string,
    dto: UpdateScopeItemDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const item = (project.scopeItems ?? []).find((s) => s.id === itemId);
    if (!item) throw new NotFoundException('Scope item not found');
    // Link fields: an explicit empty string clears the link (move to
    // general / unassign worker); omitting the key leaves it unchanged.
    if ('roomId' in dto) item.roomId = dto.roomId || undefined;
    if ('stepId' in dto) item.stepId = dto.stepId || undefined;
    if ('engagementId' in dto) item.engagementId = dto.engagementId || undefined;
    for (const [k, v] of Object.entries(dto)) {
      if (k === 'roomId' || k === 'stepId' || k === 'engagementId') continue;
      if (v !== undefined) (item as any)[k] = v;
    }
    return project.save();
  }

  async removeScopeItem(
    id: string,
    clientId: string,
    itemId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    project.scopeItems = (project.scopeItems ?? []).filter(
      (s) => s.id !== itemId,
    );
    return project.save();
  }

  // Create (or reuse) an engagement that represents the pro for this service
  // line, and link it back to the scope item. Returns the project so the
  // client can then run the standard invite / open / book flow on the
  // engagement (scopeItem.engagementId now points at it). Idempotent: if the
  // service already points at a live engagement, returns unchanged.
  async engageScopeItem(
    id: string,
    clientId: string,
    itemId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const item = (project.scopeItems ?? []).find((s) => s.id === itemId);
    if (!item) throw new NotFoundException('Scope item not found');
    if (
      item.engagementId &&
      project.engagements.some((e) => e.id === item.engagementId)
    ) {
      return project;
    }
    const roleKey = item.categoryKey || item.serviceKey || 'handyman';
    const eng = {
      id: this.shortId('E'),
      roleKey,
      roleLabel: item.name,
      scope: item.note,
      budget:
        item.unitPrice && item.quantity
          ? Math.round(item.unitPrice * item.quantity)
          : undefined,
      mode: EngagementMode.OPEN,
      status: EngagementStatus.DRAFT,
      phase: phaseForRole(roleKey),
      stepId: item.stepId,
      designApproval: isDesignRole(roleKey)
        ? { phase: DesignPhase.CONCEPT, status: ApprovalStatus.NONE }
        : undefined,
    } as ProjectEngagement;
    project.engagements.push(eng);
    item.engagementId = eng.id;
    return project.save();
  }

  // === Design phase gate (architect/designer) ===

  // The assigned pro sets/advances their current design phase and submits it
  // for the client's review.
  async submitDesignPhase(
    id: string,
    proId: string,
    engagementId: string,
    dto: DesignPhaseDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, proId);
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng) throw new NotFoundException('Engagement not found');
    if (eng.assignedProId?.toString() !== proId) {
      throw new ForbiddenException('Not your engagement');
    }
    eng.designApproval = {
      phase: dto.phase ?? eng.designApproval?.phase ?? DesignPhase.CONCEPT,
      status: dto.status ?? ApprovalStatus.PENDING,
      note: dto.note,
    } as any;
    return project.save();
  }

  // Client reviews the submitted design phase. On approval, advance to the
  // next design phase (concept -> schematic -> detailed -> construction docs).
  async reviewDesignPhase(
    id: string,
    clientId: string,
    engagementId: string,
    dto: ApproveDocumentDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng || !eng.designApproval) {
      throw new NotFoundException('Design engagement not found');
    }
    eng.designApproval.status = dto.status;
    if (dto.note !== undefined) eng.designApproval.note = dto.note;
    if (dto.status === ApprovalStatus.APPROVED) {
      const order = [
        DesignPhase.CONCEPT,
        DesignPhase.SCHEMATIC,
        DesignPhase.DETAILED,
        DesignPhase.CONSTRUCTION_DOCS,
      ];
      const idx = order.indexOf(eng.designApproval.phase as DesignPhase);
      if (idx >= 0 && idx < order.length - 1) {
        eng.designApproval.phase = order[idx + 1];
        eng.designApproval.status = ApprovalStatus.NONE;
      }
    }
    return project.save();
  }

  // === Shopping list / procurement ===

  async addProduct(
    id: string,
    userId: string,
    dto: AddProductDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    project.products.push({
      id: this.shortId('P'),
      name: dto.name,
      qty: dto.qty ?? 1,
      unitPrice: dto.unitPrice ?? 0,
      vendor: dto.vendor,
      url: dto.url,
      imageUrl: dto.imageUrl,
      phase: dto.phase,
      engagementId: dto.engagementId,
      roomId: dto.roomId || undefined,
      status: ProductStatus.TO_BUY,
      note: dto.note,
      createdAt: new Date(),
    } as any);
    return project.save();
  }

  async updateProduct(
    id: string,
    userId: string,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const product = project.products.find((p) => p.id === productId);
    if (!product) throw new NotFoundException('Product not found');
    // Explicit empty string clears the room link (move to whole-object).
    if ('roomId' in dto) product.roomId = dto.roomId || undefined;
    Object.assign(
      product,
      Object.fromEntries(
        Object.entries(dto).filter(
          ([k, v]) => k !== 'roomId' && v !== undefined,
        ),
      ),
    );
    return project.save();
  }

  async removeProduct(
    id: string,
    userId: string,
    productId: string,
  ): Promise<ProjectRequest> {
    const { project } = await this.findForViewer(id, userId);
    const product = project.products.find((p) => p.id === productId);
    if (!product) throw new NotFoundException('Product not found');
    project.products = project.products.filter((p) => p.id !== productId);
    return project.save();
  }

  // Client edits top-level project settings (title, budget, dates, status,
  // site info). Only provided fields are changed.
  async updateProject(
    id: string,
    clientId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const patch: any = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    if (dto.estimatedStartDate)
      patch.estimatedStartDate = new Date(dto.estimatedStartDate);
    if (dto.estimatedEndDate)
      patch.estimatedEndDate = new Date(dto.estimatedEndDate);
    Object.assign(project, patch);
    return project.save();
  }

  async updateStatus(
    id: string,
    status: ProjectStatus,
  ): Promise<ProjectRequest> {
    const request = await this.projectRequestModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!request) {
      throw new NotFoundException('Project not found');
    }

    return request;
  }

  async assignToPro(id: string, proId: string): Promise<ProjectRequest> {
    const request = await this.projectRequestModel
      .findByIdAndUpdate(id, { proId }, { new: true })
      .exec();

    if (!request) {
      throw new NotFoundException('Project not found');
    }

    return request;
  }

  // === Engagements ===

  async addEngagement(
    id: string,
    clientId: string,
    dto: AddEngagementDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    if (dto.stepId && !project.steps.some((s) => s.id === dto.stepId)) {
      throw new NotFoundException('Step not found on this project');
    }
    project.engagements.push({
      id: this.shortId('E'),
      roleKey: dto.roleKey,
      roleLabel: dto.roleLabel,
      scope: dto.scope,
      budget: dto.budget,
      mode: dto.mode ?? EngagementMode.OPEN,
      status: EngagementStatus.DRAFT,
      phase: dto.phase ?? phaseForRole(dto.roleKey),
      stepId: dto.stepId,
      designApproval: isDesignRole(dto.roleKey)
        ? { phase: DesignPhase.CONCEPT, status: ApprovalStatus.NONE }
        : undefined,
    } as ProjectEngagement);
    return project.save();
  }

  async updateEngagement(
    id: string,
    engagementId: string,
    clientId: string,
    dto: UpdateEngagementDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng) throw new NotFoundException('Engagement not found');
    if (
      dto.stepId != null &&
      dto.stepId !== '' &&
      !project.steps.some((s) => s.id === dto.stepId)
    ) {
      throw new NotFoundException('Step not found on this project');
    }
    // Explicit null/'' detaches; everything else assigns normally.
    const { stepId, ...rest } = dto;
    Object.assign(eng, rest);
    if (stepId === null || stepId === '') {
      eng.stepId = undefined;
    } else if (stepId !== undefined) {
      eng.stepId = stepId;
    }
    this.recomputeProgress(project);
    return project.save();
  }

  async removeEngagement(
    id: string,
    engagementId: string,
    clientId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    project.engagements = project.engagements.filter(
      (e) => e.id !== engagementId,
    );
    this.recomputeProgress(project);
    return project.save();
  }

  // === Project steps ===

  async addStep(
    id: string,
    clientId: string,
    dto: { name: string; description?: string; color?: string },
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const order = project.steps.length;
    project.steps.push({
      id: this.shortId('S'),
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      color: dto.color,
      order,
    });
    return project.save();
  }

  async updateStep(
    id: string,
    stepId: string,
    clientId: string,
    dto: { name?: string; description?: string; color?: string },
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const step = project.steps.find((s) => s.id === stepId);
    if (!step) throw new NotFoundException('Step not found');
    if (dto.name !== undefined) step.name = dto.name.trim();
    if (dto.description !== undefined) {
      step.description = dto.description.trim() || undefined;
    }
    if (dto.color !== undefined) step.color = dto.color;
    return project.save();
  }

  async removeStep(
    id: string,
    stepId: string,
    clientId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    project.steps = project.steps.filter((s) => s.id !== stepId);
    // Detach any engagements that pointed at this step so the data stays
    // consistent (the engagement falls back to its legacy phase).
    project.engagements.forEach((e) => {
      if (e.stepId === stepId) e.stepId = undefined;
    });
    // Detach any scope items (services) that lived under this step; they
    // become unassigned services rather than vanishing.
    (project.scopeItems ?? []).forEach((s) => {
      if (s.stepId === stepId) s.stepId = undefined;
    });
    // Detach any documents filed under this step.
    (project.documents ?? []).forEach((d) => {
      if (d.stepId === stepId) d.stepId = undefined;
    });
    // Compact the order field so it stays gap-free.
    project.steps
      .sort((a, b) => a.order - b.order)
      .forEach((s, i) => {
        s.order = i;
      });
    return project.save();
  }

  async reorderSteps(
    id: string,
    clientId: string,
    orderedIds: string[],
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const indexById = new Map(orderedIds.map((sid, i) => [sid, i] as const));
    // Steps not in the list get pushed to the end in their original order.
    let tail = orderedIds.length;
    project.steps.forEach((s) => {
      const i = indexById.get(s.id);
      s.order = i != null ? i : tail++;
    });
    project.steps.sort((a, b) => a.order - b.order);
    return project.save();
  }

  // === Milestones ===

  async addMilestone(
    id: string,
    clientId: string,
    dto: AddMilestoneDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    project.milestones.push({
      id: this.shortId('M'),
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      phase: dto.phase,
      status: MilestoneStatus.PENDING,
      sortOrder: project.milestones.length,
      linkedEngagementIds: dto.linkedEngagementIds ?? [],
    } as Milestone);
    return project.save();
  }

  async updateMilestone(
    id: string,
    milestoneId: string,
    clientId: string,
    dto: UpdateMilestoneDto,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const ms = project.milestones.find((m) => m.id === milestoneId);
    if (!ms) throw new NotFoundException('Milestone not found');
    const patch: any = { ...dto };
    if (dto.dueDate) patch.dueDate = new Date(dto.dueDate);
    Object.assign(ms, patch);
    return project.save();
  }

  async removeMilestone(
    id: string,
    milestoneId: string,
    clientId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    project.milestones = project.milestones.filter(
      (m) => m.id !== milestoneId,
    );
    return project.save();
  }

  // === Engagement fulfillment (hybrid: open / invite) ===

  // Build the scoped CreateJobDto shared by both fulfillment paths. The
  // job inherits the project's location/budget and is tagged with
  // projectId/engagementId so acceptProposal can backfill the engagement.
  private buildScopedJob(
    project: ProjectRequest,
    eng: ProjectEngagement,
    invitedPros?: string[],
  ): any {
    const budget = eng.budget ?? project.budgetMax;
    return {
      jobType: JobType.MARKETPLACE,
      title: `${project.title} - ${eng.roleLabel}`,
      description: eng.scope || project.description,
      // The engagement's roleKey is a catalog category (the trade needed),
      // so it drives the job category - that's what surfaces the role to
      // the right pros. Fall back to the project's category for legacy/custom.
      category: eng.roleKey || project.category,
      location: project.location,
      budgetType: budget ? JobBudgetType.RANGE : JobBudgetType.NEGOTIABLE,
      budgetMin: budget ? Math.round(budget * 0.7) : undefined,
      budgetMax: budget,
      images: project.photos ?? [],
      projectId: (project._id as Types.ObjectId).toString(),
      engagementId: eng.id,
      invitedPros,
    };
  }

  // Open a role to the marketplace: any pro can quote on the scoped job.
  async openEngagement(
    id: string,
    engagementId: string,
    clientId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng) throw new NotFoundException('Engagement not found');

    const job = await this.jobsService.createJob(
      clientId,
      this.buildScopedJob(project, eng),
    );

    eng.mode = EngagementMode.OPEN;
    eng.status = EngagementStatus.OPEN;
    eng.jobId = job._id as Types.ObjectId;
    return project.save();
  }

  // Invite a specific pro to a role: creates the scoped job and auto-invites
  // the pro (createJob fires the invitation notification). The pro then
  // submits a proposal; the standard acceptProposal flow hires + backfills.
  async inviteToEngagement(
    id: string,
    engagementId: string,
    clientId: string,
    proId: string,
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng) throw new NotFoundException('Engagement not found');

    const job = await this.jobsService.createJob(
      clientId,
      this.buildScopedJob(project, eng, [proId]),
    );

    eng.mode = EngagementMode.INVITE;
    eng.status = EngagementStatus.INVITED;
    eng.jobId = job._id as Types.ObjectId;
    eng.assignedProId = new Types.ObjectId(proId);
    return project.save();
  }

  // === Pro-side direct invite responses ===
  // The pro who was named on an engagement (`assignedProId`) can accept or
  // decline the role without going through the scoped-job proposal flow.
  // Accept transitions INVITED -> HIRED so the pro lands in the regular
  // project workspace. Decline clears the assignment so the owner can pick
  // someone else.
  async acceptEngagementInvite(
    id: string,
    engagementId: string,
    userId: string,
  ): Promise<ProjectRequest> {
    const project = await this.projectRequestModel.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found');
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng) throw new NotFoundException('Engagement not found');
    if (eng.assignedProId?.toString() !== userId) {
      throw new ForbiddenException('Not your invitation');
    }
    if (eng.status !== EngagementStatus.INVITED) {
      throw new ForbiddenException('Invitation is no longer pending');
    }
    eng.status = EngagementStatus.HIRED;
    this.recomputeProgress(project);
    return project.save();
  }

  async declineEngagementInvite(
    id: string,
    engagementId: string,
    userId: string,
  ): Promise<ProjectRequest> {
    const project = await this.projectRequestModel.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found');
    const eng = project.engagements.find((e) => e.id === engagementId);
    if (!eng) throw new NotFoundException('Engagement not found');
    if (eng.assignedProId?.toString() !== userId) {
      throw new ForbiddenException('Not your invitation');
    }
    if (eng.status !== EngagementStatus.INVITED) {
      throw new ForbiddenException('Invitation is no longer pending');
    }
    eng.status = EngagementStatus.DRAFT;
    eng.assignedProId = undefined;
    eng.mode = EngagementMode.OPEN;
    eng.jobId = undefined;
    return project.save();
  }

  // List every engagement the current pro has an open invite on. Returns
  // a flat list with project context so the inbox can render one row per
  // pending invite without the client needing to crawl projects.
  async listMyInvitations(userId: string) {
    const projects = await this.projectRequestModel
      .find({
        engagements: {
          $elemMatch: {
            assignedProId: new Types.ObjectId(userId),
            status: EngagementStatus.INVITED,
          },
        },
      })
      .populate('clientId', 'name avatar')
      .lean()
      .exec();
    type ProjectLean = {
      _id: Types.ObjectId;
      title?: string;
      location?: string;
      coverImage?: string;
      clientId?: { _id: Types.ObjectId; name?: string; avatar?: string };
      engagements?: Array<{
        id: string;
        roleLabel: string;
        roleKey?: string;
        scope?: string;
        budget?: number;
        phase?: string;
        status: EngagementStatus;
        assignedProId?: Types.ObjectId;
      }>;
    };
    return projects.flatMap((p) => {
      const lean = p as unknown as ProjectLean;
      return (lean.engagements ?? [])
        .filter(
          (e) =>
            e.status === EngagementStatus.INVITED &&
            e.assignedProId?.toString() === userId,
        )
        .map((e) => ({
          projectId: lean._id.toString(),
          projectTitle: lean.title,
          projectLocation: lean.location,
          projectCover: lean.coverImage,
          clientName: lean.clientId?.name,
          clientAvatar: lean.clientId?.avatar,
          engagement: {
            id: e.id,
            roleLabel: e.roleLabel,
            roleKey: e.roleKey,
            scope: e.scope,
            budget: e.budget,
            phase: e.phase,
          },
        }));
    });
  }

  // === Graduate: fold a standalone booking or job into a project ===
  // Creates a new engagement from the existing entity and stamps the
  // back-ref on the source so it surfaces in the project dashboard.
  async attachToProject(
    id: string,
    clientId: string,
    dto: { bookingId?: string; jobId?: string; roleLabel?: string },
  ): Promise<ProjectRequest> {
    const project = await this.findOwned(id, clientId);
    const engId = this.shortId('E');

    if (dto.bookingId) {
      const booking = await this.bookingModel.findById(dto.bookingId).exec();
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.client.toString() !== clientId) {
        throw new ForbiddenException('Not your booking');
      }
      const done = booking.status === BookingStatus.COMPLETED;
      project.engagements.push({
        id: engId,
        roleKey: 'booking',
        roleLabel: dto.roleLabel || 'Booked service',
        mode: EngagementMode.INVITE,
        status: done ? EngagementStatus.COMPLETED : EngagementStatus.HIRED,
        assignedProId: booking.professional,
        bookingId: booking._id as Types.ObjectId,
      } as ProjectEngagement);
      booking.projectId = project._id as Types.ObjectId;
      booking.engagementId = engId;
      await booking.save();
    } else if (dto.jobId) {
      const job = await this.jobModel.findById(dto.jobId).exec();
      if (!job) throw new NotFoundException('Job not found');
      if (job.clientId.toString() !== clientId) {
        throw new ForbiddenException('Not your job');
      }
      const tracking = await this.projectTrackingModel
        .findOne({ jobId: job._id })
        .exec();
      project.engagements.push({
        id: engId,
        roleKey: job.subcategory || job.category || 'job',
        roleLabel: dto.roleLabel || job.title,
        mode: EngagementMode.OPEN,
        status: tracking
          ? EngagementStatus.HIRED
          : EngagementStatus.OPEN,
        assignedProId: tracking?.proId,
        jobId: job._id as Types.ObjectId,
        proposalId: tracking?.proposalId,
        projectTrackingId: tracking?._id as Types.ObjectId | undefined,
      } as ProjectEngagement);
      job.projectId = project._id as Types.ObjectId;
      job.engagementId = engId;
      await job.save();
      if (tracking) {
        tracking.projectId = project._id as Types.ObjectId;
        tracking.engagementId = engId;
        await tracking.save();
      }
    } else {
      throw new NotFoundException('Provide a bookingId or jobId to attach');
    }

    this.recomputeProgress(project);
    return project.save();
  }

  // Roll project progress up from engagement completion. Simple average:
  // completed engagements count as 100%, everything else 0%. Phase 3 will
  // refine this using each engagement's ProjectTracking.progress.
  private recomputeProgress(project: ProjectRequest): void {
    const total = project.engagements.length;
    if (total === 0) {
      project.progress = 0;
      return;
    }
    const done = project.engagements.filter(
      (e) => e.status === COMPLETED_ENGAGEMENT,
    ).length;
    project.progress = Math.round((done / total) * 100);
  }
}
