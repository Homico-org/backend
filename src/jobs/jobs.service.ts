import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobStatus, JobPropertyType } from './schemas/job.schema';
import { Proposal, ProposalStatus } from './schemas/proposal.schema';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
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

    // Support filtering by multiple categories (for pro users with selected categories)
    if (filters?.categories && filters.categories.length > 0) {
      query.category = { $in: filters.categories };
    } else if (filters?.category) {
      query.category = filters.category;
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
      .populate('clientId', 'name email avatar city phone')
      .exec();

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Increment view count
    await this.jobModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

    return job;
  }

  async findMyJobs(clientId: string): Promise<Job[]> {
    const { Types } = require('mongoose');
    return this.jobModel
      .find({ clientId: new Types.ObjectId(clientId) })
      .sort({ createdAt: -1 })
      .exec();
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

  async findMyProposals(proId: string): Promise<Proposal[]> {
    return this.proposalModel
      .find({ proId })
      .populate('jobId')
      .sort({ createdAt: -1 })
      .exec();
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
}
