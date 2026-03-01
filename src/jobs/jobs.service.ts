import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/schemas/notification.schema";
import { User, UserRole } from "../users/schemas/user.schema";
import { SmsService } from "../verification/services/sms.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import {
  Job,
  JobPropertyType,
  JobStatus,
  JobType,
  JobView,
} from "./schemas/job.schema";
import {
  ProjectStage,
  ProjectTracking,
} from "./schemas/project-tracking.schema";
import { Proposal, ProposalStatus } from "./schemas/proposal.schema";
import { SavedJob } from "./schemas/saved-job.schema";

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(JobView.name) private jobViewModel: Model<JobView>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SavedJob.name) private savedJobModel: Model<SavedJob>,
    @InjectModel(ProjectTracking.name)
    private projectTrackingModel: Model<ProjectTracking>,
    @InjectModel(User.name) private userModel: Model<User>,
    private notificationsService: NotificationsService,
    private smsService: SmsService,
  ) {}

  // Jobs CRUD
  async createJob(clientId: string, createJobDto: CreateJobDto): Promise<Job> {
    const { Types } = require("mongoose");

    // Extract invitedPros before spreading DTO into job document
    const { invitedPros: invitedProIds, ...jobData } = createJobDto;

    // Prevent duplicate job creation within 30 seconds (same user, same title)
    const recentDuplicateCheck = new Date();
    recentDuplicateCheck.setSeconds(recentDuplicateCheck.getSeconds() - 30);

    const existingJob = await this.jobModel
      .findOne({
        clientId: new Types.ObjectId(clientId),
        title: createJobDto.title,
        createdAt: { $gte: recentDuplicateCheck },
      })
      .exec();

    if (existingJob) {
      // Return the existing job instead of creating a duplicate
      return existingJob;
    }

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
      ...jobData,
      invitedPros: invitedProIds
        ? invitedProIds.map((id) => new Types.ObjectId(id))
        : [],
      jobNumber: nextJobNumber,
      expiresAt,
    });
    const savedJob = await job.save();

    // Auto-invite pros if any were specified
    if (invitedProIds && invitedProIds.length > 0) {
      try {
        await this.invitePros(savedJob._id.toString(), clientId, invitedProIds);
      } catch (error) {
        console.error("Failed to auto-invite pros:", error);
      }
    }

    return savedJob;
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

    const query: any = {};
    // By default, the public browse should show OPEN jobs only.
    // Admins can see all jobs in the admin panel, but browse page shows only open jobs.
    if (filters?.status) {
      query.status = filters.status;
    } else {
      query.status = JobStatus.OPEN;
    }

    // Exclude direct_request jobs from public browse — they are only visible to invited pros
    query.jobType = { $ne: JobType.DIRECT_REQUEST };

    const andConditions: any[] = [];

    // Exclude jobs with expired deadlines (only for open jobs browse)
    // Jobs with no deadline or deadline in the future should be shown
    if (query.status === JobStatus.OPEN) {
      const now = new Date();
      andConditions.push({
        $or: [
          { deadline: { $exists: false } },
          { deadline: null },
          { deadline: { $gte: now } },
        ],
      });
    }

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
      const subcategoryPatterns = filters.subcategories.map(
        (s) => new RegExp(s, "i"),
      );

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
      query.location = new RegExp(filters.location, "i");
    }

    if (filters?.budgetMin !== undefined || filters?.budgetMax !== undefined) {
      const budgetOr: any[] = [{ budgetAmount: {} }, { budgetMax: {} }];

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
      const searchRegex = new RegExp(filters.search, "i");
      andConditions.push({
        $or: [{ title: searchRegex }, { description: searchRegex }],
      });
    }

    // Property type filter
    if (filters?.propertyType) {
      query.propertyType = filters.propertyType;
    }

    // Proposal count range filter
    if (filters?.proposalCountMin !== undefined) {
      query.proposalCount = {
        ...query.proposalCount,
        $gte: filters.proposalCountMin,
      };
    }
    if (filters?.proposalCountMax !== undefined) {
      query.proposalCount = {
        ...query.proposalCount,
        $lte: filters.proposalCountMax,
      };
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
    if (filters?.deadline && filters.deadline !== "all") {
      const now = new Date();
      if (filters.deadline === "urgent") {
        // Jobs with deadline within 7 days
        const sevenDaysLater = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000,
        );
        query.deadline = { $gte: now, $lte: sevenDaysLater };
      } else if (filters.deadline === "week") {
        // Jobs with deadline within this week (next 7 days)
        const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        query.deadline = { $gte: now, $lte: weekLater };
      } else if (filters.deadline === "month") {
        // Jobs with deadline within this month (next 30 days)
        const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        query.deadline = { $gte: now, $lte: monthLater };
      } else if (filters.deadline === "flexible") {
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
    if (filters?.sort === "oldest") {
      sortOption = { createdAt: 1 };
    } else if (filters?.sort === "budget-high") {
      sortOption = { budgetAmount: -1, budgetMax: -1 };
    } else if (filters?.sort === "budget-low") {
      sortOption = { budgetAmount: 1, budgetMin: 1 };
    } else if (filters?.sort === "proposals-high") {
      sortOption = { proposalCount: -1 };
    } else if (filters?.sort === "proposals-low") {
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
            from: "users",
            localField: "clientId",
            foreignField: "_id",
            as: "client",
          },
        },
        { $unwind: "$client" },
        { $match: { "client.accountType": filters.clientType } },
        { $sort: sortOption },
      ];

      const countPipeline = [...pipeline, { $count: "total" }];
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
          .populate(
            "clientId",
            "name email avatar city accountType companyName",
          )
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

  async findJobById(
    id: string,
    userId?: string,
    visitorId?: string,
  ): Promise<any> {
    const job = await this.jobModel
      .findById(id)
      .populate(
        "clientId",
        "_id name email avatar city phone accountType companyName",
      )
      .lean()
      .exec();

    if (!job) {
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
    }

    // Don't count view if viewer is the job owner
    const isOwner =
      userId && job.clientId && (job.clientId as any)._id.toString() === userId;

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
            await this.jobModel.findByIdAndUpdate(id, {
              $inc: { viewCount: 1 },
            });
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
            await this.jobModel.findByIdAndUpdate(id, {
              $inc: { viewCount: 1 },
            });
          }
        }
      } catch (error) {
        // Silently ignore duplicate key errors (race condition)
        if (error.code !== 11000) {
          console.error("Error recording job view:", error);
        }
      }
    }

    // Ensure subcategory is set (for backward compatibility with jobs that only have skills)
    const jobWithSubcategory: any = {
      ...job,
      subcategory:
        (job as any).subcategory ||
        ((job as any).skills && (job as any).skills[0]) ||
        undefined,
    };

    // For direct_request jobs, populate invited pros with status details
    if (
      (job as any).jobType === JobType.DIRECT_REQUEST &&
      (job as any).invitedPros?.length > 0
    ) {
      const invitedProIds = (job as any).invitedPros.map((id: any) =>
        id.toString ? id.toString() : id,
      );
      const declinedProIds = ((job as any).declinedPros || []).map((id: any) =>
        id.toString ? id.toString() : id,
      );
      const hiredProId = (job as any).hiredProId?.toString();

      const proUsers = await this.userModel
        .find({
          _id: {
            $in: invitedProIds.map((id: string) => new Types.ObjectId(id)),
          },
        })
        .select("_id name avatar title")
        .lean()
        .exec();

      jobWithSubcategory.invitedProsDetails = proUsers.map((pro: any) => {
        const proId = pro._id.toString();
        let status = "pending";
        if (hiredProId && proId === hiredProId) status = "accepted";
        else if (declinedProIds.includes(proId)) status = "declined";
        return {
          _id: proId,
          name: pro.name,
          avatar: pro.avatar,
          title: pro.title,
          status,
        };
      });
    }

    // For in_progress or completed jobs, get hired pro info + project tracking
    if (job.status === "in_progress" || job.status === "completed") {
      // Fetch project tracking for stage progress
      const projectTracking = await this.projectTrackingModel
        .findOne({ jobId: job._id })
        .select("currentStage progress stageHistory")
        .lean()
        .exec();

      const trackingData = projectTracking
        ? {
            projectTracking: {
              id: (projectTracking as any)._id?.toString(),
              currentStage: projectTracking.currentStage,
              progress: projectTracking.progress,
              stages: projectTracking.stageHistory?.map((sh: any) => ({
                name: sh.stage,
                status: sh.exitedAt ? "completed" : "active",
                completedAt: sh.exitedAt?.toISOString(),
              })),
            },
          }
        : {};

      // First try to use hiredProId directly from the job (more reliable)
      const hiredProIdToUse = (job as any).hiredProId;

      if (hiredProIdToUse) {
        const proUser = await this.userModel
          .findById(hiredProIdToUse)
          .select("_id uid name avatar phone title")
          .lean()
          .exec();

        if (proUser) {
          const proId = proUser._id?.toString();
          return {
            ...jobWithSubcategory,
            ...trackingData,
            hiredPro: {
              id: proId,
              _id: proId,
              uid: (proUser as any).uid,
              userId: {
                id: proId,
                _id: proId,
                uid: (proUser as any).uid,
                name: (proUser as any).name,
                avatar: (proUser as any).avatar,
              },
              name: (proUser as any).name,
              avatar: (proUser as any).avatar,
              title: (proUser as any).title,
              phone: (proUser as any).phone,
            },
          };
        }
      }

      // Fallback: find accepted proposal (for backward compatibility with jobs created before hiredProId was added)
      const acceptedProposal = await this.proposalModel
        .findOne({ jobId: job._id, status: "accepted" })
        .populate({
          path: "proId",
          select: "_id uid name avatar phone title",
        })
        .lean()
        .exec();

      if (acceptedProposal?.proId) {
        const proUser = acceptedProposal.proId as any;
        const proId = proUser._id?.toString();
        return {
          ...jobWithSubcategory,
          ...trackingData,
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

    return jobWithSubcategory;
  }

  async findMyJobs(
    clientId: string,
    status?: string,
    source?: string,
  ): Promise<any[]> {
    const { Types } = require("mongoose");

    // Build query with optional status filter
    const query: any = { clientId: new Types.ObjectId(clientId) };

    if (status) {
      if (status === "closed") {
        // 'closed' maps to completed or cancelled
        query.status = { $in: ["completed", "cancelled"] };
      } else if (status === "hired") {
        // 'hired' maps to in_progress
        query.status = "in_progress";
      } else if (status === "expired") {
        // 'expired' status
        query.status = "expired";
      } else {
        query.status = status;
      }
    }

    // Mobile orders always have services populated; web job postings don't
    if (source === "mobile") {
      query["services.0"] = { $exists: true };
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
          status: "shortlisted",
        },
      },
      {
        $group: {
          _id: "$jobId",
          count: { $sum: 1 },
        },
      },
    ]);

    const shortlistedCountMap = new Map(
      shortlistedCounts.map((item) => [item._id.toString(), item.count]),
    );

    // Get recent proposals (up to 3) for each job to show avatars
    const recentProposals = await this.proposalModel
      .find({
        jobId: { $in: jobIds },
        status: { $in: ["pending", "shortlisted"] },
      })
      .sort({ createdAt: -1 })
      .populate({
        path: "proId",
        select: "name avatar",
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
            name: proUser?.name || "",
            avatar: proUser?.avatar || "",
          },
        });
      }
    }

    // For in_progress or completed jobs, get hired pro info
    const jobsWithDetails = await Promise.all(
      jobs.map(async (job) => {
        const jobIdStr = job._id.toString();
        const shortlistedCount = shortlistedCountMap.get(jobIdStr) || 0;
        const jobRecentProposals = recentProposalsMap.get(jobIdStr) || [];

        // Ensure subcategory is set (for backward compatibility with jobs that only have skills)
        const subcategory =
          (job as any).subcategory ||
          ((job as any).skills && (job as any).skills[0]) ||
          undefined;

        if (job.status === "in_progress" || job.status === "completed") {
          // First try to use hiredProId directly from the job (more reliable)
          const hiredProIdToUse = (job as any).hiredProId;

          if (hiredProIdToUse) {
            const proUser = await this.userModel
              .findById(hiredProIdToUse)
              .select("_id uid name avatar phone title")
              .lean()
              .exec();

            if (proUser) {
              const proId = proUser._id?.toString();
              return {
                ...job,
                subcategory,
                shortlistedCount,
                recentProposals: jobRecentProposals,
                hiredPro: {
                  id: proId,
                  _id: proId,
                  uid: (proUser as any).uid,
                  userId: {
                    id: proId,
                    _id: proId,
                    uid: (proUser as any).uid,
                    name: (proUser as any).name,
                    avatar: (proUser as any).avatar,
                  },
                  name: (proUser as any).name,
                  avatar: (proUser as any).avatar,
                  title: (proUser as any).title,
                  phone: (proUser as any).phone,
                },
              };
            }
          }

          // Fallback: find accepted proposal (for backward compatibility)
          const acceptedProposal = await this.proposalModel
            .findOne({ jobId: job._id, status: "accepted" })
            .populate({
              path: "proId",
              select: "_id uid name avatar phone title",
            })
            .lean()
            .exec();

          if (acceptedProposal?.proId) {
            const proUser = acceptedProposal.proId as any;
            const proId = proUser._id?.toString();
            return {
              ...job,
              subcategory,
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
          subcategory,
          shortlistedCount,
          recentProposals: jobRecentProposals,
        };
      }),
    );

    return jobsWithDetails;
  }

  async updateJob(
    id: string,
    clientId: string,
    updateData: Partial<CreateJobDto>,
  ): Promise<Job> {
    const job = await this.jobModel.findById(id);

    if (!job) {
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების განახლება",
      );
    }

    // Support "clearing" optional fields (ex: cadastralId) by sending null or empty string.
    // - undefined: leave unchanged
    // - null / "": unset in Mongo
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    Object.entries(updateData || {}).forEach(([key, value]) => {
      if (value === undefined) return;
      if (value === null) {
        $unset[key] = 1;
        return;
      }
      if (typeof value === "string" && value.trim() === "") {
        $unset[key] = 1;
        return;
      }
      $set[key] = value;
    });

    const mongoUpdate: any = {};
    if (Object.keys($set).length > 0) mongoUpdate.$set = $set;
    if (Object.keys($unset).length > 0) mongoUpdate.$unset = $unset;

    // If nothing to update, return the current job
    if (Object.keys(mongoUpdate).length === 0) {
      return job.toObject() as any;
    }

    return this.jobModel
      .findByIdAndUpdate(id, mongoUpdate, { new: true })
      .exec();
  }

  async deleteJob(id: string, clientId: string): Promise<void> {
    const job = await this.jobModel.findById(id);

    if (!job) {
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წაშლა",
      );
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
    // Check if pro is verified
    const proUser = await this.userModel
      .findById(proId)
      .select("verificationStatus")
      .exec();
    if (!proUser) {
      throw new NotFoundException("მომხმარებელი ვერ მოიძებნა");
    }

    // Only verified professionals can send proposals
    if (proUser.verificationStatus !== "verified") {
      throw new ForbiddenException(
        "წინადადების გასაგზავნად საჭიროა პროფილის ვერიფიკაცია. გთხოვთ გაიაროთ ვერიფიკაცია პარამეტრებში.",
      );
    }

    // Check if job exists
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
    }

    // Only allow proposals for high-level categories (design, architecture)
    const HIGH_LEVEL_CATEGORIES = ["design", "architecture"];
    if (
      !job.category ||
      !HIGH_LEVEL_CATEGORIES.includes(job.category.toLowerCase())
    ) {
      throw new ForbiddenException(
        "წინადადებების გაგზავნა შესაძლებელია მხოლოდ დიზაინისა და არქიტექტურის კატეგორიის სამუშაოებზე. სხვა კატეგორიებისთვის გამოიყენეთ კომენტარები.",
      );
    }

    // Prevent submitting proposal to own job
    if (job.clientId.toString() === proId) {
      throw new ForbiddenException("საკუთარ თავს ვერ გაუგზავნით წინადადებას");
    }

    // Check if already proposed
    const existingProposal = await this.proposalModel.findOne({ jobId, proId });
    if (existingProposal) {
      throw new ForbiddenException("წინადადება უკვე გაგზავნილია ამ სამუშაოზე");
    }

    const proposal = new this.proposalModel({
      jobId,
      proId,
      proProfileId,
      ...createProposalDto,
    });

    await proposal.save();

    // Increment proposal count
    await this.jobModel.findByIdAndUpdate(jobId, {
      $inc: { proposalCount: 1 },
    });

    // Send notification to job owner (client)
    try {
      const pro = await this.userModel.findById(proId).select("name").exec();
      await this.notificationsService.notify(
        job.clientId.toString(),
        NotificationType.NEW_PROPOSAL,
        "ახალი შეთავაზება",
        `${pro?.name || "სპეციალისტმა"} გამოგიგზავნათ შეთავაზება: "${job.title}"`,
        {
          link: `/my-jobs/${jobId}/proposals`,
          referenceId: proposal._id.toString(),
          referenceModel: "Proposal",
          metadata: {
            jobId,
            jobTitle: job.title,
            proName: pro?.name,
            proposedPrice: createProposalDto.proposedPrice,
          },
        },
      );
    } catch (error) {
      console.error("Failed to send new proposal notification:", error);
    }

    return proposal;
  }

  async findJobProposals(jobId: string, clientId: string): Promise<Proposal[]> {
    // Verify job belongs to client
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ გაეცნოთ მხოლოდ თქვენი სამუშაოების წინადადებებს",
      );
    }

    return this.proposalModel
      .find({ jobId })
      .populate("proId", "name email avatar")
      .populate("proProfileId")
      .sort({ createdAt: -1 })
      .exec();
  }

  async findMyProposals(proId: string): Promise<any[]> {
    const proposals = await this.proposalModel
      .find({ proId })
      .populate({
        path: "jobId",
        populate: {
          path: "clientId",
          model: "User",
          select: "_id name email avatar city phone accountType companyName",
        },
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Filter out proposals where the job has been deleted
    const validProposals = proposals.filter((p) => p.jobId !== null);

    // Fetch project tracking for accepted proposals
    const acceptedProposals = validProposals.filter(
      (p) =>
        p.status === ProposalStatus.ACCEPTED ||
        p.status === ProposalStatus.COMPLETED,
    );
    const jobIds = acceptedProposals.map((p) => (p.jobId as any)._id);

    if (jobIds.length > 0) {
      const projectTrackings = await this.projectTrackingModel
        .find({ jobId: { $in: jobIds } })
        .select("jobId currentStage progress startedAt completedAt")
        .lean()
        .exec();

      const trackingMap = new Map(
        projectTrackings.map((pt) => [pt.jobId.toString(), pt]),
      );

      return validProposals.map((p) => {
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

  async findMyProposalForJob(
    jobId: string,
    proId: string,
  ): Promise<Proposal | null> {
    return this.proposalModel.findOne({ jobId, proId }).exec();
  }

  async revealContact(proposalId: string, clientId: string): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate("jobId")
      .exec();

    if (!proposal) {
      throw new NotFoundException("Proposal not found");
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ გაეცნოთ მხოლოდ თქვენი სამუშაოების წინადადებებს",
      );
    }

    proposal.contactRevealed = true;
    proposal.revealedAt = new Date();
    await proposal.save();

    return this.proposalModel
      .findById(proposalId)
      .populate("proId", "name email avatar phone")
      .populate("proProfileId")
      .exec();
  }

  async shortlistProposal(
    proposalId: string,
    clientId: string,
    hiringChoice: "homico" | "direct",
  ): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate("jobId")
      .populate("proId", "name email avatar phone")
      .exec();

    if (!proposal) {
      throw new NotFoundException("Proposal not found");
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წინადადებებს მართოთ",
      );
    }

    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ForbiddenException(
        "მხოლოდ მოლოდინში მყოფი წინადადებების შორტლისტში დამატება შეიძლება",
      );
    }

    proposal.status = ProposalStatus.SHORTLISTED;
    proposal.hiringChoice = hiringChoice as any;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update

    // If direct contact, reveal phone
    if (hiringChoice === "direct") {
      proposal.contactRevealed = true;
      proposal.revealedAt = new Date();
    }

    await proposal.save();

    return proposal;
  }

  async acceptProposal(
    proposalId: string,
    clientId: string,
  ): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate("jobId")
      .exec();

    if (!proposal) {
      throw new NotFoundException("Proposal not found");
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წინადადებებს მიღებოთ",
      );
    }

    proposal.status = ProposalStatus.ACCEPTED;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update
    await proposal.save();

    // Update job status and set hiredProId
    await this.jobModel.findByIdAndUpdate(job._id, {
      status: JobStatus.IN_PROGRESS,
      hiredProId: proposal.proId,
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
      const client = await this.userModel
        .findById(clientId)
        .select("name")
        .exec();
      await this.notificationsService.notify(
        proposal.proId.toString(),
        NotificationType.PROPOSAL_ACCEPTED,
        "თქვენ დაქირავებული ხართ!",
        `${client?.name || "კლიენტმა"} დაგიქირავათ პროექტზე: "${job.title}"`,
        {
          link: `/my-work`,
          referenceId: job._id.toString(),
          referenceModel: "Job",
          metadata: {
            jobId: job._id.toString(),
            jobTitle: job.title,
            clientName: client?.name,
          },
        },
      );
    } catch (error) {
      console.error("Failed to send hired notification:", error);
    }

    return proposal;
  }

  async rejectProposal(
    proposalId: string,
    clientId: string,
  ): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate("jobId")
      .exec();

    if (!proposal) {
      throw new NotFoundException("Proposal not found");
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების წინადადებებს უარყოფა",
      );
    }

    if (proposal.status === ProposalStatus.REJECTED) {
      throw new ForbiddenException("წინადადება უკვე უარყოფილია");
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException("მიღებული წინადადების უარყოფა შეუძლებელია");
    }

    proposal.status = ProposalStatus.REJECTED;
    proposal.viewedByPro = false; // Mark as unviewed so pro sees the update
    await proposal.save();

    // Send notification to pro that their proposal was rejected
    try {
      const client = await this.userModel
        .findById(clientId)
        .select("name")
        .exec();
      await this.notificationsService.notify(
        proposal.proId.toString(),
        NotificationType.PROPOSAL_REJECTED,
        "შეთავაზება უარყოფილია",
        `${client?.name || "კლიენტმა"} უარყო თქვენი შეთავაზება: "${job.title}"`,
        {
          link: `/my-proposals`,
          referenceId: proposalId,
          referenceModel: "Proposal",
          metadata: {
            jobId: job._id.toString(),
            jobTitle: job.title,
            clientName: client?.name,
          },
        },
      );
    } catch (error) {
      console.error("Failed to send proposal rejected notification:", error);
    }

    return proposal;
  }

  async revertProposalToPending(
    proposalId: string,
    clientId: string,
  ): Promise<Proposal> {
    const proposal = await this.proposalModel
      .findById(proposalId)
      .populate("jobId")
      .exec();

    if (!proposal) {
      throw new NotFoundException("Proposal not found");
    }

    const job = proposal.jobId as any;
    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "You can only manage proposals for your own jobs",
      );
    }

    if (proposal.status === ProposalStatus.PENDING) {
      throw new ForbiddenException("Proposal is already pending");
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException("Cannot revert an accepted proposal");
    }

    if (proposal.status === ProposalStatus.WITHDRAWN) {
      throw new ForbiddenException("Cannot revert a withdrawn proposal");
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
      throw new NotFoundException("Proposal not found");
    }

    if (proposal.proId.toString() !== proId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი წინადადებების გაუქმებას გაეცნოთ",
      );
    }

    if (proposal.status === ProposalStatus.WITHDRAWN) {
      throw new ForbiddenException("წინადადება უკვე გაუქმდა");
    }

    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException("წინადადება უკვე მიღებულია");
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
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
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
      .select("jobId")
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
      .select("_id")
      .lean()
      .exec();

    const jobIds = jobs.map((j) => j._id);

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
  async markProposalsAsViewedByClient(
    jobId: string,
    clientId: string,
  ): Promise<void> {
    const job = await this.jobModel.findById(jobId);

    if (!job || job.clientId.toString() !== clientId) {
      return; // Silently return if not authorized
    }

    await this.proposalModel.updateMany(
      { jobId: new Types.ObjectId(jobId), viewedByClient: false },
      { viewedByClient: true },
    );
  }

  // Mark proposal updates as viewed by pro (when they view their proposals)
  async markProposalUpdatesAsViewedByPro(proId: string): Promise<void> {
    await this.proposalModel.updateMany(
      {
        proId: new Types.ObjectId(proId),
        viewedByPro: false,
        status: { $in: [ProposalStatus.ACCEPTED, ProposalStatus.REJECTED] },
      },
      { viewedByPro: true },
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
    },
  ): Promise<Job> {
    const job = await this.jobModel.findById(jobId);

    if (!job) {
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების დასრულება",
      );
    }

    if (job.status === JobStatus.COMPLETED) {
      throw new ForbiddenException("სამუშაო უკვე დასრულებულია");
    }

    // Find the accepted proposal to get the pro's ID
    const acceptedProposal = await this.proposalModel.findOne({
      jobId: new Types.ObjectId(jobId),
      status: ProposalStatus.ACCEPTED,
    });

    if (!acceptedProposal) {
      throw new ForbiddenException("ვერ მოიძებნა მიღებული წინადადება");
    }

    // Update job status to completed
    await this.jobModel.findByIdAndUpdate(jobId, {
      status: JobStatus.COMPLETED,
    });

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
        completionData.afterImages.length,
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
      source: "homico" as const,
      jobId: jobId,
    };

    // Add to pro's portfolioProjects
    await this.userModel.findByIdAndUpdate(proId, {
      $push: { portfolioProjects: portfolioProject },
      $inc: { completedJobs: 1 },
    });

    return this.jobModel.findById(jobId).exec();
  }

  // Renew an expired job - extends for another 30 days
  async renewJob(jobId: string, clientId: string): Promise<Job> {
    const job = await this.jobModel.findById(jobId);

    if (!job) {
      throw new NotFoundException("სამუშაო ვერ მოიძებნა");
    }

    if (job.clientId.toString() !== clientId) {
      throw new ForbiddenException(
        "თქვენ შეგიძლიათ მხოლოდ თქვენი სამუშაოების განახლება",
      );
    }

    if (job.status !== JobStatus.EXPIRED) {
      throw new ForbiddenException(
        "მხოლოდ ვადაგასული სამუშაოების განახლება შეიძლება",
      );
    }

    // Set new expiration date to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    return this.jobModel
      .findByIdAndUpdate(
        jobId,
        {
          status: JobStatus.OPEN,
          expiresAt,
        },
        { new: true },
      )
      .exec();
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
      },
    );

    return result.modifiedCount;
  }

  // Get list of already invited pros for a job
  async getInvitedPros(
    jobId: string,
    userId: string,
  ): Promise<{ id: string }[]> {
    const job = await this.jobModel
      .findById(jobId)
      .select("clientId invitedPros")
      .exec();

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    // Only job owner can see invited pros
    if (job.clientId.toString() !== userId) {
      throw new ForbiddenException(
        "Only job owner can view invited professionals",
      );
    }

    const invitedPros = job.invitedPros || [];
    return invitedPros.map((proId) => ({ id: proId.toString() }));
  }

  // Invite professionals to a job
  async invitePros(
    jobId: string,
    userId: string,
    proIds: string[],
  ): Promise<{ success: boolean; invitedCount: number }> {
    const job = await this.jobModel.findById(jobId).exec();

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    // Only job owner can invite pros
    if (job.clientId.toString() !== userId) {
      throw new ForbiddenException("Only job owner can invite professionals");
    }

    // Get existing invited pros to avoid duplicates
    const existingInvitedIds = new Set(
      (job.invitedPros || []).map((id) => id.toString()),
    );

    // Filter out already invited pros
    const newProIds = proIds.filter((id) => !existingInvitedIds.has(id));

    if (newProIds.length === 0) {
      return { success: true, invitedCount: 0 };
    }

    // Get inviter info for notification + role-based limits
    const client = await this.userModel
      .findById(userId)
      .select("name avatar role")
      .exec();

    // Monthly limit: PRO users can invite at most 5 pros per month (start-of-month window)
    if (client?.role === UserRole.PRO) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const sentThisMonth =
        await this.notificationsService.countJobInvitationsSentByUser(
          userId,
          startOfMonth,
        );

      const MAX_INVITES_PER_MONTH = 5;
      if (sentThisMonth + newProIds.length > MAX_INVITES_PER_MONTH) {
        const remaining = Math.max(0, MAX_INVITES_PER_MONTH - sentThisMonth);
        throw new ForbiddenException(
          `Monthly invite limit reached. You can invite ${MAX_INVITES_PER_MONTH} pros per month. Remaining: ${remaining}`,
        );
      }
    }

    // Get pro users for phone numbers and preferences
    const proUsers = await this.userModel
      .find({ _id: { $in: newProIds.map((id) => new Types.ObjectId(id)) } })
      .select("phone notificationPreferences")
      .exec();

    // Create a map of proId -> user data
    const proUserMap = new Map(
      proUsers.map((u) => [
        u._id.toString(),
        { phone: u.phone, prefs: u.notificationPreferences },
      ]),
    );

    // Add new pros to invitedPros array
    await this.jobModel.findByIdAndUpdate(jobId, {
      $addToSet: {
        invitedPros: { $each: newProIds.map((id) => new Types.ObjectId(id)) },
      },
    });

    // Send notifications to each invited pro (using notify() for real-time push)
    for (const proId of newProIds) {
      // In-app notification
      await this.notificationsService.notify(
        proId,
        NotificationType.JOB_INVITATION,
        "You have been invited to a job",
        `${client?.name || "A client"} has invited you to submit a proposal for "${job.title}"`,
        {
          link: `/jobs/${job._id.toString()}`,
          referenceId: job._id.toString(),
          referenceModel: "Job",
          metadata: {
            jobId: job._id.toString(),
            jobTitle: job.title,
            clientId: userId,
            clientName: client?.name,
            clientAvatar: client?.avatar,
          },
        },
      );

      // SMS notification
      const proData = proUserMap.get(proId);
      if (proData?.phone) {
        // Check if SMS notifications are enabled (default to true if not set)
        const smsEnabled = proData.prefs?.sms?.enabled !== false;
        const smsProposals = proData.prefs?.sms?.proposals !== false;

        if (smsEnabled && smsProposals) {
          const jobUrl = `https://www.homico.ge/jobs/${job._id.toString()}`;

          // Build budget string
          let budgetStr = "";
          if (
            job.budgetType === "fixed" &&
            (job.budgetAmount || job.budgetMin)
          ) {
            budgetStr = `${job.budgetAmount || job.budgetMin}₾`;
          } else if (
            job.budgetType === "range" &&
            job.budgetMin &&
            job.budgetMax
          ) {
            budgetStr = `${job.budgetMin}-${job.budgetMax}₾`;
          } else if (job.budgetType === "per_sqm" && job.pricePerUnit) {
            budgetStr = `${job.pricePerUnit}₾/მ²`;
          }

          // Build SMS message with details
          let smsMessage = `${client?.name || "კლიენტი"} გეპატიჟებათ სამუშაოზე: "${job.title}"`;
          if (job.location) smsMessage += `, ${job.location}`;
          if (budgetStr) smsMessage += `, ${budgetStr}`;
          smsMessage += `. ${jobUrl}`;

          try {
            await this.smsService.sendNotificationSms(
              proData.phone,
              smsMessage,
            );
          } catch (error) {
            console.error(`Failed to send SMS to pro ${proId}:`, error);
          }
        }
      }
    }

    return { success: true, invitedCount: newProIds.length };
  }

  // ============== DIRECT REQUEST METHODS ==============

  async getDirectRequestsForPro(
    proId: string,
    page = 1,
    limit = 10,
  ): Promise<{
    data: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    const proObjectId = new Types.ObjectId(proId);
    const skip = (page - 1) * limit;

    const query = {
      jobType: JobType.DIRECT_REQUEST,
      status: JobStatus.OPEN,
      invitedPros: proObjectId,
      declinedPros: { $ne: proObjectId },
    };

    const [data, total] = await Promise.all([
      this.jobModel
        .find(query)
        .populate("clientId", "name email avatar city accountType companyName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.jobModel.countDocuments(query),
    ]);

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

  async getDirectRequestCountForPro(proId: string): Promise<number> {
    const proObjectId = new Types.ObjectId(proId);
    return this.jobModel.countDocuments({
      jobType: JobType.DIRECT_REQUEST,
      status: JobStatus.OPEN,
      invitedPros: proObjectId,
      declinedPros: { $ne: proObjectId },
    });
  }

  async acceptDirectRequest(jobId: string, proId: string): Promise<Job> {
    const proObjectId = new Types.ObjectId(proId);

    // Atomic update: only succeed if job is still OPEN
    const updatedJob = await this.jobModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(jobId),
          jobType: JobType.DIRECT_REQUEST,
          status: JobStatus.OPEN,
          invitedPros: proObjectId,
        },
        {
          status: JobStatus.IN_PROGRESS,
          hiredProId: proObjectId,
        },
        { new: true },
      )
      .exec();

    if (!updatedJob) {
      throw new NotFoundException(
        "Request not found, already accepted, or you are not invited",
      );
    }

    // Create project tracking record
    const now = new Date();
    await this.projectTrackingModel.create({
      jobId: new Types.ObjectId(jobId),
      clientId: updatedJob.clientId,
      proId: proObjectId,
      currentStage: ProjectStage.HIRED,
      progress: 0,
      hiredAt: now,
      agreedPrice: updatedJob.budgetAmount,
      stageHistory: [{ stage: ProjectStage.HIRED, enteredAt: now }],
    });

    // Notify client
    try {
      const pro = await this.userModel.findById(proId).select("name").exec();
      await this.notificationsService.notify(
        updatedJob.clientId.toString(),
        NotificationType.PROPOSAL_ACCEPTED,
        "მოთხოვნა მიღებულია!",
        `${pro?.name || "სპეციალისტმა"} მიიღო თქვენი მოთხოვნა: "${updatedJob.title}"`,
        {
          link: `/my-jobs/${jobId}`,
          referenceId: jobId,
          referenceModel: "Job",
          metadata: {
            jobId,
            jobTitle: updatedJob.title,
            proName: pro?.name,
          },
        },
      );
    } catch (error) {
      console.error(
        "Failed to send direct request accepted notification:",
        error,
      );
    }

    // Notify other invited pros that this request has been taken
    try {
      const declinedSet = new Set(
        (updatedJob.declinedPros || []).map((id) => id.toString()),
      );
      const otherProIds = (updatedJob.invitedPros || [])
        .map((id) => id.toString())
        .filter((id) => id !== proId && !declinedSet.has(id));

      if (otherProIds.length > 0) {
        const pro = await this.userModel.findById(proId).select("name").exec();
        await this.notificationsService.notifyMany(
          otherProIds,
          NotificationType.DIRECT_REQUEST_TAKEN,
          "მოთხოვნა უკვე მიღებულია",
          `მოთხოვნა "${updatedJob.title}" მიიღო სხვა სპეციალისტმა`,
          {
            referenceId: jobId,
            referenceModel: "Job",
            metadata: {
              jobId,
              jobTitle: updatedJob.title,
              acceptedByName: pro?.name,
            },
          },
        );
      }
    } catch (error) {
      console.error("Failed to notify other pros about taken request:", error);
    }

    return updatedJob;
  }

  async declineDirectRequest(
    jobId: string,
    proId: string,
  ): Promise<{ declined: boolean; allDeclined: boolean }> {
    const proObjectId = new Types.ObjectId(proId);
    const jobObjectId = new Types.ObjectId(jobId);

    const job = await this.jobModel
      .findOne({
        _id: jobObjectId,
        jobType: JobType.DIRECT_REQUEST,
        status: JobStatus.OPEN,
        invitedPros: proObjectId,
      })
      .exec();

    if (!job) {
      throw new NotFoundException("Request not found or you are not invited");
    }

    // Add to declinedPros
    await this.jobModel.findByIdAndUpdate(jobId, {
      $addToSet: { declinedPros: proObjectId },
    });

    // Check if ALL invited pros have now declined
    const updatedJob = await this.jobModel.findById(jobId).exec();
    const invitedCount = updatedJob.invitedPros?.length || 0;
    const declinedCount = updatedJob.declinedPros?.length || 0;
    const allDeclined = declinedCount >= invitedCount;

    if (allDeclined) {
      // Notify client that all pros declined
      try {
        await this.notificationsService.notify(
          job.clientId.toString(),
          NotificationType.PROPOSAL_REJECTED,
          "ყველა სპეციალისტმა უარყო",
          `ყველა მოწვეულმა სპეციალისტმა უარყო თქვენი მოთხოვნა: "${job.title}"`,
          {
            link: `/my-jobs/${jobId}`,
            referenceId: jobId,
            referenceModel: "Job",
            metadata: { jobId, jobTitle: job.title },
          },
        );
      } catch (error) {
        console.error("Failed to send all-declined notification:", error);
      }
    }

    return { declined: true, allDeclined };
  }

  async cancelJob(jobId: string, clientId: string): Promise<Job> {
    const job = await this.jobModel.findOne({
      _id: new Types.ObjectId(jobId),
      clientId: new Types.ObjectId(clientId),
    });

    if (!job) {
      throw new NotFoundException("Job not found");
    }

    if (
      [JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.EXPIRED].includes(
        job.status as JobStatus,
      )
    ) {
      throw new BadRequestException("This order cannot be cancelled");
    }

    if (job.status === JobStatus.IN_PROGRESS) {
      const project = await this.projectTrackingModel.findOne({
        jobId: new Types.ObjectId(jobId),
      });
      if (project) {
        const nonCancellableStages = [
          ProjectStage.EN_ROUTE,
          ProjectStage.STARTED,
          ProjectStage.IN_PROGRESS,
          ProjectStage.REVIEW,
          ProjectStage.COMPLETED,
        ];
        if (nonCancellableStages.includes(project.currentStage)) {
          throw new BadRequestException(
            "Cannot cancel — professional is already on the way",
          );
        }
      }
    }

    job.status = JobStatus.CANCELLED;
    const savedJob = await job.save();

    // Notify hired pro about cancellation
    if (job.hiredProId) {
      try {
        const client = await this.userModel
          .findById(clientId)
          .select("name")
          .exec();
        await this.notificationsService.notify(
          job.hiredProId.toString(),
          NotificationType.JOB_CANCELLED,
          "შეკვეთა გაუქმდა",
          `${client?.name || "კლიენტმა"} გააუქმა შეკვეთა: "${job.title}"`,
          {
            link: `/my-jobs/${jobId}`,
            referenceId: jobId,
            referenceModel: "Job",
          },
        );
      } catch (error) {
        console.error("Failed to send cancellation notification:", error);
      }
    }

    return savedJob;
  }
}
