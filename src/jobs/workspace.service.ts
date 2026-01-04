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
    const workspace = await this.getWorkspace(jobId, userId);

    // Only pro can create sections
    if (workspace.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can create sections');
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
      title: data.title,
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
      await this.notificationsService.notify(
        workspace.clientId.toString(),
        NotificationType.PROJECT_MATERIAL_ADDED,
        'ახალი მასალა',
        `${pro?.name || 'სპეციალისტმა'} დაამატა მასალები: "${data.title}"`,
        {
          link: `/jobs/${jobId}`,
          referenceId: jobId,
          referenceModel: 'Job',
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

    // Update attachments if provided
    if (data.attachments !== undefined) {
      section.attachments = data.attachments.map(att => ({
        _id: att._id?.startsWith('temp-') ? new Types.ObjectId() : new Types.ObjectId(att._id),
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        fileType: att.fileType,
        fileSize: att.fileSize,
        uploadedAt: new Date(),
      } as SectionAttachment));
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

    const item: WorkspaceItem = {
      _id: new Types.ObjectId(),
      title: data.title,
      description: data.description,
      type: data.type,
      fileUrl: data.fileUrl,
      linkUrl: data.linkUrl,
      price: data.price,
      currency: data.currency || 'GEL',
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

    // Check if user already has this reaction
    const existingReactionIndex = item.reactions.findIndex(
      (r) => r.userId.toString() === userId && r.type === reactionType,
    );

    let added = false;

    if (existingReactionIndex >= 0) {
      // Remove reaction
      item.reactions.splice(existingReactionIndex, 1);
    } else {
      // Add reaction
      const reaction: ItemReaction = {
        userId: new Types.ObjectId(userId),
        userName: user?.name || 'Unknown',
        userAvatar: user?.avatar,
        type: reactionType,
        createdAt: new Date(),
      } as ItemReaction;
      item.reactions.push(reaction);
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

    // Reorder based on provided IDs
    const reorderedSections: WorkspaceSection[] = [];
    sectionIds.forEach((id, index) => {
      const section = sectionMap.get(id);
      if (section) {
        section.order = index;
        reorderedSections.push(section);
      }
    });

    workspace.sections = reorderedSections;
    await workspace.save();

    return workspace.sections;
  }
}
