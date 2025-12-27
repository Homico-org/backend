import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ProjectTracking,
  ProjectStage,
  ProjectComment,
  ProjectAttachment,
  StageHistory,
} from './schemas/project-tracking.schema';
import { Proposal } from './schemas/proposal.schema';
import { Job } from './schemas/job.schema';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ProjectTrackingService {
  constructor(
    @InjectModel(ProjectTracking.name) private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(User.name) private userModel: Model<User>,
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
      .populate('clientId', 'name email avatar')
      .populate('proId', 'name email avatar phone')
      .exec();
  }

  // Get project tracking with full details
  async getProjectDetails(jobId: string, userId: string): Promise<any> {
    const project = await this.projectTrackingModel
      .findOne({ jobId: new Types.ObjectId(jobId) })
      .populate('clientId', 'name email avatar phone')
      .populate('proId', 'name email avatar phone title')
      .exec();

    if (!project) {
      throw new NotFoundException('Project tracking not found');
    }

    // Verify user is part of this project
    const isClient = project.clientId._id.toString() === userId;
    const isPro = project.proId._id.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this project');
    }

    // Get job details
    const job = await this.jobModel
      .findById(jobId)
      .select('title description category location images media budgetType budgetAmount budgetMin budgetMax deadline')
      .exec();

    return {
      project,
      job,
      isClient,
      isPro,
    };
  }

  // Update project stage
  async updateStage(
    jobId: string,
    userId: string,
    newStage: ProjectStage,
    note?: string,
  ): Promise<ProjectTracking> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException('Project tracking not found');
    }

    // Both client and pro can update stage
    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this project');
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
    }

    // Auto-update progress based on stage
    const stageProgress: Record<ProjectStage, number> = {
      [ProjectStage.HIRED]: 0,
      [ProjectStage.STARTED]: 10,
      [ProjectStage.IN_PROGRESS]: 50,
      [ProjectStage.REVIEW]: 85,
      [ProjectStage.COMPLETED]: 100,
    };

    if (stageProgress[newStage] > project.progress) {
      project.progress = stageProgress[newStage];
    }

    return project.save();
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
      throw new NotFoundException('Project tracking not found');
    }

    // Only pro can update progress
    if (project.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can update progress');
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
      throw new NotFoundException('Project tracking not found');
    }

    // Only pro can set expected end date
    if (project.proId.toString() !== userId) {
      throw new ForbiddenException('Only the professional can set expected end date');
    }

    project.expectedEndDate = expectedEndDate;
    return project.save();
  }

  // Add comment
  async addComment(
    jobId: string,
    userId: string,
    content: string,
  ): Promise<ProjectTracking> {
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException('Project tracking not found');
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this project');
    }

    // Get user info
    const user = await this.userModel.findById(userId).select('name avatar').exec();

    const comment: ProjectComment = {
      userId: new Types.ObjectId(userId),
      userName: user?.name || 'Unknown',
      userAvatar: user?.avatar,
      userRole: isClient ? 'client' : 'pro',
      content,
      createdAt: new Date(),
    } as ProjectComment;

    project.comments.push(comment);
    return project.save();
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
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException('Project tracking not found');
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this project');
    }

    // Get user info
    const user = await this.userModel.findById(userId).select('name').exec();

    const attachment: ProjectAttachment = {
      uploadedBy: new Types.ObjectId(userId),
      uploaderName: user?.name || 'Unknown',
      fileName: attachmentData.fileName,
      fileUrl: attachmentData.fileUrl,
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
    const project = await this.projectTrackingModel.findOne({
      jobId: new Types.ObjectId(jobId),
    });

    if (!project) {
      throw new NotFoundException('Project tracking not found');
    }

    if (attachmentIndex < 0 || attachmentIndex >= project.attachments.length) {
      throw new NotFoundException('Attachment not found');
    }

    const attachment = project.attachments[attachmentIndex];

    // Only uploader can delete
    if (attachment.uploadedBy.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own attachments');
    }

    project.attachments.splice(attachmentIndex, 1);
    return project.save();
  }

  // Get all projects for a user (client or pro)
  async getUserProjects(userId: string, role: 'client' | 'pro'): Promise<any[]> {
    const query = role === 'client'
      ? { clientId: new Types.ObjectId(userId) }
      : { proId: new Types.ObjectId(userId) };

    const projects = await this.projectTrackingModel
      .find(query)
      .populate('jobId', 'title category images media status')
      .populate('clientId', 'name avatar')
      .populate('proId', 'name avatar title')
      .sort({ updatedAt: -1 })
      .exec();

    return projects;
  }
}
