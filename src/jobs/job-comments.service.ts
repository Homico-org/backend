import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobComment } from './schemas/job-comment.schema';
import { Job } from './schemas/job.schema';
import { User } from '../users/schemas/user.schema';
import { CreateJobCommentDto, UpdateJobCommentDto } from './dto/job-comment.dto';

@Injectable()
export class JobCommentsService {
  constructor(
    @InjectModel(JobComment.name) private jobCommentModel: Model<JobComment>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /**
   * Create a new comment on a job
   */
  async createComment(
    jobId: string,
    userId: string,
    userRole: string,
    dto: CreateJobCommentDto,
  ): Promise<JobComment> {
    // Verify job exists and is open
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Determine if this is a client reply
    const isClientReply = job.clientId.toString() === userId;

    // Check verification for non-clients (professionals)
    if (!isClientReply) {
      const user = await this.userModel.findById(userId).select('verificationStatus').exec();
      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (user.verificationStatus !== 'verified') {
        throw new ForbiddenException('კომენტარის დასატოვებლად საჭიროა პროფილის ვერიფიკაცია. გთხოვთ გაიაროთ ვერიფიკაცია პარამეტრებში.');
      }
    }

    // If it's a reply, verify parent exists and check depth
    let depth = 0;
    if (dto.parentId) {
      const parentComment = await this.jobCommentModel.findById(dto.parentId);
      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }
      if (parentComment.jobId.toString() !== jobId) {
        throw new BadRequestException('Parent comment belongs to a different job');
      }
      // Limit nesting to 2 levels
      if (parentComment.depth >= 1) {
        throw new BadRequestException('Cannot reply to a reply. Maximum nesting depth reached.');
      }
      depth = parentComment.depth + 1;
    }

    // Professionals (non-clients) cannot reply at the top level more than once
    // (They can only have one top-level comment per job)
    if (!isClientReply && !dto.parentId) {
      const existingComment = await this.jobCommentModel.findOne({
        jobId: new Types.ObjectId(jobId),
        authorId: new Types.ObjectId(userId),
        parentId: { $exists: false },
        isDeleted: false,
      });
      if (existingComment) {
        throw new BadRequestException('You have already commented on this job. You can edit your existing comment or reply to others.');
      }
    }

    const comment = new this.jobCommentModel({
      jobId: new Types.ObjectId(jobId),
      authorId: new Types.ObjectId(userId),
      content: dto.content,
      phoneNumber: dto.phoneNumber,
      portfolioItems: dto.portfolioItems?.map(id => new Types.ObjectId(id)) || [],
      showProfile: dto.showProfile ?? true,
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      depth,
      isClientReply,
    });

    await comment.save();

    // Return populated comment
    return this.getCommentById(comment._id.toString());
  }

  /**
   * Get all comments for a job (with nested replies)
   */
  async getJobComments(jobId: string, requestingUserId?: string): Promise<{
    comments: JobComment[];
    totalCount: number;
    interestingCount: number;
  }> {
    // Verify job exists
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const isJobOwner = requestingUserId && job.clientId.toString() === requestingUserId;

    // Get top-level comments
    const topLevelComments = await this.jobCommentModel
      .find({
        jobId: new Types.ObjectId(jobId),
        parentId: { $exists: false },
        isDeleted: false,
      })
      .sort({ isMarkedInteresting: -1, createdAt: -1 })
      .populate({
        path: 'authorId',
        select: 'name avatar role rating completedJobs responseTime skills',
      })
      .populate({
        path: 'portfolioItems',
        select: 'title images',
      })
      .lean();

    // Get all replies
    const allReplies = await this.jobCommentModel
      .find({
        jobId: new Types.ObjectId(jobId),
        parentId: { $exists: true },
        isDeleted: false,
      })
      .sort({ createdAt: 1 })
      .populate({
        path: 'authorId',
        select: 'name avatar role rating completedJobs responseTime skills',
      })
      .lean();

    // Build nested structure
    const commentsWithReplies = topLevelComments.map(comment => {
      const replies = allReplies.filter(
        reply => reply.parentId?.toString() === comment._id.toString()
      );
      return {
        ...comment,
        author: comment.authorId,
        authorId: (comment.authorId as any)?._id || comment.authorId,
        portfolioDetails: comment.portfolioItems,
        portfolioItems: (comment.portfolioItems as any[])?.map(p => p._id) || [],
        replies: replies.map(reply => ({
          ...reply,
          author: reply.authorId,
          authorId: (reply.authorId as any)?._id || reply.authorId,
        })),
      };
    });

    // Count stats
    const totalCount = await this.jobCommentModel.countDocuments({
      jobId: new Types.ObjectId(jobId),
      parentId: { $exists: false },
      isDeleted: false,
    });

    const interestingCount = await this.jobCommentModel.countDocuments({
      jobId: new Types.ObjectId(jobId),
      parentId: { $exists: false },
      isDeleted: false,
      isMarkedInteresting: true,
    });

    return {
      comments: commentsWithReplies as any,
      totalCount,
      interestingCount,
    };
  }

  /**
   * Get a single comment by ID
   */
  async getCommentById(commentId: string): Promise<JobComment> {
    const comment = await this.jobCommentModel
      .findById(commentId)
      .populate({
        path: 'authorId',
        select: 'name avatar role rating completedJobs responseTime skills',
      })
      .populate({
        path: 'portfolioItems',
        select: 'title images',
      })
      .lean();

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    return {
      ...comment,
      author: comment.authorId,
      authorId: (comment.authorId as any)?._id || comment.authorId,
      portfolioDetails: comment.portfolioItems,
      portfolioItems: (comment.portfolioItems as any[])?.map(p => p._id) || [],
    } as any;
  }

  /**
   * Update a comment (only by author)
   */
  async updateComment(
    commentId: string,
    userId: string,
    dto: UpdateJobCommentDto,
  ): Promise<JobComment> {
    const comment = await this.jobCommentModel.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    // Update fields
    if (dto.content !== undefined) comment.content = dto.content;
    if (dto.phoneNumber !== undefined) comment.phoneNumber = dto.phoneNumber;
    if (dto.portfolioItems !== undefined) {
      comment.portfolioItems = dto.portfolioItems.map(id => new Types.ObjectId(id));
    }
    if (dto.showProfile !== undefined) comment.showProfile = dto.showProfile;

    await comment.save();

    return this.getCommentById(commentId);
  }

  /**
   * Delete a comment (soft delete, only by author or job owner)
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.jobCommentModel.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    const job = await this.jobModel.findById(comment.jobId);
    const isJobOwner = job && job.clientId.toString() === userId;
    const isAuthor = comment.authorId.toString() === userId;

    if (!isJobOwner && !isAuthor) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    comment.isDeleted = true;
    await comment.save();

    // Also soft-delete all replies
    await this.jobCommentModel.updateMany(
      { parentId: comment._id },
      { isDeleted: true }
    );
  }

  /**
   * Mark/unmark a professional as interesting (only by job owner)
   */
  async markAsInteresting(
    commentId: string,
    userId: string,
    isInteresting: boolean,
  ): Promise<JobComment> {
    const comment = await this.jobCommentModel.findById(commentId);
    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    // Only top-level comments can be marked
    if (comment.parentId) {
      throw new BadRequestException('Only top-level comments can be marked as interesting');
    }

    const job = await this.jobModel.findById(comment.jobId);
    if (!job || job.clientId.toString() !== userId) {
      throw new ForbiddenException('Only the job owner can mark professionals as interesting');
    }

    comment.isMarkedInteresting = isInteresting;
    await comment.save();

    return this.getCommentById(commentId);
  }

  /**
   * Get comments by a specific user across all jobs
   */
  async getUserComments(userId: string, limit = 20): Promise<JobComment[]> {
    return this.jobCommentModel
      .find({
        authorId: new Types.ObjectId(userId),
        parentId: { $exists: false },
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: 'jobId',
        select: 'title category status',
      })
      .lean() as any;
  }

  /**
   * Check if a user has already commented on a job
   */
  async hasUserCommented(jobId: string, userId: string): Promise<boolean> {
    const count = await this.jobCommentModel.countDocuments({
      jobId: new Types.ObjectId(jobId),
      authorId: new Types.ObjectId(userId),
      parentId: { $exists: false },
      isDeleted: false,
    });
    return count > 0;
  }
}
