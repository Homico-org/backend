import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { ChatGateway } from "../chat/chat.gateway";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/schemas/notification.schema";
import { PortfolioService } from "../portfolio/portfolio.service";
import { PaymentsService } from "../payments/payments.service";
import { User } from "../users/schemas/user.schema";
import { Job } from "./schemas/job.schema";
import {
  ProjectAttachment,
  ProjectComment,
  ProjectHistoryEvent,
  ProjectHistoryEventType,
  ProjectStage,
  ProjectTracking,
  StageHistory,
} from "./schemas/project-tracking.schema";
import { Proposal } from "./schemas/proposal.schema";

@Injectable()
export class ProjectTrackingService {
  constructor(
    @InjectModel(ProjectTracking.name)
    private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(User.name) private userModel: Model<User>,
    @Inject(forwardRef(() => ChatGateway))
    private chatGateway: ChatGateway,
    private notificationsService: NotificationsService,
    private portfolioService: PortfolioService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // Create project tracking when proposal is accepted
  async createProjectTracking(
    jobId: string,
    clientId: string,
    proId: string,
    proposalId: string,
    proposalData?: {
      proposedPrice?: number;
      estimatedDuration?: number;
      estimatedDurationUnit?: string;
    },
  ): Promise<ProjectTracking> {
    const now = new Date();

    const projectTracking = new this.projectTrackingModel({
      jobId: new Types.ObjectId(jobId),
      clientId: new Types.ObjectId(clientId),
      proId: new Types.ObjectId(proId),
      proposalId: new Types.ObjectId(proposalId),
      currentStage: ProjectStage.HIRED,
      progress: 0,
      hiredAt: now,
      agreedPrice: proposalData?.proposedPrice,
      estimatedDuration: proposalData?.estimatedDuration,
      estimatedDurationUnit: proposalData?.estimatedDurationUnit,
      stageHistory: [
        {
          stage: ProjectStage.HIRED,
          enteredAt: now,
        },
      ],
    });

    return projectTracking.save();
  }

  // Get project tracking by job ID
  async getProjectByJobId(jobId: string): Promise<ProjectTracking | null> {
    return this.projectTrackingModel
      .findOne({ jobId: new Types.ObjectId(jobId) })
      .populate("clientId", "name email avatar")
      .populate("proId", "name email avatar phone")
      .exec();
  }

  // Get project tracking with full details
  async getProjectDetails(jobId: string, userId: string): Promise<any> {
    const project = await this.projectTrackingModel
      .findOne({ jobId: new Types.ObjectId(jobId) })
      .populate("clientId", "name email avatar phone")
      .populate("proId", "name email avatar phone title")
      .exec();

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    // Verify user is part of this project
    const isClient = project.clientId._id.toString() === userId;
    const isPro = project.proId._id.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Get job details
    const job = await this.jobModel
      .findById(jobId)
      .select(
        "title description category location images media budgetType budgetAmount budgetMin budgetMax deadline",
      )
      .exec();

    return {
      project,
      job,
      isClient,
      isPro,
    };
  }

  // Update project stage.
  //
  // The state machine is now strictly validated. Previously this method
  // accepted ANY stage value from ANY participant (client or pro), with no
  // ordering checks. That let pros jump directly from HIRED to COMPLETED,
  // bounce back to REVIEW, fire duplicate notifications via double-click,
  // and let clients change stages they shouldn't touch.
  //
  // Rules now enforced:
  //   - Only the pro can advance forward (HIRED → STARTED → IN_PROGRESS →
  //     REVIEW → COMPLETED).
  //   - Only the client can move the project from COMPLETED back to REVIEW
  //     (the "request changes" flow). They cannot touch other stages.
  //   - Same-stage requests are a no-op (returns current project).
  //   - EN_ROUTE in the enum is legacy/unused on the frontend; we silently
  //     map any incoming EN_ROUTE to STARTED so old clients don't break.
  async updateStage(
    jobId: string,
    userId: string,
    newStage: ProjectStage,
    note?: string,
    portfolioImages?: string[],
  ): Promise<ProjectTracking> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Legacy compat: EN_ROUTE is unused on the frontend. If an older client
    // or admin tool sends it, coalesce to STARTED so we don't strand the
    // project in a state the UI can't render.
    if (newStage === ProjectStage.EN_ROUTE) {
      newStage = ProjectStage.STARTED;
    }

    // Idempotency: re-clicking the same stage is a no-op. Avoids duplicate
    // notifications, duplicate history entries, and WS event spam from a
    // double-tap or a flaky network retry.
    if (project.currentStage === newStage) {
      return project;
    }

    // Linear forward order (EN_ROUTE intentionally excluded - see above).
    const FORWARD_ORDER: ProjectStage[] = [
      ProjectStage.HIRED,
      ProjectStage.STARTED,
      ProjectStage.IN_PROGRESS,
      ProjectStage.REVIEW,
      ProjectStage.COMPLETED,
    ];
    const currentIdx = FORWARD_ORDER.indexOf(project.currentStage);
    const nextIdx = FORWARD_ORDER.indexOf(newStage);

    if (nextIdx === -1) {
      throw new BadRequestException(`Unknown project stage: ${newStage}`);
    }

    // Client-only transition: COMPLETED → REVIEW (request changes flow).
    const isRequestChanges =
      isClient &&
      project.currentStage === ProjectStage.COMPLETED &&
      newStage === ProjectStage.REVIEW;

    if (isRequestChanges) {
      // OK - explicit request-changes path.
    } else if (!isPro) {
      // Anything else is pro-only.
      throw new ForbiddenException(
        "Only the professional can advance the project stage",
      );
    } else if (currentIdx === -1) {
      // Project in an unknown state - allow recovery by jumping to HIRED.
      // Should never happen but defensive.
    } else if (nextIdx !== currentIdx + 1) {
      throw new BadRequestException(
        `Invalid stage transition: ${project.currentStage} → ${newStage}. Stages must advance one step at a time.`,
      );
    }

    const now = new Date();

    // Close current stage
    if (project.stageHistory.length > 0) {
      const lastHistory = project.stageHistory[project.stageHistory.length - 1];
      lastHistory.exitedAt = now;
    }

    // Add new stage to history
    project.stageHistory.push({
      stage: newStage,
      enteredAt: now,
      changedBy: new Types.ObjectId(userId),
      note,
    } as StageHistory);

    project.currentStage = newStage;

    // Update timeline dates based on stage
    if (newStage === ProjectStage.STARTED && !project.startedAt) {
      project.startedAt = now;
    } else if (newStage === ProjectStage.COMPLETED) {
      project.completedAt = now;
      project.progress = 100;
      // Save portfolio images if provided (pro completing the job)
      if (portfolioImages && portfolioImages.length > 0 && isPro) {
        project.portfolioImages = portfolioImages;
      }
    } else if (newStage === ProjectStage.REVIEW && isRequestChanges) {
      // Client kicked the project back. Clear the prior completion marker
      // so the pro has to formally re-complete (and so confirmCompletion's
      // "already confirmed" guard doesn't fire on the second pass).
      project.completedAt = undefined as unknown as Date;
      project.clientConfirmedAt = undefined as unknown as Date;
    }

    // Auto-update progress based on stage. Drops EN_ROUTE (unused) to keep
    // the table aligned with the forward order above.
    const stageProgress: Partial<Record<ProjectStage, number>> = {
      [ProjectStage.HIRED]: 0,
      [ProjectStage.STARTED]: 10,
      [ProjectStage.IN_PROGRESS]: 50,
      [ProjectStage.REVIEW]: 85,
      [ProjectStage.COMPLETED]: 100,
    };

    const targetProgress = stageProgress[newStage];
    if (targetProgress !== undefined && targetProgress > project.progress) {
      project.progress = targetProgress;
    }

    const savedProject = await project.save();

    // Emit WebSocket event for real-time stage update
    try {
      this.chatGateway.emitProjectStageUpdate(
        jobId,
        project.clientId.toString(),
        project.proId.toString(),
        {
          stage: newStage,
          progress: savedProject.progress,
          project: savedProject,
        },
      );
    } catch (error) {
      console.error("[ProjectTracking] Failed to emit stage update:", error);
    }

    // Log to history
    await this.addHistoryEvent(
      jobId,
      ProjectHistoryEventType.STAGE_CHANGED,
      userId,
      {
        fromStage:
          project.stageHistory.length > 1
            ? project.stageHistory[project.stageHistory.length - 2]?.stage
            : undefined,
        toStage: newStage,
      },
    );

    // Send notification when stage changes
    try {
      const job = await this.jobModel.findById(jobId).select("title").exec();
      const user = await this.userModel.findById(userId).select("name").exec();

      // Notify the other party about stage change
      const recipientId = isPro
        ? project.clientId.toString()
        : project.proId.toString();

      const stageMessages: Record<
        ProjectStage,
        { title: string; titleKa: string; message: string; messageKa: string }
      > = {
        [ProjectStage.HIRED]: {
          title: "Project Created",
          titleKa: "პროექტი შეიქმნა",
          message: "You have been hired",
          messageKa: "თქვენ დაგიქირავეს",
        },
        [ProjectStage.EN_ROUTE]: {
          title: "Professional On The Way",
          titleKa: "სპეციალისტი მოემართება",
          message: `${user?.name || "Pro"} is on the way to you for "${job?.title}"`,
          messageKa: `${user?.name || "სპეციალისტი"} მოემართება თქვენკენ: "${job?.title}"`,
        },
        [ProjectStage.STARTED]: {
          title: "Project Started",
          titleKa: "პროექტი დაიწყო",
          message: `${user?.name || "Pro"} has started working on "${job?.title}"`,
          messageKa: `${user?.name || "სპეციალისტმა"} დაიწყო მუშაობა: "${job?.title}"`,
        },
        [ProjectStage.IN_PROGRESS]: {
          title: "Work in Progress",
          titleKa: "მიმდინარეობს",
          message: `Work is in progress on "${job?.title}"`,
          messageKa: `მიმდინარეობს მუშაობა: "${job?.title}"`,
        },
        [ProjectStage.REVIEW]: {
          title: "Ready for Review",
          titleKa: "მზადაა შესამოწმებლად",
          message: `"${job?.title}" is ready for your review`,
          messageKa: `"${job?.title}" მზადაა შესამოწმებლად`,
        },
        [ProjectStage.COMPLETED]: {
          title: "Project Completed",
          titleKa: "პროექტი დასრულდა",
          message: `"${job?.title}" has been completed`,
          messageKa: `"${job?.title}" დასრულდა`,
        },
      };

      const msg = stageMessages[newStage];
      // Client sees project at /jobs/{id}, Pro sees project at /my-jobs/{id}
      const notificationLink = isPro ? `/jobs/${jobId}` : `/my-jobs/${jobId}`;
      // Map stage to its i18n key so each stage gets a distinct
      // localized title/message instead of all sharing PROFILE_UPDATE.
      const stageI18nKey: Record<ProjectStage, string> = {
        [ProjectStage.HIRED]: 'project_stage_hired',
        [ProjectStage.EN_ROUTE]: 'project_stage_en_route',
        [ProjectStage.STARTED]: 'project_stage_started',
        [ProjectStage.IN_PROGRESS]: 'project_stage_in_progress',
        [ProjectStage.REVIEW]: 'project_stage_review',
        [ProjectStage.COMPLETED]: 'project_stage_completed',
      };
      const i18nBase = stageI18nKey[newStage];
      await this.notificationsService.notify(
        recipientId,
        NotificationType.PROFILE_UPDATE, // Using profile_update as a generic notification type
        msg.title,
        msg.message,
        {
          link: notificationLink,
          referenceId: jobId,
          referenceModel: "Job",
          i18n: {
            titleKey: `notifications.types.${i18nBase}.title`,
            messageKey: `notifications.types.${i18nBase}.message`,
            params: { proName: user?.name || '', jobTitle: job?.title || '' },
          },
        },
      );
    } catch (error) {
      console.error(
        "[ProjectTracking] Failed to send stage notification:",
        error,
      );
    }

    return savedProject;
  }

  // Client confirms project completion - triggers payment process
  async confirmCompletion(
    jobId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    // Only the client can confirm completion
    if (project.clientId.toString() !== userId) {
      throw new ForbiddenException(
        "Only the client can confirm project completion",
      );
    }

    // Project must be in completed stage
    if (project.currentStage !== ProjectStage.COMPLETED) {
      throw new BadRequestException(
        "Project must be marked as completed by the professional first",
      );
    }

    // Check if already confirmed
    if (project.clientConfirmedAt) {
      throw new BadRequestException("Project has already been confirmed");
    }

    const now = new Date();

    // Mark as client confirmed
    project.clientConfirmedAt = now;

    // Update the job status to completed
    await this.jobModel.findByIdAndUpdate(jobId, { status: "completed" });

    // Increment the pro's completedJobs counter
    await this.userModel.findByIdAndUpdate(project.proId, {
      $inc: { completedJobs: 1 },
    });

    await project.save();

    // Log to history
    await this.addHistoryEvent(
      jobId,
      ProjectHistoryEventType.PROJECT_COMPLETED,
      userId,
      { description: "Client confirmed completion" },
    );

    // Notify the pro that client confirmed and payment will be processed
    try {
      const job = await this.jobModel.findById(jobId).select("title").exec();
      await this.notificationsService.notify(
        project.proId.toString(),
        NotificationType.JOB_COMPLETED,
        "Payment coming soon",
        `Client confirmed completion of "${job?.title}". Payment will be processed soon.`,
        {
          link: `/my-jobs/${jobId}`,
          referenceId: jobId,
          referenceModel: "Job",
          i18n: {
            titleKey: 'notifications.types.job_completed.title',
            messageKey: 'notifications.types.job_completed.message',
            params: { jobTitle: job?.title || '' },
          },
        },
      );
    } catch (error) {
      console.error(
        "[ProjectTracking] Failed to send confirmation notification:",
        error,
      );
    }

    // Release the escrow held at hire: mark it payout-eligible now that the
    // client confirmed completion. The admin payout flow + the pro's earnings
    // page take it from here. Best-effort so a payments hiccup can't block
    // the completion itself.
    if (project.escrowId) {
      try {
        await this.paymentsService.markEscrowPendingRelease(
          project.escrowId.toString(),
        );
      } catch (error) {
        console.error(
          "[ProjectTracking] Failed to mark escrow pending release:",
          error,
        );
      }
    }

    // Create portfolio item from completed job if there are portfolio images
    if (project.portfolioImages && project.portfolioImages.length > 0) {
      try {
        const job = await this.jobModel
          .findById(jobId)
          .select("title description category location")
          .exec();
        const client = await this.userModel
          .findById(project.clientId)
          .select("name avatar city")
          .exec();

        // Create in PortfolioItem collection (for feed/browse)
        const portfolioItem = await this.portfolioService.createFromJob({
          proId: project.proId.toString(),
          jobId: jobId,
          title: job?.title || "Completed Project",
          description: job?.description,
          images: project.portfolioImages,
          category: job?.category,
          location: job?.location,
          clientId: project.clientId.toString(),
          clientName: client?.name,
          clientAvatar: client?.avatar,
          completedDate: now,
        });

        // Save reference to portfolio item
        project.portfolioItemId = portfolioItem._id as Types.ObjectId;
        await project.save();

        // Also add to pro's embedded portfolioProjects array (for pro profile page)
        await this.userModel.findByIdAndUpdate(project.proId, {
          $push: {
            portfolioProjects: {
              id: portfolioItem._id.toString(),
              title: job?.title || "Completed Project",
              description: job?.description || "",
              images: project.portfolioImages,
              location: job?.location,
              jobId: jobId,
              source: "homico",
            },
          },
        });
      } catch (error) {
        // Don't fail the completion if portfolio creation fails
      }
    }

    return {
      success: true,
      message: "Project confirmed. Payment will be processed shortly.",
    };
  }

  // Update progress percentage
  async updateProgress(
    jobId: string,
    userId: string,
    progress: number,
  ): Promise<ProjectTracking> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    // Only pro can update progress
    if (project.proId.toString() !== userId) {
      throw new ForbiddenException("Only the professional can update progress");
    }

    project.progress = Math.min(100, Math.max(0, progress));
    return project.save();
  }

  // Set expected end date
  async setExpectedEndDate(
    jobId: string,
    userId: string,
    expectedEndDate: Date,
  ): Promise<ProjectTracking> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    // Only pro can set expected end date
    if (project.proId.toString() !== userId) {
      throw new ForbiddenException(
        "Only the professional can set expected end date",
      );
    }

    project.expectedEndDate = expectedEndDate;
    return project.save();
  }

  // Add comment (legacy - kept for backwards compatibility)
  async addComment(
    jobId: string,
    userId: string,
    content: string,
  ): Promise<ProjectTracking> {
    // Match the validation we apply to `addMessage` so the two
    // sibling endpoints behave consistently: empty content rejected,
    // and a hard cap so a pasted document doesn't bloat the document.
    const trimmed = (content || '').trim();
    if (!trimmed) {
      throw new BadRequestException('Comment content cannot be empty');
    }
    if (trimmed.length > 4000) {
      throw new BadRequestException(
        'Comment is too long (max 4000 characters)',
      );
    }

    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Get user info
    const user = await this.userModel
      .findById(userId)
      .select("name avatar")
      .exec();

    const comment: ProjectComment = {
      userId: new Types.ObjectId(userId),
      userName: user?.name || "Unknown",
      userAvatar: user?.avatar,
      userRole: isClient ? "client" : "pro",
      content: trimmed,
      createdAt: new Date(),
    } as ProjectComment;

    project.comments.push(comment);
    return project.save();
  }

  // Get messages (returns comments as messages for now)
  async getMessages(
    jobId: string,
    userId: string,
  ): Promise<{ messages: any[]; unreadCount: number }> {
    const project = await this.projectTrackingModel
      .findOne({ jobId: new Types.ObjectId(jobId) })
      .exec();

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Get last read timestamp for current user
    const lastReadAt = isClient
      ? project.clientLastReadAt
      : project.proLastReadAt;

    // Transform comments to messages format
    const messages = project.comments.map((comment: any, idx: number) => {
      const isFromOther = comment.userRole !== (isClient ? "client" : "pro");
      const isUnread =
        isFromOther &&
        (!lastReadAt || new Date(comment.createdAt) > lastReadAt);

      return {
        _id: comment._id?.toString() || `msg-${idx}`,
        senderId: comment.userId?.toString() || comment.userId,
        senderName: comment.userName,
        senderAvatar: comment.userAvatar,
        senderRole: comment.userRole,
        content: comment.content,
        attachments: comment.attachments || [],
        createdAt: comment.createdAt,
        isRead: !isUnread,
      };
    });

    // Count unread messages
    const unreadCount = messages.filter((m: any) => !m.isRead).length;

    return { messages, unreadCount };
  }

  // Mark messages as read
  async markMessagesAsRead(
    jobId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Update the last read timestamp for the current user
    const now = new Date();
    if (isClient) {
      project.clientLastReadAt = now;
    } else {
      project.proLastReadAt = now;
    }

    await project.save();

    return { success: true };
  }

  // Mark polls as viewed
  async markPollsAsViewed(
    jobId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    const now = new Date();
    if (isClient) {
      project.clientLastViewedPollsAt = now;
    } else {
      project.proLastViewedPollsAt = now;
    }

    await project.save();

    return { success: true };
  }

  // Mark materials as viewed
  async markMaterialsAsViewed(
    jobId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    const now = new Date();
    if (isClient) {
      project.clientLastViewedMaterialsAt = now;
    } else {
      project.proLastViewedMaterialsAt = now;
    }

    await project.save();

    return { success: true };
  }

  // Get unread counts for chat, polls, materials
  async getUnreadCounts(
    jobId: string,
    userId: string,
  ): Promise<{ chat: number; polls: number; materials: number }> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Get last viewed timestamps for current user
    const lastReadAt = isClient
      ? project.clientLastReadAt
      : project.proLastReadAt;
    const lastViewedPollsAt = isClient
      ? project.clientLastViewedPollsAt
      : project.proLastViewedPollsAt;
    const lastViewedMaterialsAt = isClient
      ? project.clientLastViewedMaterialsAt
      : project.proLastViewedMaterialsAt;

    // Count unread messages (from the other party)
    const userRole = isClient ? "client" : "pro";
    const unreadMessages = project.comments.filter((comment: any) => {
      const isFromOther = comment.userRole !== userRole;
      const isUnread =
        isFromOther &&
        (!lastReadAt || new Date(comment.createdAt) > lastReadAt);
      return isUnread;
    }).length;

    // For polls, we need to query the Poll collection
    // Count polls created after lastViewedPollsAt by the other party
    const Poll = this.projectTrackingModel.db.model("Poll");
    let unreadPolls = 0;
    try {
      const pollQuery: any = { jobId: new Types.ObjectId(jobId) };
      if (lastViewedPollsAt) {
        pollQuery.createdAt = { $gt: lastViewedPollsAt };
      }
      // Only count polls created by the other party
      if (isClient) {
        pollQuery.createdBy = { $ne: new Types.ObjectId(userId) };
      } else {
        pollQuery.createdBy = { $ne: new Types.ObjectId(userId) };
      }
      unreadPolls = await Poll.countDocuments(pollQuery);
    } catch (e) {
      // Poll model might not exist or other error, ignore
    }

    // For materials, count items/sections created after lastViewedMaterialsAt
    // This would require accessing workspace data - for now we track based on history
    let unreadMaterials = 0;
    if (project.history) {
      unreadMaterials = project.history.filter((event: any) => {
        const isResourceEvent = [
          "resource_added",
          "resource_item_added",
        ].includes(event.eventType);
        const isFromOther = event.userRole !== userRole;
        const isAfterLastViewed =
          !lastViewedMaterialsAt ||
          new Date(event.createdAt) > lastViewedMaterialsAt;
        return isResourceEvent && isFromOther && isAfterLastViewed;
      }).length;
    }

    return {
      chat: unreadMessages,
      polls: unreadPolls,
      materials: unreadMaterials,
    };
  }

  // Add message with attachments
  async addMessage(
    jobId: string,
    userId: string,
    content: string,
    attachments?: string[],
  ): Promise<{ message: any }> {
    const hasContent = content && content.trim().length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      throw new BadRequestException("Message must have content or attachments");
    }
    // Hard cap message length so a pasted document doesn't blow up the
    // project document size or break the chat layout. 4000 chars is
    // comfortably long for a chat message (anything longer should be
    // an attachment or split across multiple messages).
    if (content && content.length > 4000) {
      throw new BadRequestException(
        "Message is too long (max 4000 characters)",
      );
    }
    // Limit attachments per message so a single send can't bloat the
    // project tracking document with an arbitrary array.
    if (hasAttachments && attachments!.length > 10) {
      throw new BadRequestException(
        "Too many attachments (max 10 per message)",
      );
    }

    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Get user info
    const user = await this.userModel
      .findById(userId)
      .select("name avatar")
      .exec();

    const comment: any = {
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      userName: user?.name || "Unknown",
      userAvatar: user?.avatar,
      userRole: isClient ? "client" : "pro",
      content,
      attachments: attachments || [],
      createdAt: new Date(),
    };

    project.comments.push(comment);
    await project.save();

    const formattedMessage = {
      _id: comment._id.toString(),
      senderId: userId,
      senderName: comment.userName,
      senderAvatar: comment.userAvatar,
      senderRole: comment.userRole,
      content: comment.content,
      attachments: comment.attachments,
      createdAt: comment.createdAt,
    };

    // Emit real-time message via WebSocket
    try {
      this.chatGateway.emitProjectMessage(jobId, formattedMessage);
    } catch (error) {
      console.error("[ProjectTracking] Failed to emit project message:", error);
    }

    // Send notification to the other party
    try {
      const recipientId = isClient
        ? project.proId.toString()
        : project.clientId.toString();
      const job = await this.jobModel.findById(jobId).select("title").exec();
      const senderName = user?.name || (isClient ? "კლიენტი" : "სპეციალისტი");
      const messagePreview =
        content && content.length > 50
          ? content.substring(0, 50) + "..."
          : content || "ფაილი გაიგზავნა";
      // Both clients and pros use /jobs/{id} route - add #chat to scroll to chat section
      const link = `/jobs/${jobId}#chat`;

      await this.notificationsService.notify(
        recipientId,
        NotificationType.PROJECT_MESSAGE,
        "New message",
        `${senderName}: ${messagePreview}`,
        {
          link,
          referenceId: jobId,
          referenceModel: "Job",
          i18n: {
            titleKey: 'notifications.types.project_message.title',
            messageKey: 'notifications.types.project_message.message',
            params: { senderName, snippet: messagePreview },
          },
          metadata: { jobTitle: job?.title },
        },
      );
    } catch (error) {
      console.error(
        "[ProjectTracking] Failed to send message notification:",
        error,
      );
    }

    return { message: formattedMessage };
  }

  // Add attachment
  async addAttachment(
    jobId: string,
    userId: string,
    attachmentData: {
      fileName: string;
      fileUrl: string;
      fileType: string;
      fileSize?: number;
      description?: string;
    },
  ): Promise<ProjectTracking> {
    // Validate required fields and reject pathological payloads before
    // touching the DB. Without these checks a direct API call could
    // submit empty strings or a 100KB filename that bloats the project
    // document and breaks the rendered attachment list.
    const fileName = (attachmentData.fileName || '').trim();
    const fileUrl = (attachmentData.fileUrl || '').trim();
    if (!fileName) {
      throw new BadRequestException('Attachment fileName is required');
    }
    if (!fileUrl) {
      throw new BadRequestException('Attachment fileUrl is required');
    }
    if (fileName.length > 255) {
      throw new BadRequestException('Attachment fileName is too long (max 255 characters)');
    }
    if (attachmentData.description && attachmentData.description.length > 1000) {
      throw new BadRequestException('Attachment description is too long (max 1000 characters)');
    }

    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    // Cap attachments per project so a malicious client can't keep
    // appending until the document hits Mongo's 16MB limit.
    if (project.attachments.length >= 100) {
      throw new BadRequestException(
        'Maximum number of attachments reached (100 per project)',
      );
    }

    // Get user info
    const user = await this.userModel.findById(userId).select("name").exec();

    const attachment: ProjectAttachment = {
      uploadedBy: new Types.ObjectId(userId),
      uploaderName: user?.name || "Unknown",
      fileName,
      fileUrl,
      fileType: attachmentData.fileType,
      fileSize: attachmentData.fileSize,
      description: attachmentData.description,
      uploadedAt: new Date(),
    } as ProjectAttachment;

    project.attachments.push(attachment);
    return project.save();
  }

  // Delete attachment
  async deleteAttachment(
    jobId: string,
    userId: string,
    attachmentIndex: number,
  ): Promise<ProjectTracking> {
    // Validate the index up front. Previously a non-numeric path
    // segment (`/attachments/abc`) parsed to NaN, both `NaN < 0` and
    // `NaN >= length` returned false, so the index check let NaN
    // through. The subsequent `project.attachments[NaN]` was undefined
    // and crashed at `.toString()` with a 500 instead of returning a
    // clean 400/404.
    if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
      throw new BadRequestException('Invalid attachment index');
    }

    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    if (attachmentIndex >= project.attachments.length) {
      throw new NotFoundException("Attachment not found");
    }

    const attachment = project.attachments[attachmentIndex];

    // Only uploader can delete
    if (attachment.uploadedBy.toString() !== userId) {
      throw new ForbiddenException("You can only delete your own attachments");
    }

    project.attachments.splice(attachmentIndex, 1);
    return project.save();
  }

  // Get all projects for a user (client or pro)
  async getUserProjects(
    userId: string,
    role: "client" | "pro",
  ): Promise<any[]> {
    const query =
      role === "client"
        ? { clientId: new Types.ObjectId(userId) }
        : { proId: new Types.ObjectId(userId) };

    const projects = await this.projectTrackingModel
      .find(query)
      .populate("jobId", "title category images media status")
      .populate("clientId", "name avatar")
      .populate("proId", "name avatar title")
      .sort({ updatedAt: -1 })
      .exec();

    return projects;
  }

  // ============ HISTORY METHODS ============

  // Add history event
  async addHistoryEvent(
    jobId: string,
    eventType: ProjectHistoryEventType,
    userId: string,
    metadata?: ProjectHistoryEvent["metadata"],
  ): Promise<void> {
    try {
      const project = await this.projectTrackingModel.findOne({
        jobId: new Types.ObjectId(jobId),
      });

      if (!project) return;

      const user = await this.userModel
        .findById(userId)
        .select("name avatar")
        .exec();
      const isClient = project.clientId.toString() === userId;
      const isPro = project.proId.toString() === userId;

      const historyEvent: any = {
        eventType,
        userId: new Types.ObjectId(userId),
        userName: user?.name || "Unknown",
        userAvatar: user?.avatar,
        userRole: isClient ? "client" : isPro ? "pro" : "system",
        metadata,
        createdAt: new Date(),
      };

      project.history = project.history || [];
      project.history.push(historyEvent);
      await project.save();
    } catch (error) {
      console.error("[ProjectTracking] Failed to add history event:", error);
    }
  }

  // Get project history
  async getProjectHistory(
    jobId: string,
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      eventTypes?: ProjectHistoryEventType[];
      userFilter?: string; // Filter by specific user
    },
  ): Promise<{ history: ProjectHistoryEvent[]; total: number }> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException("Project tracking not found");
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException("You are not part of this project");
    }

    let history = project.history || [];

    // Filter by event types if specified
    if (options?.eventTypes && options.eventTypes.length > 0) {
      history = history.filter((h) => options.eventTypes.includes(h.eventType));
    }

    // Filter by user if specified
    if (options?.userFilter) {
      history = history.filter(
        (h) => h.userId.toString() === options.userFilter,
      );
    }

    // Sort by date descending (newest first)
    history.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = history.length;

    // Apply pagination
    if (options?.offset) {
      history = history.slice(options.offset);
    }
    if (options?.limit) {
      history = history.slice(0, options.limit);
    }

    return { history, total };
  }

  // Helper method to log stage change in history
  async logStageChange(
    jobId: string,
    userId: string,
    fromStage: ProjectStage,
    toStage: ProjectStage,
  ): Promise<void> {
    await this.addHistoryEvent(
      jobId,
      ProjectHistoryEventType.STAGE_CHANGED,
      userId,
      { fromStage, toStage },
    );
  }

  // Helper method to log poll events
  async logPollEvent(
    jobId: string,
    userId: string,
    eventType:
      | ProjectHistoryEventType.POLL_CREATED
      | ProjectHistoryEventType.POLL_VOTED
      | ProjectHistoryEventType.POLL_CLOSED
      | ProjectHistoryEventType.POLL_OPTION_SELECTED,
    pollId: string,
    pollTitle: string,
    optionText?: string,
  ): Promise<void> {
    await this.addHistoryEvent(jobId, eventType, userId, {
      pollId,
      pollTitle,
      optionText,
    });
  }

  // Helper method to log resource events
  async logResourceEvent(
    jobId: string,
    userId: string,
    eventType: ProjectHistoryEventType,
    resourceId: string,
    resourceName: string,
    itemId?: string,
    itemName?: string,
    reactionType?: string,
  ): Promise<void> {
    await this.addHistoryEvent(jobId, eventType, userId, {
      resourceId,
      resourceName,
      itemId,
      itemName,
      reactionType,
    });
  }
}
