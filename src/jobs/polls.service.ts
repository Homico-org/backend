import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Poll, PollStatus } from './schemas/poll.schema';
import { ProjectTracking } from './schemas/project-tracking.schema';

interface CreatePollDto {
  title: string;
  description?: string;
  options: { text?: string; imageUrl?: string }[];
}

@Injectable()
export class PollsService {
  constructor(
    @InjectModel(Poll.name) private pollModel: Model<Poll>,
    @InjectModel(ProjectTracking.name) private projectTrackingModel: Model<ProjectTracking>,
  ) {}

  /**
   * Get all polls for a job
   */
  async getPollsByJobId(jobId: string, userId: string) {
    // Verify user has access to this job
    const project = await this.projectTrackingModel.findOne({ jobId: new Types.ObjectId(jobId) });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const isClient = project.clientId.toString() === userId;
    const isPro = project.proId.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You do not have access to this project');
    }

    const polls = await this.pollModel
      .find({ jobId: new Types.ObjectId(jobId) })
      .populate('createdBy', 'name avatar')
      .sort({ createdAt: -1 })
      .lean();

    return polls;
  }

  /**
   * Create a new poll (Pro only)
   */
  async createPoll(jobId: string, userId: string, createPollDto: CreatePollDto) {
    // Verify user is the pro for this job
    const project = await this.projectTrackingModel.findOne({ jobId: new Types.ObjectId(jobId) });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.proId.toString() !== userId) {
      throw new ForbiddenException('Only the assigned professional can create polls');
    }

    // Validate options
    if (!createPollDto.options || createPollDto.options.length < 2) {
      throw new BadRequestException('At least 2 options are required');
    }

    if (createPollDto.options.length > 6) {
      throw new BadRequestException('Maximum 6 options allowed');
    }

    // Create options with IDs
    const options = createPollDto.options.map(opt => ({
      _id: new Types.ObjectId(),
      text: opt.text,
      imageUrl: opt.imageUrl,
    }));

    const poll = new this.pollModel({
      jobId: new Types.ObjectId(jobId),
      createdBy: new Types.ObjectId(userId),
      title: createPollDto.title,
      description: createPollDto.description,
      options,
      status: PollStatus.ACTIVE,
    });

    await poll.save();

    // Populate and return
    return this.pollModel
      .findById(poll._id)
      .populate('createdBy', 'name avatar')
      .lean();
  }

  /**
   * Vote on a poll option (Client only)
   */
  async vote(pollId: string, userId: string, optionId: string) {
    const poll = await this.pollModel.findById(pollId);
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (poll.status !== PollStatus.ACTIVE) {
      throw new BadRequestException('Poll is not active');
    }

    // Verify user is the client for this job
    const project = await this.projectTrackingModel.findOne({ jobId: poll.jobId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.clientId.toString() !== userId) {
      throw new ForbiddenException('Only the client can vote on polls');
    }

    // Verify option exists
    const optionExists = poll.options.some(opt => opt._id.toString() === optionId);
    if (!optionExists) {
      throw new BadRequestException('Invalid option');
    }

    // Update vote
    poll.clientVote = new Types.ObjectId(optionId);
    await poll.save();

    return this.pollModel
      .findById(poll._id)
      .populate('createdBy', 'name avatar')
      .lean();
  }

  /**
   * Approve a poll option (Client only) - finalizes the choice
   */
  async approve(pollId: string, userId: string, optionId: string) {
    const poll = await this.pollModel.findById(pollId);
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (poll.status !== PollStatus.ACTIVE) {
      throw new BadRequestException('Poll is not active');
    }

    // Verify user is the client for this job
    const project = await this.projectTrackingModel.findOne({ jobId: poll.jobId });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.clientId.toString() !== userId) {
      throw new ForbiddenException('Only the client can approve polls');
    }

    // Verify option exists
    const optionExists = poll.options.some(opt => opt._id.toString() === optionId);
    if (!optionExists) {
      throw new BadRequestException('Invalid option');
    }

    // Approve the poll
    poll.selectedOption = new Types.ObjectId(optionId);
    poll.clientVote = new Types.ObjectId(optionId);
    poll.status = PollStatus.APPROVED;
    await poll.save();

    return this.pollModel
      .findById(poll._id)
      .populate('createdBy', 'name avatar')
      .lean();
  }

  /**
   * Close a poll (Pro only)
   */
  async close(pollId: string, userId: string) {
    const poll = await this.pollModel.findById(pollId);
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    if (poll.status !== PollStatus.ACTIVE) {
      throw new BadRequestException('Poll is not active');
    }

    // Verify user is the pro who created the poll
    if (poll.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the poll creator can close it');
    }

    poll.status = PollStatus.CLOSED;
    poll.closedAt = new Date();
    await poll.save();

    return this.pollModel
      .findById(poll._id)
      .populate('createdBy', 'name avatar')
      .lean();
  }

  /**
   * Delete a poll (Pro only)
   */
  async delete(pollId: string, userId: string): Promise<void> {
    const poll = await this.pollModel.findById(pollId);
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    // Verify user is the pro who created the poll
    if (poll.createdBy.toString() !== userId) {
      throw new ForbiddenException('Only the poll creator can delete it');
    }

    await this.pollModel.deleteOne({ _id: pollId });
  }
}
