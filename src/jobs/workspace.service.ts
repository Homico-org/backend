import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ProjectWorkspace,
  WorkspaceSection,
  WorkspaceItem,
  WorkspaceItemType,
  ItemReaction,
  ItemComment,
  ReactionType,
  SectionAttachment,
} from './schemas/workspace.schema';
import { ProjectTracking } from './schemas/project-tracking.schema';
import { User } from '../users/schemas/user.schema';
import { ChatGateway } from '../chat/chat.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(ProjectWorkspace.name) private workspaceModel: Model<ProjectWorkspace>,
    @InjectModel(ProjectTracking.name) private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(User.name) private userModel: Model<User>,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
    private notificationsService: NotificationsService,
  ) {}

  // Get or create workspace for a job
  async getWorkspace(jobId: string, userId: string): Promise<ProjectWorkspace> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this project');
    }

    let workspace = await this.workspaceModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!workspace) {
      // Create workspace if it doesn't exist
      workspace = new this.workspaceModel({
        jobId: new Types.ObjectId(jobId),
        clientId: project.clientId,
        proId: project.proId,
        sections: [],
      });
      await workspace.save();
    }

    return workspace;
  }

  // Create a new section
  async createSection(
    jobId: string,
    userId: string,
    data: {
      title: string;
      description?: string;
      attachments?: Array<{
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize?: number;
      }>;
    },
  ): Promise<{ section: WorkspaceSection }> {
    // Validate up front so a malformed direct API call never persists.
    // Frontend caps the input but server is the source of truth for any
    // unauthenticated request that slips past the frontend.
    const title = (data.title || '').trim();
    if (!title) {
      throw new BadRequestException('Section title is required');
    }
    if (title.length > 200) {
      throw new BadRequestException('Section title is too long (max 200 characters)');
    }
    if (data.description && data.description.length > 2000) {
      throw new BadRequestException('Section description is too long (max 2000 characters)');
    }

    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can create sections
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can create sections');
    }

    // Cap sections per workspace so a malicious client can't keep
    // appending until the document hits Mongo's 16MB limit.
    if (workspace.sections.length >= 50) {
      throw new BadRequestException(
        'Maximum number of sections reached (50 per project)',
      );
    }

    // Process attachments
    const processedAttachments: SectionAttachment[] = (data.attachments || []).map(att => ({
      _id: new Types.ObjectId(),
      fileName: att.fileName,
      fileUrl: att.fileUrl,
      fileType: att.fileType,
      fileSize: att.fileSize,
      uploadedAt: new Date(),
    } as SectionAttachment));

    const section: WorkspaceSection = {
      _id: new Types.ObjectId(),
      title,
      description: data.description,
      attachments: processedAttachments,
      items: [],
      order: workspace.sections.length,
      createdBy: new Types.ObjectId(userId),
      createdAt: new Date(),
    } as WorkspaceSection;

    workspace.sections.push(section);
    await workspace.save();

    // Emit WebSocket event
    this.chatGateway.emitMaterialsUpdate(jobId, {
      type: 'section_added',
      section,
    });

    // Send notification to client
    try {
      const pro = await this.userModel.findById(userId).select('name').exec();
      const proName = pro?.name || 'A professional';
      await this.notificationsService.notify(
        workspace.clientId.toString(),
        NotificationType.PROJECT_MATERIAL_ADDED,
        'New materials',
        `${proName} added materials: "${data.title}"`,
        {
          link: `/jobs/${jobId}`,
          referenceId: jobId,
          referenceModel: 'Job',
          i18n: {
            titleKey: 'notifications.types.project_material_added.title',
            messageKey: 'notifications.types.project_material_added.message',
            params: { proName, sectionTitle: data.title },
          },
          metadata: { sectionTitle: data.title },
        },
      );
    } catch (error) {
      console.error('[WorkspaceService] Failed to send section added notification:', error);
    }

    return { section };
  }

  // Update a section
  async updateSection(
    jobId: string,
    sectionId: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      attachments?: Array<{
        _id?: string;
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize?: number;
      }>;
    },
  ): Promise<{ section: WorkspaceSection }> {
    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can update sections
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can update sections');
    }

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    if (data.title !== undefined) section.title = data.title;
    if (data.description !== undefined) section.description = data.description;

    // Update attachments if provided. Be defensive about `att._id`:
    //   - missing or temp- prefix: mint a new ObjectId
    //   - already an ObjectId instance: pass through
    //   - valid 24-char hex string: convert
    //   - anything else: mint a new one (avoid CastError 500)
    // Previously this called `att._id?.startsWith('temp-')` which throws
    // when `_id` is an ObjectId instance rather than a string, and
    // `new Types.ObjectId(badInput)` would 500 on any non-hex value.
    if (data.attachments !== undefined) {
      section.attachments = data.attachments.map((att) => {
        // The DTO types `_id` as `string | undefined`, but at runtime
        // Mongoose can hand back ObjectId instances on populated
        // subdocs round-tripped through the API. Widen the LHS to
        // `unknown` so the `instanceof` narrowing typechecks while
        // keeping the runtime guard intact.
        const rawId: unknown = att._id;
        let resolvedId: Types.ObjectId;
        if (rawId instanceof Types.ObjectId) {
          resolvedId = rawId;
        } else if (typeof rawId === 'string') {
          if (rawId.startsWith('temp-') || !Types.ObjectId.isValid(rawId)) {
            resolvedId = new Types.ObjectId();
          } else {
            resolvedId = new Types.ObjectId(rawId);
          }
        } else {
          resolvedId = new Types.ObjectId();
        }
        return {
          _id: resolvedId,
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          fileType: att.fileType,
          fileSize: att.fileSize,
          uploadedAt: new Date(),
        } as SectionAttachment;
      });
    }

    await workspace.save();

    // Emit WebSocket event
    this.chatGateway.emitMaterialsUpdate(jobId, {
      type: 'section_updated',
      section,
    });

    return { section };
  }

  // Delete a section
  async deleteSection(
    jobId: string,
    sectionId: string,
    userId: string,
  ): Promise<void> {
    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can delete sections
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can delete sections');
    }

    const sectionIndex = workspace.sections.findIndex(
      (s) => s._id.toString() === sectionId,
    );

    if (sectionIndex === -1) {
      throw new NotFoundException('Section not found');
    }

    workspace.sections.splice(sectionIndex, 1);
    await workspace.save();

    // Emit WebSocket event
    this.chatGateway.emitMaterialsUpdate(jobId, {
      type: 'section_deleted',
      sectionId,
    });
  }

  // Create an item in a section
  async createItem(
    jobId: string,
    sectionId: string,
    userId: string,
    data: {
      title: string;
      description?: string;
      type: WorkspaceItemType;
      fileUrl?: string;
      linkUrl?: string;
      price?: number;
      currency?: string;
      storeName?: string;
      storeAddress?: string;
    },
  ): Promise<{ item: WorkspaceItem }> {
    // Validate up front - the frontend ItemModal already enforces these
    // (after the earlier required-fields fix) but a direct API call
    // could still POST a blank title or a 100KB description.
    const title = (data.title || '').trim();
    if (!title) {
      throw new BadRequestException('Item title is required');
    }
    if (title.length > 200) {
      throw new BadRequestException('Item title is too long (max 200 characters)');
    }
    if (data.description && data.description.length > 2000) {
      throw new BadRequestException('Item description is too long (max 2000 characters)');
    }

    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can create items
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can add items');
    }

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    // Cap items per section to prevent unbounded doc growth.
    if (section.items.length >= 100) {
      throw new BadRequestException(
        'Maximum number of items reached (100 per section)',
      );
    }

    // Resolve the currency: client-supplied wins, otherwise fall back
    // to the pro's stored currency (set at signup from marketplace),
    // and finally to GEL for legacy pros pre-2026-05.
    let resolvedCurrency = data.currency;
    if (!resolvedCurrency) {
      const pro = await this.userModel
        .findById(workspace.proId)
        .select({ currency: 1 })
        .lean()
        .exec();
      resolvedCurrency = (pro as { currency?: string } | null)?.currency || 'GEL';
    }

    const item: WorkspaceItem = {
      _id: new Types.ObjectId(),
      title,
      description: data.description,
      type: data.type,
      fileUrl: data.fileUrl,
      linkUrl: data.linkUrl,
      price: data.price,
      currency: resolvedCurrency,
      storeName: data.storeName,
      storeAddress: data.storeAddress,
      reactions: [],
      comments: [],
      createdBy: new Types.ObjectId(userId),
      createdAt: new Date(),
    } as WorkspaceItem;

    section.items.push(item);
    await workspace.save();

    // Emit WebSocket event
    this.chatGateway.emitMaterialsUpdate(jobId, {
      type: 'item_added',
      sectionId,
      item,
    });

    return { item };
  }

  // Update an item
  async updateItem(
    jobId: string,
    sectionId: string,
    itemId: string,
    userId: string,
    data: Partial<{
      title: string;
      description: string;
      fileUrl: string;
      linkUrl: string;
      price: number;
      currency: string;
      storeName: string;
      storeAddress: string;
    }>,
  ): Promise<WorkspaceItem> {
    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can update items
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can update items');
    }

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const item = section.items.find((i) => i._id.toString() === itemId);

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Update fields
    if (data.title !== undefined) item.title = data.title;
    if (data.description !== undefined) item.description = data.description;
    if (data.fileUrl !== undefined) item.fileUrl = data.fileUrl;
    if (data.linkUrl !== undefined) item.linkUrl = data.linkUrl;
    if (data.price !== undefined) item.price = data.price;
    if (data.currency !== undefined) item.currency = data.currency;
    if (data.storeName !== undefined) item.storeName = data.storeName;
    if (data.storeAddress !== undefined) item.storeAddress = data.storeAddress;

    await workspace.save();
    return item;
  }

  // Delete an item
  async deleteItem(
    jobId: string,
    sectionId: string,
    itemId: string,
    userId: string,
  ): Promise<void> {
    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can delete items
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can delete items');
    }

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const itemIndex = section.items.findIndex(
      (i) => i._id.toString() === itemId,
    );

    if (itemIndex === -1) {
      throw new NotFoundException('Item not found');
    }

    section.items.splice(itemIndex, 1);
    await workspace.save();

    // Emit WebSocket event
    this.chatGateway.emitMaterialsUpdate(jobId, {
      type: 'item_deleted',
      sectionId,
      item: { _id: itemId },
    });
  }

  // Toggle reaction on an item (client only)
  async toggleReaction(
    jobId: string,
    sectionId: string,
    itemId: string,
    userId: string,
    reactionType: ReactionType,
  ): Promise<{ added: boolean; reactions: ItemReaction[] }> {
    const workspace = await this.getWorkspace(jobId, userId);

    // Only client can add reactions
    if (workspace.clientId.toString() !== userId) {
      throw new ForbiddenException('Only the client can add reactions');
    }

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const item = section.items.find((i) => i._id.toString() === itemId);

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Get user info
    const user = await this.userModel
      .findById(userId)
      .select('name avatar')
      .exec();

    // One reaction per user per item. Previously this only checked for a
    // (user, type) match, so a user could like AND love the same item and
    // the UI (which assumes a single reaction per user) would render
    // inconsistently - the second reaction was invisible until the first
    // was removed, and the unlike-button would only remove one at a time.
    // Now: clicking the same type toggles off; clicking a different type
    // replaces the existing reaction atomically.
    const existing = item.reactions.find(
      (r) => r.userId.toString() === userId,
    );

    let added = false;

    if (existing && existing.type === reactionType) {
      // Same type - toggle off (remove the user's reaction entirely).
      item.reactions = item.reactions.filter(
        (r) => r.userId.toString() !== userId,
      ) as typeof item.reactions;
    } else {
      // Different type or no existing reaction - replace/add.
      const filteredReactions = item.reactions.filter(
        (r) => r.userId.toString() !== userId,
      );
      const reaction: ItemReaction = {
        userId: new Types.ObjectId(userId),
        userName: user?.name || 'Unknown',
        userAvatar: user?.avatar,
        type: reactionType,
        createdAt: new Date(),
      } as ItemReaction;
      filteredReactions.push(reaction);
      item.reactions = filteredReactions as typeof item.reactions;
      added = true;
    }

    await workspace.save();
    return { added, reactions: item.reactions };
  }

  // Add comment on an item
  async addComment(
    jobId: string,
    sectionId: string,
    itemId: string,
    userId: string,
    content: string,
  ): Promise<{ comments: ItemComment[] }> {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Comment content cannot be empty');
    }
    // Hard cap so a paste of a 100KB doc doesn't blow up the document
    // size, the render layout, or the JSON payload size sent back to
    // every viewer on subsequent fetches. 1000 chars is more than
    // enough for a workspace item comment (longer thoughts belong in
    // the project chat).
    if (content.length > 1000) {
      throw new BadRequestException('Comment is too long (max 1000 characters)');
    }

    const workspace = await this.getWorkspace(jobId, userId);

    const isClient = workspace.clientId.toString() === userId;
    const isPro = workspace.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this project');
    }

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const item = section.items.find((i) => i._id.toString() === itemId);

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Get user info
    const user = await this.userModel
      .findById(userId)
      .select('name avatar')
      .exec();

    const comment: ItemComment = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      userName: user?.name || 'Unknown',
      userAvatar: user?.avatar,
      userRole: isClient ? 'client' : 'pro',
      content: content.trim(),
      createdAt: new Date(),
    } as ItemComment;

    item.comments.push(comment);
    await workspace.save();

    return { comments: item.comments };
  }

  // Delete comment
  async deleteComment(
    jobId: string,
    sectionId: string,
    itemId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    const workspace = await this.getWorkspace(jobId, userId);

    const section = workspace.sections.find(
      (s) => s._id.toString() === sectionId,
    );

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    const item = section.items.find((i) => i._id.toString() === itemId);

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    const commentIndex = item.comments.findIndex(
      (c) => c._id.toString() === commentId,
    );

    if (commentIndex === -1) {
      throw new NotFoundException('Comment not found');
    }

    const comment = item.comments[commentIndex];

    // Only comment author can delete
    if (comment.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    item.comments.splice(commentIndex, 1);
    await workspace.save();
  }

  // Reorder sections
  async reorderSections(
    jobId: string,
    userId: string,
    sectionIds: string[],
  ): Promise<WorkspaceSection[]> {
    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can reorder
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can reorder sections');
    }

    // Create a map for quick lookup
    const sectionMap = new Map<string, WorkspaceSection>();
    workspace.sections.forEach((s) => {
      sectionMap.set(s._id.toString(), s);
    });

    // Reorder based on provided IDs. Any sections NOT in the input array
    // are appended after the reordered ones to preserve their data -
    // previously a partial input silently deleted every section not
    // mentioned, which would be a catastrophic data-loss bug if the
    // frontend ever sent a partial list (e.g. a stale view of sections
    // after a concurrent add).
    const reorderedSections: WorkspaceSection[] = [];
    const seenIds = new Set<string>();
    sectionIds.forEach((id, index) => {
      const section = sectionMap.get(id);
      if (section) {
        section.order = index;
        reorderedSections.push(section);
        seenIds.add(id);
      }
    });
    let nextOrder = reorderedSections.length;
    workspace.sections.forEach((s) => {
      if (!seenIds.has(s._id.toString())) {
        s.order = nextOrder++;
        reorderedSections.push(s);
      }
    });

    workspace.sections = reorderedSections as typeof workspace.sections;
    await workspace.save();

    return workspace.sections;
  }
}
