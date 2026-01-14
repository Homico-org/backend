import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { Job, JobPropertyType, JobStatus, JobView } from './schemas/job.schema';
import { ProjectStage, ProjectTracking } from './schemas/project-tracking.schema';
import { Proposal, ProposalStatus } from './schemas/proposal.schema';
import { SavedJob } from './schemas/saved-job.schema';

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(JobView.name) private jobViewModel: Model<JobView>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SavedJob.name) private savedJobModel: Model<SavedJob>,
    @InjectModel(ProjectTracking.name) private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notificationsService: NotificationsService,
  ) {}

  // Jobs CRUD
  async createJob(clientId: string, createJobDto: CreateJobDto): Promise<Job> {
    const { Types } = require('mongoose');

    // Set expiration date to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Get next job number (auto-increment)
    const lastJob = await this.jobModel
      .findOne({}, { jobNumber: 1 })
      .sort({ jobNumber: -1 })
      .lean()
      .exec();
    const nextJobNumber = (lastJob?.jobNumber || 1000) + 1;

    const job = new this.jobModel({
      clientId: new Types.ObjectId(clientId),
      ...createJobDto,
      jobNumber: nextJobNumber,
      expiresAt,
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
    const andConditions: any[] = [];

    // Support filtering by multiple categories (for pro users with selected categories)
    if (filters?.categories && filters.categories.length > 0) {
      query.category = { $in: filters.categories };
    } else if (filters?.category) {
      query.category = filters.category;
    }

    // Filter by subcategories/skills - jobs must have at least one matching skill OR matching category
    // This handles both new jobs (with skills array) and older jobs (with subcategory as category)
    if (filters?.subcategories && filters.subcategories.length > 0) {
      // Build regex patterns for flexible matching (e.g., "interior" matches "interior-design")
      const subcategoryPatterns = filters.subcategories.map(s => new RegExp(s, 'i'));

      // Check skills array, category field, and allow partial matches
      andConditions.push({
        $or: [
          { skills: { $in: filters.subcategories } },
          { category: { $in: filters.subcategories } },
          // Also match if any skill contains the subcategory (for partial matches)
          { skills: { $elemMatch: { $in: subcategoryPatterns } } },
          // Also match if category contains the subcategory
          { category: { $in: subcategoryPatterns } },
        ],
      });
    }

    if (filters?.location) {
      query.location = new RegExp(filters.location, 'i');
    }

    if (filters?.budgetMin !== undefined || filters?.budgetMax !== undefined) {
      const budgetOr: any[] = [
        { budgetAmount: {} },
        { budgetMax: {} },
      ];

      if (filters?.budgetMin !== undefined) {
        budgetOr[0].budgetAmount.$gte = filters.budgetMin;
        budgetOr[1].budgetMax.$gte = filters.budgetMin;
      }

      if (filters?.budgetMax !== undefined) {
        budgetOr[0].budgetAmount.$lte = filters.budgetMax;
        budgetOr[1].budgetMax.$lte = filters.budgetMax;
      }

      andConditions.push({ $or: budgetOr });
    }

    if (filters?.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      andConditions.push({
        $or: [
          { title: searchRegex },
          { description: searchRegex },
        ],
      });
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
        andConditions.push({
          $or: [{ deadline: null }, { deadline: { $exists: false } }],
        });
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

    // Apply $and conditions if any exist
    if (andConditions.length > 0) {
      query.$and = andConditions;
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

  async findJobById(id: string, userId?: string, visitorId?: string): Promise<any> {
    const job = await this.jobModel
      .findById(id)
      .populate('clientId', '_id name email avatar city phone accountType companyName')
      .lean()
      .exec();

    if (!job) {
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
    }

    // Don't count view if viewer is the job owner
    const isOwner = userId && job.clientId && (job.clientId as any)._id.toString() === userId;

    if (!isOwner) {
      // Try to record unique view
      try {
        const jobObjectId = new Types.ObjectId(id);

        if (userId) {
          // Logged in user - check by userId
          const existingView = await this.jobViewModel.findOne({
            jobId: jobObjectId,
            userId: new Types.ObjectId(userId),
          });

          if (!existingView) {
            await this.jobViewModel.create({
              jobId: jobObjectId,
              userId: new Types.ObjectId(userId),
            });
            await this.jobModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });
          }
        } else if (visitorId) {
          // Anonymous user - check by visitorId (IP hash)
          const existingView = await this.jobViewModel.findOne({
            jobId: jobObjectId,
            visitorId: visitorId,
          });

          if (!existingView) {
            await this.jobViewModel.create({
              jobId: jobObjectId,
              visitorId: visitorId,
            });
            await this.jobModel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });
          }
        }
      } catch (error) {
        // Silently ignore duplicate key errors (race condition)
        if (error.code !== 11000) {
          console.error('Error recording job view:', error);
        }
      }
    }

    // For in_progress or completed jobs, find the accepted proposal and get hired pro info
    if (job.status === 'in_progress' || job.status === 'completed') {
      const acceptedProposal = await this.proposalModel
        .findOne({ jobId: job._id, status: 'accepted' })
        .populate({
          path: 'proId',
          select: '_id uid name avatar phone title',
        })
        .lean()
        .exec();

      if (acceptedProposal?.proId) {
        const proUser = acceptedProposal.proId as any;
        const proId = proUser._id?.toString();
        return {
          ...job,
          hiredPro: {
            id: proId,
            _id: proId,
            uid: proUser.uid,
            userId: {
              id: proId,
              _id: proId,
              uid: proUser.uid,
              name: proUser.name,
              avatar: proUser.avatar,
            },
            name: proUser.name,
            avatar: proUser.avatar,
            title: proUser.title,
            phone: proUser.phone,
          },
        };
      }
    }

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
      } else if (status === 'expired') {
        // 'expired' status
        query.status = 'expired';
      } else {
        query.status = status;
      }
    }

    const jobs = await this.jobModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Get job IDs for batch querying proposals
    const jobIds = jobs.map((job) => job._id);

    // Get shortlisted counts for all jobs in one query
    const shortlistedCounts = await this.proposalModel.aggregate([
      {
        $match: {
          jobId: { $in: jobIds },
          status: 'shortlisted',
        },
      },
      {
        $group: {
          _id: '$jobId',
          count: { $sum: 1 },
        },
      },
    ]);

    const shortlistedCountMap = new Map(
      shortlistedCounts.map((item) => [item._id.toString(), item.count])
    );

    // Get recent proposals (up to 3) for each job to show avatars
    const recentProposals = await this.proposalModel
      .find({
        jobId: { $in: jobIds },
        status: { $in: ['pending', 'shortlisted'] },
      })
      .sort({ createdAt: -1 })
      .populate({
        path: 'proId',
        select: 'name avatar',
      })
      .lean()
      .exec();

    // Group proposals by job ID (max 3 per job)
    const recentProposalsMap = new Map<string, any[]>();
    for (const proposal of recentProposals) {
      const jobIdStr = proposal.jobId.toString();
      if (!recentProposalsMap.has(jobIdStr)) {
        recentProposalsMap.set(jobIdStr, []);
      }
      const jobProposals = recentProposalsMap.get(jobIdStr)!;
      if (jobProposals.length < 3) {
        const proUser = proposal.proId as any;
        jobProposals.push({
          _id: proposal._id,
          proId: {
            name: proUser?.name || '',
            avatar: proUser?.avatar || '',
          },
        });
      }
    }

    // For in_progress or completed jobs, find the accepted proposal and get hired pro info
    const jobsWithDetails = await Promise.all(
      jobs.map(async (job) => {
        const jobIdStr = job._id.toString();
        const shortlistedCount = shortlistedCountMap.get(jobIdStr) || 0;
        const jobRecentProposals = recentProposalsMap.get(jobIdStr) || [];

        if (job.status === 'in_progress' || job.status === 'completed') {
          const acceptedProposal = await this.proposalModel
            .findOne({ jobId: job._id, status: 'accepted' })
            .populate({
              path: 'proId',
              select: '_id uid name avatar phone title',
            })
            .lean()
            .exec();

          if (acceptedProposal?.proId) {
            const proUser = acceptedProposal.proId as any;
            const proId = proUser._id?.toString();
            return {
              ...job,
              shortlistedCount,
              recentProposals: jobRecentProposals,
              hiredPro: {
                id: proId,
                _id: proId,
                uid: proUser.uid,
                userId: {
                  id: proId,
                  _id: proId,
                  uid: proUser.uid,
                  name: proUser.name,
                  avatar: proUser.avatar,
                },
                name: proUser.name,
                avatar: proUser.avatar,
                title: proUser.title,
                phone: proUser.phone,
              },
            };
          }
        }
        return {
          ...job,
          shortlistedCount,
          recentProposals: jobRecentProposals,
        };
      })
    );

    return jobsWithDetails;
  }

  async updateJob(id: string, clientId: string, updateData: Partial<CreateJobDto>): Promise<Job> {
    const job = await this.jobModel.findById(id);

    if (!job) {
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების განახლება');
    }

    return this.jobModel.findByIdAndUpdate(id, updateData, { new: true }).exec();
  }

  async deleteJob(id: string, clientId: string): Promise<void> {
    const job = await this.jobModel.findById(id);

    if (!job) {
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წაშლა');
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
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
    }

    // Prevent submitting proposal to own job
    if (job.clientId.toString() === proId) {
      throw new ForbiddenException('საკუთარ თავს ვერ გაუგზავნით წინადადებას');
    }

    // Check if already proposed
    const existingProposal = await this.proposalModel.findOne({ jobId, proId });
    if (existingProposal) {
      throw new ForbiddenException('წინადადება უკვე გაგზავნილია ამ სამუშაოზე');
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

    // Send notification to job owner (client)
    try {
      const pro = await this.userModel.findById(proId).select('name').exec();
      await this.notificationsService.notify(
        job.clientId.toString(),
        NotificationType.NEW_PROPOSAL,
        'ახალი შეთავაზება',
        `${pro?.name || 'სპეციალისტმა'} გამოგიგზავნათ შეთავაზება: "${job.title}"`,
        {
          link: `/my-jobs/${jobId}/proposals`,
          referenceId: proposal._id.toString(),
          referenceModel: 'Proposal',
          metadata: {
            jobId,
            jobTitle: job.title,
            proName: pro?.name,
            proposedPrice: createProposalDto.proposedPrice,
          },
        },
      );
    } catch (error) {
      console.error('Failed to send new proposal notification:', error);
    }

    return proposal;
  }

  async findJobProposals(jobId: string, clientId: string): Promise<Proposal[]> {
    // Verify job belongs to client
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ გაეცნოთ მხოლოდ თქვენი სამუშაოების წინადადებებს');
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
    const validProposals = proposals.filter(p => p.jobId !== null);

    // Fetch project tracking for accepted proposals
    const acceptedProposals = validProposals.filter(p => p.status === ProposalStatus.ACCEPTED || p.status === ProposalStatus.COMPLETED);
    const jobIds = acceptedProposals.map(p => (p.jobId as any)._id);

    if (jobIds.length > 0) {
      const projectTrackings = await this.projectTrackingModel
        .find({ jobId: { $in: jobIds } })
        .select('jobId currentStage progress startedAt completedAt')
        .lean()
        .exec();

      const trackingMap = new Map(projectTrackings.map(pt => [pt.jobId.toString(), pt]));

      return validProposals.map(p => {
        const jobId = (p.jobId as any)?._id?.toString();
        const tracking = jobId ? trackingMap.get(jobId) : null;
        return {
          ...p,
          projectTracking: tracking || null,
        };
      });
    }

    return validProposals;
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
      throw new ForbiddenException('თქვენ შეგიძლიათ გაეცნოთ მხოლოდ თქვენი სამუშაოების წინადადებებს');
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

  async shortlistProposal(
    proposalId: string,
    clientId: string,
    hiringChoice: 'homico' | 'direct',
  ): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate('jobId')
      .populate('proId', 'name email avatar phone')
      .exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წინადადებებს მართოთ');
    }

    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ForbiddenException('მხოლოდ მოლოდინში მყოფი წინადადებების შორტლისტში დამატება შეიძლება');
    }

    proposal.status = ProposalStatus.SHORTLISTED;
    proposal.hiringChoice = hiringChoice as any;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update

    // If direct contact, reveal phone
    if (hiringChoice === 'direct') {
      proposal.contactRevealed = true;
      proposal.revealedAt = new Date();
    }

    await proposal.save();

    return proposal;
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
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წინადადებებს მიღებოთ');
    }

    proposal.status = ProposalStatus.ACCEPTED;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update
    await proposal.save();

    // Update job status
    await this.jobModel.findByIdAndUpdate(job._id, {
      status: JobStatus.IN_PROGRESS,
    });

    // Create project tracking for this job
    const now = new Date();
    await this.projectTrackingModel.create({
      jobId: new Types.ObjectId(job._id),
      clientId: new Types.ObjectId(clientId),
      proId: proposal.proId,
      proposalId: new Types.ObjectId(proposalId),
      currentStage: ProjectStage.HIRED,
      progress: 0,
      hiredAt: now,
      agreedPrice: proposal.proposedPrice,
      estimatedDuration: proposal.estimatedDuration,
      estimatedDurationUnit: proposal.estimatedDurationUnit,
      stageHistory: [
        {
          stage: ProjectStage.HIRED,
          enteredAt: now,
        },
      ],
    });

    // Send notification to pro that they are hired
    try {
      const client = await this.userModel.findById(clientId).select('name').exec();
      await this.notificationsService.notify(
        proposal.proId.toString(),
        NotificationType.PROPOSAL_ACCEPTED,
        'თქვენ დაქირავებული ხართ!',
        `${client?.name || 'კლიენტმა'} დაგიქირავათ პროექტზე: "${job.title}"`,
        {
          link: `/my-work`,
          referenceId: job._id.toString(),
          referenceModel: 'Job',
          metadata: {
            jobId: job._id.toString(),
            jobTitle: job.title,
            clientName: client?.name,
          },
        },
      );
    } catch (error) {
      console.error('Failed to send hired notification:', error);
    }

    return proposal;
  }

  async rejectProposal(proposalId: string, clientId: string): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate('jobId')
      .exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წინადადებებს უარყოფა');
    }

    if (proposal.status === ProposalStatus.REJECTED) {
      throw new ForbiddenException('წინადადება უკვე უარყოფილია');
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('მიღებული წინადადების უარყოფა შეუძლებელია');
    }

    proposal.status = ProposalStatus.REJECTED;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update
    await proposal.save();

    // Send notification to pro that their proposal was rejected
    try {
      const client = await this.userModel.findById(clientId).select('name').exec();
      await this.notificationsService.notify(
        proposal.proId.toString(),
        NotificationType.PROPOSAL_REJECTED,
        'შეთავაზება უარყოფილია',
        `${client?.name || 'კლიენტმა'} უარყო თქვენი შეთავაზება: "${job.title}"`,
        {
          link: `/my-proposals`,
          referenceId: proposalId,
          referenceModel: 'Proposal',
          metadata: {
            jobId: job._id.toString(),
            jobTitle: job.title,
            clientName: client?.name,
          },
        },
      );
    } catch (error) {
      console.error('Failed to send proposal rejected notification:', error);
    }

    return proposal;
  }

  async revertProposalToPending(proposalId: string, clientId: string): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate('jobId')
      .exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('You can only manage proposals for your own jobs');
    }

    if (proposal.status === ProposalStatus.PENDING) {
      throw new ForbiddenException('Proposal is already pending');
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('Cannot revert an accepted proposal');
    }

    if (proposal.status === ProposalStatus.WITHDRAWN) {
      throw new ForbiddenException('Cannot revert a withdrawn proposal');
    }

    // Revert to pending and clear hiring choice
    proposal.status = ProposalStatus.PENDING;
    proposal.hiringChoice = undefined;
    proposal.contactRevealed = false;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update
    await proposal.save();

    return proposal;
  }

  async withdrawProposal(proposalId: string, proId: string): Promise<Proposal> {
    const proposal = await this.proposalModel.findById(proposalId).exec();

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.proId.toString() !== proId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი წინადადებების გაუქმებას გაეცნოთ');
    }

    if (proposal.status === ProposalStatus.WITHDRAWN) {
      throw new ForbiddenException('წინადადება უკვე გაუქმდა');
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('წინადადება უკვე მიღებულია');
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
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
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

  // Complete a job and add it to the pro's portfolio
  async completeJob(
    jobId: string,
    clientId: string,
    completionData?: {
      completionImages?: string[];
      completionNote?: string;
      beforeImages?: string[];
      afterImages?: string[];
    }
  ): Promise<Job> {
    const job = await this.jobModel.findById(jobId);

    if (!job) {
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების დასრულება');
    }

    if (job.status === JobStatus.COMPLETED) {
      throw new ForbiddenException('სამუშაო უკვე დასრულებულია');
    }

    // Find the accepted proposal to get the pro's ID
    const acceptedProposal = await this.proposalModel.findOne({
      jobId: new Types.ObjectId(jobId),
      status: ProposalStatus.ACCEPTED,
    });

    if (!acceptedProposal) {
      throw new ForbiddenException('ვერ მოიძებნა მიღებული წინადადება');
    }

    // Update job status to completed
    await this.jobModel.findByIdAndUpdate(jobId, { status: JobStatus.COMPLETED });

    // Add job to pro's portfolio as a Homico-verified project
    const proId = acceptedProposal.proId;

    // Combine all images: original job images + completion images
    const allImages = [
      ...(job.images || []),
      ...(completionData?.completionImages || []),
      ...(completionData?.afterImages || []),
    ];

    // Create before/after pairs if provided
    const beforeAfterPairs = [];
    if (completionData?.beforeImages && completionData?.afterImages) {
      const minLength = Math.min(
        completionData.beforeImages.length,
        completionData.afterImages.length
      );
      for (let i = 0; i < minLength; i++) {
        beforeAfterPairs.push({
          id: `pair-${Date.now()}-${i}`,
          beforeImage: completionData.beforeImages[i],
          afterImage: completionData.afterImages[i],
        });
      }
    }

    // Create new portfolio project with Homico source
    const portfolioProject = {
      id: `homico-${jobId}`,
      title: job.title,
      description: completionData?.completionNote || job.description,
      location: job.location,
      images: allImages.length > 0 ? allImages : job.images || [],
      beforeAfterPairs,
      source: 'homico' as const,
      jobId: jobId,
    };

    // Add to pro's portfolioProjects
    await this.userModel.findByIdAndUpdate(
      proId,
      {
        $push: { portfolioProjects: portfolioProject },
        $inc: { completedJobs: 1 },
      }
    );

    return this.jobModel.findById(jobId).exec();
  }

  // Renew an expired job - extends for another 30 days
  async renewJob(jobId: string, clientId: string): Promise<Job> {
    const job = await this.jobModel.findById(jobId);

    if (!job) {
      throw new NotFoundException('სამუშაო ვერ მოიძებნა');
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException('თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების განახლება');
    }

    if (job.status !== JobStatus.EXPIRED) {
      throw new ForbiddenException('მხოლოდ ვადაგასული სამუშაოების განახლება შეიძლება');
    }

    // Set new expiration date to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return this.jobModel.findByIdAndUpdate(
      jobId,
      {
        status: JobStatus.OPEN,
        expiresAt,
      },
      { new: true }
    ).exec();
  }

  // Expire old jobs - called by scheduled task
  async expireOldJobs(): Promise<number> {
    const now = new Date();

    const result = await this.jobModel.updateMany(
      {
        status: JobStatus.OPEN,
        expiresAt: { $lte: now },
      },
      {
        status: JobStatus.EXPIRED,
      }
    );

    return result.modifiedCount;
  }
}
