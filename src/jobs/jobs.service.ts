import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobStatus, JobPropertyType } from './schemas/job.schema';
import { Proposal, ProposalStatus } from './schemas/proposal.schema';
import { SavedJob } from './schemas/saved-job.schema';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SavedJob.name) private savedJobModel: Model<SavedJob>,
  ) {}

  // Jobs CRUD
  async createJob(clientId: string, createJobDto: CreateJobDto): Promise<Job> {
    const { Types } = require('mongoose');
    const job = new this.jobModel({
      clientId: new Types.ObjectId(clientId),
      ...createJobDto,
    });
    return job.save();
  }

  async findAllJobs(filters?: {
    category?: string;
    categories?: string[];
    subcategories?: string[];
    location?: string;
    budgetMin?: number;
    budgetMax?: number;
    search?: string;
    status?: JobStatus;
    page?: number;
    limit?: number;
    sort?: string;
    propertyType?: JobPropertyType;
    proposalCountMin?: number;
    proposalCountMax?: number;
    createdAfter?: Date;
    createdBefore?: Date;
    clientType?: string;
    deadline?: string;
    savedOnly?: boolean;
    userId?: string;
  }): Promise<{
    data: Job[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = { status: filters?.status || JobStatus.OPEN };

    // Exclude current user's own jobs (pros shouldn't see their own jobs)
    if (filters?.userId) {
      query.clientId = { $ne: new Types.ObjectId(filters.userId) };
    }

    // Support filtering by multiple categories (for pro users with selected categories)
    if (filters?.categories && filters.categories.length > 0) {
      query.category = { $in: filters.categories };
    } else if (filters?.category) {
      query.category = filters.category;
    }

    // Filter by subcategories/skills - jobs must have at least one matching skill
    if (filters?.subcategories && filters.subcategories.length > 0) {
      query.skills = { $in: filters.subcategories };
    }

    if (filters?.location) {
      query.location = new RegExp(filters.location, 'i');
    }

    if (filters?.budgetMin !== undefined || filters?.budgetMax !== undefined) {
      query.$or = [
        { budgetAmount: {} },
        { budgetMax: {} },
      ];

      if (filters?.budgetMin !== undefined) {
        query.$or[0].budgetAmount.$gte = filters.budgetMin;
        query.$or[1].budgetMax.$gte = filters.budgetMin;
      }

      if (filters?.budgetMax !== undefined) {
        query.$or[0].budgetAmount.$lte = filters.budgetMax;
        query.$or[1].budgetMax.$lte = filters.budgetMax;
      }
    }

    if (filters?.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      query.$or = [
        { title: searchRegex },
        { description: searchRegex },
      ];
    }

    // Property type filter
    if (filters?.propertyType) {
      query.propertyType = filters.propertyType;
    }

    // Proposal count range filter
    if (filters?.proposalCountMin !== undefined) {
      query.proposalCount = { ...query.proposalCount, $gte: filters.proposalCountMin };
    }
    if (filters?.proposalCountMax !== undefined) {
      query.proposalCount = { ...query.proposalCount, $lte: filters.proposalCountMax };
    }

    // Date range filter
    if (filters?.createdAfter || filters?.createdBefore) {
      query.createdAt = {};
      if (filters?.createdAfter) {
        query.createdAt.$gte = filters.createdAfter;
      }
      if (filters?.createdBefore) {
        query.createdAt.$lte = filters.createdBefore;
      }
    }

    // Deadline filter (urgent, week, month, flexible)
    if (filters?.deadline && filters.deadline !== 'all') {
      const now = new Date();
      if (filters.deadline === 'urgent') {
        // Jobs with deadline within 7 days
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        query.deadline = { $gte: now, $lte: sevenDaysLater };
      } else if (filters.deadline === 'week') {
        // Jobs with deadline within this week (next 7 days)
        const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        query.deadline = { $gte: now, $lte: weekLater };
      } else if (filters.deadline === 'month') {
        // Jobs with deadline within this month (next 30 days)
        const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        query.deadline = { $gte: now, $lte: monthLater };
      } else if (filters.deadline === 'flexible') {
        // Jobs with no deadline set or deadline is null
        query.$or = query.$or || [];
        query.$or.push({ deadline: null }, { deadline: { $exists: false } });
      }
    }

    // Saved jobs filter - filter to only show user's saved jobs
    if (filters?.savedOnly && filters?.userId) {
      const savedJobIds = await this.getSavedJobIds(filters.userId);
      if (savedJobIds.length === 0) {
        // No saved jobs, return empty result
        return {
          data: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
            hasMore: false,
          },
        };
      }
      query._id = { $in: savedJobIds.map((id) => new Types.ObjectId(id)) };
    }

    // Determine sort order
    let sortOption: any = { createdAt: -1 }; // default: newest
    if (filters?.sort === 'oldest') {
      sortOption = { createdAt: 1 };
    } else if (filters?.sort === 'budget-high') {
      sortOption = { budgetAmount: -1, budgetMax: -1 };
    } else if (filters?.sort === 'budget-low') {
      sortOption = { budgetAmount: 1, budgetMin: 1 };
    } else if (filters?.sort === 'proposals-high') {
      sortOption = { proposalCount: -1 };
    } else if (filters?.sort === 'proposals-low') {
      sortOption = { proposalCount: 1 };
    }

    // Build the aggregation pipeline for clientType filter
    let data: Job[];
    let total: number;

    if (filters?.clientType) {
      // Use aggregation to filter by client's accountType
      const pipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: 'users',
            localField: 'clientId',
            foreignField: '_id',
            as: 'client',
          },
        },
        { $unwind: '$client' },
        { $match: { 'client.accountType': filters.clientType } },
        { $sort: sortOption },
      ];

      const countPipeline = [...pipeline, { $count: 'total' }];
      const dataPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

      const [countResult, dataResult] = await Promise.all([
        this.jobModel.aggregate(countPipeline).exec(),
        this.jobModel.aggregate(dataPipeline).exec(),
      ]);

      total = countResult[0]?.total || 0;
      // Transform to match expected structure
      data = dataResult.map((job: any) => ({
        ...job,
        clientId: job.client,
      }));
    } else {
      [data, total] = await Promise.all([
        this.jobModel
          .find(query)
          .populate('clientId', 'name email avatar city accountType companyName')
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .exec(),
        this.jobModel.countDocuments(query),
      ]);
    }

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async findJobById(id: string): Promise<Job> {
    const job = await this.jobModel
      .findById(id)
      .populate('clientId', '_id name email avatar city phone accountType companyName')
      .exec();

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Increment view count
    await this.jobModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

    return job;
  }

  async findMyJobs(clientId: string, status?: string): Promise<any[]> {
    const { Types } = require('mongoose');

    // Build query with optional status filter
    const query: any = { clientId: new Types.ObjectId(clientId) };

    if (status) {
      if (status === 'closed') {
        // 'closed' maps to completed or cancelled
        query.status = { $in: ['completed', 'cancelled'] };
      } else if (status === 'hired') {
        // 'hired' maps to in_progress
        query.status = 'in_progress';
      } else {
        query.status = status;
      }
    }

    const jobs = await this.jobModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // For in_progress jobs, find the accepted proposal and get hired pro info
    const jobsWithHiredPro = await Promise.all(
      jobs.map(async (job) => {
        if (job.status === 'in_progress') {
          const acceptedProposal = await this.proposalModel
            .findOne({ jobId: job._id, status: 'accepted' })
            .populate({
              path: 'proProfileId',
              select: '_id userId avatar title',
              populate: {
                path: 'userId',
                select: 'name avatar',
              },
            })
            .lean()
            .exec();

          if (acceptedProposal?.proProfileId) {
            return {
              ...job,
              hiredPro: acceptedProposal.proProfileId,
            };
          }
        }
        return job;
      })
    );

    return jobsWithHiredPro;
  }

  async updateJob(id: string, clientId: string, updateData: Partial<CreateJobDto>): Promise<Job> {
    const job = await this.jobModel.findById(id);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only update your own jobs');
    }

    return this.jobModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async deleteJob(id: string, clientId: string): Promise<void> {
    const job = await this.jobModel.findById(id);

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only delete your own jobs');
    }

    await this.jobModel.findByIdAndDelete(id);
    await this.proposalModel.deleteMany({ jobId: id });
  }

  // Proposals
  async createProposal(
    jobId: string,
    proId: string,
    proProfileId: string,
    createProposalDto: CreateProposalDto,
  ): Promise<Proposal> {
    // Check if job exists
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Prevent submitting proposal to own job
    if (job.clientId.toString() === proId) {
      throw new ForbiddenException('You cannot submit a proposal to your own job');
    }

    // Check if already proposed
    const existingProposal = await this.proposalModel.findOne({ jobId, proId });
    if (existingProposal) {
      throw new ForbiddenException('You have already submitted a proposal for this job');
    }

    const proposal = new this.proposalModel({
      jobId,
      proId,
      proProfileId,
      ...createProposalDto,
    });

    await proposal.save();

    // Increment proposal count
    await this.jobModel.findByIdAndUpdate(jobId, { $inc: { proposalCount: 1 } });

    return proposal;
  }

  async findJobProposals(jobId: string, clientId: string): Promise<Proposal[]> {
    // Verify job belongs to client
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only view proposals for your own jobs');
    }

    return this.proposalModel
      .find({ jobId })
      .populate('proId', 'name email avatar')
      .populate('proProfileId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findMyProposals(proId: string): Promise<any[]> {
    const proposals = await this.proposalModel
      .find({ proId })
      .populate({
        path: 'jobId',
        populate: {
          path: 'clientId',
          model: 'User',
          select: '_id name email avatar city phone accountType companyName'
        }
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Filter out proposals where the job has been deleted
    return proposals.filter(p => p.jobId !== null);
  }

  async findMyProposalForJob(jobId: string, proId: string): Promise<Proposal | null> {
    return this.proposalModel
      .findOne({ jobId, proId })
      .exec();
  }

  async revealContact(proposalId: string, clientId: string): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate('jobId')
      .exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only reveal contact for your own jobs');
    }

    proposal.contactRevealed = true;
    proposal.revealedAt = new Date();
    await proposal.save();

    return this.proposalModel
      .findById(proposalId)
      .populate('proId', 'name email avatar phone')
      .populate('proProfileId')
      .exec();
  }

  async acceptProposal(proposalId: string, clientId: string): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate('jobId')
      .exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only accept proposals for your own jobs');
    }

    proposal.status = ProposalStatus.ACCEPTED;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update
    await proposal.save();

    // Update job status
    await this.jobModel.findByIdAndUpdate(job._id, {
      status: JobStatus.IN_PROGRESS,
    });

    return proposal;
  }

  async withdrawProposal(proposalId: string, proId: string): Promise<Proposal> {
    const proposal = await this.proposalModel.findById(proposalId).exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.proId.toString() !== proId) {
      throw new ForbiddenException('You can only withdraw your own proposals');
    }

    if (proposal.status === ProposalStatus.WITHDRAWN) {
      throw new ForbiddenException('Proposal is already withdrawn');
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('Cannot withdraw an accepted proposal');
    }

    proposal.status = ProposalStatus.WITHDRAWN;
    await proposal.save();

    return proposal;
  }

  // Saved Jobs
  async saveJob(userId: string, jobId: string): Promise<{ saved: boolean }> {
    const userObjectId = new Types.ObjectId(userId);
    const jobObjectId = new Types.ObjectId(jobId);

    // Check if job exists
    const job = await this.jobModel.findById(jobObjectId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Check if already saved
    const existing = await this.savedJobModel.findOne({
      userId: userObjectId,
      jobId: jobObjectId,
    });

    if (existing) {
      return { saved: true };
    }

    await this.savedJobModel.create({
      userId: userObjectId,
      jobId: jobObjectId,
    });

    return { saved: true };
  }

  async unsaveJob(userId: string, jobId: string): Promise<{ saved: boolean }> {
    const userObjectId = new Types.ObjectId(userId);
    const jobObjectId = new Types.ObjectId(jobId);

    await this.savedJobModel.deleteOne({
      userId: userObjectId,
      jobId: jobObjectId,
    });

    return { saved: false };
  }

  async getSavedJobIds(userId: string): Promise<string[]> {
    const userObjectId = new Types.ObjectId(userId);
    const savedJobs = await this.savedJobModel
      .find({ userId: userObjectId })
      .select('jobId')
      .lean()
      .exec();

    return savedJobs.map((sj) => sj.jobId.toString());
  }

  async isJobSaved(userId: string, jobId: string): Promise<boolean> {
    const userObjectId = new Types.ObjectId(userId);
    const jobObjectId = new Types.ObjectId(jobId);

    const existing = await this.savedJobModel.findOne({
      userId: userObjectId,
      jobId: jobObjectId,
    });

    return !!existing;
  }

  // Counter methods for header badges

  // Get count of unviewed proposals for a client's jobs
  async getUnviewedProposalsCount(clientId: string): Promise<number> {
    const clientObjectId = new Types.ObjectId(clientId);

    // First get all job IDs belonging to this client
    const jobs = await this.jobModel
      .find({ clientId: clientObjectId })
      .select('_id')
      .lean()
      .exec();

    const jobIds = jobs.map(j => j._id);

    if (jobIds.length === 0) return 0;

    // Count unviewed proposals for these jobs
    const count = await this.proposalModel.countDocuments({
      jobId: { $in: jobIds },
      viewedByClient: false,
      status: ProposalStatus.PENDING,
    });

    return count;
  }

  // Get count of proposals with status updates not yet viewed by pro
  async getUnviewedProposalUpdatesCount(proId: string): Promise<number> {
    const proObjectId = new Types.ObjectId(proId);

    // Count proposals where status changed and pro hasn't viewed
    const count = await this.proposalModel.countDocuments({
      proId: proObjectId,
      viewedByPro: false,
      status: { $in: [ProposalStatus.ACCEPTED, ProposalStatus.REJECTED] },
    });

    return count;
  }

  // Mark proposals as viewed by client (when they view job proposals)
  async markProposalsAsViewedByClient(jobId: string, clientId: string): Promise<void> {
    const job = await this.jobModel.findById(jobId);

    if (!job || job.clientId.toString() !== clientId) {
      return; // Silently return if not authorized
    }

    await this.proposalModel.updateMany(
      { jobId: new Types.ObjectId(jobId), viewedByClient: false },
      { viewedByClient: true }
    );
  }

  // Mark proposal updates as viewed by pro (when they view their proposals)
  async markProposalUpdatesAsViewedByPro(proId: string): Promise<void> {
    await this.proposalModel.updateMany(
      {
        proId: new Types.ObjectId(proId),
        viewedByPro: false,
        status: { $in: [ProposalStatus.ACCEPTED, ProposalStatus.REJECTED] }
      },
      { viewedByPro: true }
    );
  }
}
