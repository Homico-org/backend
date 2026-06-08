import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { Job } from "../jobs/schemas/job.schema";
import { Proposal } from "../jobs/schemas/proposal.schema";
import { Notification } from "../notifications/schemas/notification.schema";
import { SupportTicket } from "../support/schemas/support-ticket.schema";
import { User, UserRole } from "../users/schemas/user.schema";
import { UsersService } from "../users/users.service";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { InviteToken } from "../invite/schemas/invite-token.schema";
import { SmsService } from "../verification/services/sms.service";
import { AdminCreateUserDto } from "./dto/admin-create-user.dto";
import { resolveUserLocale, type SupportedLocale } from "../common/countries";

// Localized SMS bodies for admin-initiated transactions. Keys mirror
// the message-type identifier we'd use if these moved to an i18n
// catalog later. English serves as the fallback for unsupported
// locales rather than blank text.
const ADMIN_SMS_COPY: Record<string, Record<SupportedLocale, string>> = {
  proApproved: {
    en: "Congrats! Your Homico profile is approved. Clients can now find you. homico.co",
    ka: "გილოცავთ! თქვენი Homico პროფილი დადასტურებულია. ახლა კლიენტებს შეუძლიათ თქვენი ნახვა. homico.co",
    ru: "Поздравляем! Ваш профиль Homico одобрен. Клиенты теперь могут вас найти. homico.co",
  },
  proRejected: {
    en: "Your Homico profile needs updates. Please check the in-app notifications. homico.co",
    ka: "თქვენი Homico პროფილი საჭიროებს განახლებას. გთხოვთ შეამოწმოთ შეტყობინებები აპლიკაციაში. homico.co",
    ru: "Ваш профиль Homico требует обновления. Пожалуйста, проверьте уведомления в приложении. homico.co",
  },
  statusVerified: {
    en: "Congrats! Your Homico profile is approved. homico.co",
    ka: "გილოცავთ! თქვენი Homico პროფილი დადასტურებულია. homico.co",
    ru: "Поздравляем! Ваш профиль Homico одобрен. homico.co",
  },
  statusRejected: {
    en: "Your Homico profile needs updates. Please check the notifications. homico.co",
    ka: "თქვენი Homico პროფილი საჭიროებს განახლებას. შეამოწმეთ შეტყობინებები. homico.co",
    ru: "Ваш профиль Homico требует обновления. Проверьте уведомления. homico.co",
  },
};

interface PaginationOptions {
  page: number;
  limit: number;
  search?: string;
}

interface UserListOptions extends PaginationOptions {
  role?: string;
}

interface JobListOptions extends PaginationOptions {
  status?: string;
}

interface ReportListOptions extends PaginationOptions {
  status?: string;
  type?: string;
}

interface PendingProsOptions extends PaginationOptions {
  status?: "pending" | "approved" | "rejected" | "all";
}

interface InviteListOptions extends PaginationOptions {
  status?: string;
  type?: string;
  category?: string;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicket>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(InviteToken.name)
    private inviteTokenModel: Model<InviteToken>,
    private readonly smsService: SmsService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Admin-initiated user creation. Delegates the heavy lifting (uniqueness
   * checks, password hashing, UID generation, portfolio side effects) to
   * UsersService.create() so we stay consistent with self-registration.
   *
   * After creation, marks email + phone verified and the profile completed,
   * because an admin creating an account vouches for it - we don't want the
   * user stuck behind OTP on first login. These flags live on the User
   * schema but aren't accepted by CreateUserDto, so we set them in a
   * follow-up updateOne rather than smuggling them through as casts.
   */
  async createUser(dto: AdminCreateUserDto): Promise<User> {
    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        "Either email or phone is required to create a user",
      );
    }

    // Normalize phone by stripping spaces/dashes the admin may have pasted.
    const phone = dto.phone?.replace(/[\s-]/g, "");

    const payload: CreateUserDto = {
      name: dto.name.trim(),
      email: dto.email?.toLowerCase().trim(),
      phone,
      password: dto.password,
      role: dto.role,
      city: dto.city?.trim(),
      isPhoneVerified: Boolean(phone),
    };

    const created = await this.usersService.create(payload);

    // Flip the verification / profile-complete flags the DTO doesn't expose.
    // For admin-created accounts these are appropriate defaults: the admin
    // vouched for the identity at create time.
    await this.userModel
      .updateOne(
        { _id: created._id },
        {
          $set: {
            isEmailVerified: Boolean(dto.email),
            isProfileCompleted: true,
            ...(dto.role === UserRole.PRO
              ? { verificationStatus: "verified" }
              : {}),
          },
        },
      )
      .exec();

    this.logger.log(
      `Admin created user uid=${created.uid} role=${dto.role} email=${dto.email ?? "-"} phone=${phone ?? "-"}`,
    );
    return created;
  }

  /**
   * Available role values for the admin UI's role selector. Exposed so the
   * frontend doesn't have to duplicate the enum.
   */
  getAvailableRoles(): UserRole[] {
    return [UserRole.CLIENT, UserRole.PRO, UserRole.ADMIN];
  }

  // ============== PAGINATED LIST METHODS ==============

  async getAllUsers(options: UserListOptions) {
    const { page, limit, search, role } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<User> = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (role && role !== "all") {
      query.role = role;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "name email phone role avatar city isActive createdAt lastLoginAt verificationStatus",
        )
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    // Transform users for frontend compatibility
    const transformedUsers = users.map((user: any) => ({
      ...user,
      isVerified: user.verificationStatus === "verified",
      isSuspended: !user.isActive,
      location: user.city,
    }));

    return {
      users: transformedUsers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllJobs(options: JobListOptions) {
    const { page, limit, search, status } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<Job> = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "all") {
      query.status = status;
    }

    const [jobs, total] = await Promise.all([
      this.jobModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("clientId", "name email avatar")
        .select(
          "title description category subcategory status budgetAmount budgetType location proposalCount createdAt",
        )
        .lean(),
      this.jobModel.countDocuments(query),
    ]);

    // Transform budget for frontend compatibility
    const transformedJobs = jobs.map((job: any) => ({
      ...job,
      budget: {
        min: job.budgetAmount,
        max: job.budgetAmount,
        type: job.budgetType,
      },
    }));

    return {
      jobs: transformedJobs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllReports(options: ReportListOptions) {
    // Since we don't have a dedicated Report model, we'll use support tickets as reports
    // In the future, a separate Report model can be created
    const { page, limit, search, status, type } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<SupportTicket> = {};

    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "all") {
      // Map report status to ticket status
      const statusMap: Record<string, string> = {
        pending: "open",
        investigating: "in_progress",
        resolved: "resolved",
        dismissed: "closed",
      };
      query.status = statusMap[status] || status;
    }

    if (type && type !== "all") {
      query.category = type;
    }

    const [tickets, total] = await Promise.all([
      this.ticketModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email avatar")
        .lean(),
      this.ticketModel.countDocuments(query),
    ]);

    // Transform tickets to report format for frontend
    const reports = tickets.map((ticket: any) => ({
      _id: ticket._id,
      type: ticket.category || "user",
      reason: ticket.subject,
      description: ticket.messages?.[0]?.content || "",
      status: this.mapTicketStatusToReportStatus(ticket.status),
      priority: ticket.priority || "medium",
      reporterId: ticket.userId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    }));

    return {
      reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapTicketStatusToReportStatus(ticketStatus: string): string {
    const statusMap: Record<string, string> = {
      open: "pending",
      in_progress: "investigating",
      resolved: "resolved",
      closed: "dismissed",
    };
    return statusMap[ticketStatus] || "pending";
  }

  async getReportStats() {
    const [total, open, inProgress, resolved, closed] = await Promise.all([
      this.ticketModel.countDocuments(),
      this.ticketModel.countDocuments({ status: "open" }),
      this.ticketModel.countDocuments({ status: "in_progress" }),
      this.ticketModel.countDocuments({ status: "resolved" }),
      this.ticketModel.countDocuments({ status: "closed" }),
    ]);

    // Count high priority as "urgent"
    const urgent = await this.ticketModel.countDocuments({ priority: "high" });

    return {
      total,
      pending: open,
      investigating: inProgress,
      resolved,
      dismissed: closed,
      urgent,
    };
  }

  // ============== DASHBOARD STATS ==============

  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // User stats
    const [
      totalUsers,
      totalClients,
      totalPros,
      totalCompanies,
      totalAdmins,
      usersToday,
      usersThisWeek,
      usersThisMonth,
      usersLastMonth,
      verifiedPros,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ role: "client" }),
      this.userModel.countDocuments({ role: "pro" }),
      this.userModel.countDocuments({ role: "company" }),
      this.userModel.countDocuments({ role: "admin" }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfToday } }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.userModel.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
      // "Verified pros" = professionals with verified status
      this.userModel.countDocuments({
        role: "pro",
        verificationStatus: "verified",
      }),
    ]);

    // Job stats
    const [
      totalJobs,
      openJobs,
      inProgressJobs,
      completedJobs,
      cancelledJobs,
      jobsToday,
      jobsThisWeek,
      jobsThisMonth,
      jobsLastMonth,
    ] = await Promise.all([
      this.jobModel.countDocuments(),
      this.jobModel.countDocuments({ status: "open" }),
      this.jobModel.countDocuments({ status: "in_progress" }),
      this.jobModel.countDocuments({ status: "completed" }),
      this.jobModel.countDocuments({ status: "cancelled" }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfToday } }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.jobModel.countDocuments({
        createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      }),
    ]);

    // Proposal stats
    const [
      totalProposals,
      pendingProposals,
      acceptedProposals,
      rejectedProposals,
      proposalsToday,
      proposalsThisWeek,
      proposalsThisMonth,
    ] = await Promise.all([
      this.proposalModel.countDocuments(),
      this.proposalModel.countDocuments({ status: "pending" }),
      this.proposalModel.countDocuments({ status: "accepted" }),
      this.proposalModel.countDocuments({ status: "rejected" }),
      this.proposalModel.countDocuments({ createdAt: { $gte: startOfToday } }),
      this.proposalModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.proposalModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
    ]);

    // Support ticket stats
    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      unreadTickets,
    ] = await Promise.all([
      this.ticketModel.countDocuments(),
      this.ticketModel.countDocuments({ status: "open" }),
      this.ticketModel.countDocuments({ status: "in_progress" }),
      this.ticketModel.countDocuments({ status: "resolved" }),
      this.ticketModel.countDocuments({ hasUnreadUserMessages: true }),
    ]);

    // Calculate growth percentages
    const userGrowth =
      usersLastMonth > 0
        ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
        : usersThisMonth > 0
          ? 100
          : 0;

    const jobGrowth =
      jobsLastMonth > 0
        ? Math.round(((jobsThisMonth - jobsLastMonth) / jobsLastMonth) * 100)
        : jobsThisMonth > 0
          ? 100
          : 0;

    // Calculate acceptance rate
    const acceptanceRate =
      totalProposals > 0
        ? Math.round((acceptedProposals / totalProposals) * 100)
        : 0;

    return {
      users: {
        total: totalUsers,
        clients: totalClients,
        pros: totalPros,
        companies: totalCompanies,
        admins: totalAdmins,
        verifiedPros,
        today: usersToday,
        thisWeek: usersThisWeek,
        thisMonth: usersThisMonth,
        lastMonth: usersLastMonth,
        growth: userGrowth,
      },
      jobs: {
        total: totalJobs,
        open: openJobs,
        inProgress: inProgressJobs,
        completed: completedJobs,
        cancelled: cancelledJobs,
        today: jobsToday,
        thisWeek: jobsThisWeek,
        thisMonth: jobsThisMonth,
        lastMonth: jobsLastMonth,
        growth: jobGrowth,
      },
      proposals: {
        total: totalProposals,
        pending: pendingProposals,
        accepted: acceptedProposals,
        rejected: rejectedProposals,
        today: proposalsToday,
        thisWeek: proposalsThisWeek,
        thisMonth: proposalsThisMonth,
        acceptanceRate,
      },
      support: {
        total: totalTickets,
        open: openTickets,
        inProgress: inProgressTickets,
        resolved: resolvedTickets,
        unread: unreadTickets,
      },
    };
  }

  async getRecentUsers(limit: number = 10) {
    return this.userModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("name email role avatar createdAt accountType companyName")
      .lean();
  }

  async getRecentJobs(limit: number = 10) {
    return (
      this.jobModel
        .find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("clientId", "name email avatar")
        // Explicitly include _id so admin UI can link to /jobs/:id reliably
        .select(
          "_id title category location status budgetAmount budgetType createdAt proposalCount",
        )
        .lean()
    );
  }

  async getRecentProposals(limit: number = 10) {
    return this.proposalModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("proId", "name email avatar")
      .populate("jobId", "title category")
      .select("status proposedPrice createdAt")
      .lean();
  }

  async getActivityTimeline(limit: number = 20) {
    const [recentUsers, recentJobs, recentProposals, recentTickets] =
      await Promise.all([
        this.userModel
          .find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .select("_id uid name role createdAt")
          .lean(),
        this.jobModel
          .find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate("clientId", "name")
          .select("_id title category status createdAt")
          .lean(),
        this.proposalModel
          .find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate("proId", "name")
          .populate("jobId", "title category")
          .select("_id status createdAt")
          .lean(),
        this.ticketModel
          .find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate("userId", "name")
          .select("_id subject status createdAt")
          .lean(),
      ]);

    // Combine and sort by date
    const activities = [
      ...recentUsers.map((u) => ({
        type: "user_signup",
        data: u,
        date: (u as any).createdAt,
      })),
      ...recentJobs.map((j) => ({
        type: "job_created",
        data: j,
        date: (j as any).createdAt,
      })),
      ...recentProposals.map((p) => ({
        type: "proposal_sent",
        data: p,
        date: (p as any).createdAt,
      })),
      ...recentTickets.map((t) => ({
        type: "ticket_created",
        data: t,
        date: (t as any).createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    return activities;
  }

  async getJobsByCategory() {
    return this.jobModel.aggregate([
      { $match: { category: { $type: "string", $ne: "" } } },
      {
        $addFields: {
          displayCategory: {
            $cond: {
              if: {
                $and: [
                  { $ne: ["$subcategory", null] },
                  { $ne: ["$subcategory", ""] },
                ],
              },
              then: { $toLower: "$subcategory" },
              else: { $toLower: "$category" },
            },
          },
        },
      },
      { $group: { _id: "$displayCategory", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  async getJobsByLocation() {
    return this.jobModel.aggregate([
      {
        $match: {
          location: { $type: "string", $ne: "" },
        },
      },
      {
        $addFields: {
          normalizedLocation: { $trim: { input: "$location" } },
        },
      },
      { $match: { normalizedLocation: { $ne: "" } } },
      { $group: { _id: "$normalizedLocation", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  async getUsersByRole() {
    return this.userModel.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
    ]);
  }

  async getDailySignups(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.userModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async getDailyJobs(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.jobModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async getDailyProposals(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.proposalModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  /**
   * Marketplace liquidity funnel for the jobs flow, over the last `days` of
   * POSTED jobs (cohort = jobs created in the window). Reports the count at
   * each funnel stage plus the conversion rates between them:
   *
   *   posted -> first proposal in 24h (liquidity vital sign)
   *          -> any proposal
   *          -> hired (a proposal accepted; Job.hiredProId set)
   *          -> completed (Job.status = completed)
   *          -> reviewed (a homico review references the job)
   *
   * Built on the real collections via $lookup (proposals/reviews) rather than
   * fired-event counts, so the percentages are true per-job rates. Scoped to
   * `jobType: marketplace` because direct_request jobs skip the proposal stage.
   */
  async getFunnel(days = 30, country?: string) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const match: Record<string, unknown> = {
      jobType: 'marketplace',
      createdAt: { $gte: startDate },
    };
    if (country) match.country = country.toUpperCase();

    const DAY_MS = 24 * 60 * 60 * 1000;
    const rows = await this.jobModel.aggregate([
      { $match: match },
      // Earliest proposal time + total proposal count per job. `jobId` may be
      // stored as a string OR an ObjectId in this collection, so compare on
      // the string form of both sides.
      {
        $lookup: {
          from: 'proposals',
          let: { jid: { $toString: '$_id' } },
          pipeline: [
            { $match: { $expr: { $eq: [{ $toString: '$jobId' }, '$$jid'] } } },
            {
              $group: {
                _id: null,
                first: { $min: '$createdAt' },
                count: { $sum: 1 },
              },
            },
          ],
          as: 'prop',
        },
      },
      // Any homico review referencing this job (jobId may be string/ObjectId).
      {
        $lookup: {
          from: 'reviews',
          let: { jid: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [{ $toString: '$jobId' }, '$$jid'] },
                    { $eq: ['$source', 'homico'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'rev',
        },
      },
      {
        $project: {
          createdAt: 1,
          hired: { $cond: [{ $ifNull: ['$hiredProId', false] }, 1, 0] },
          completed: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          reviewed: { $cond: [{ $gt: [{ $size: '$rev' }, 0] }, 1, 0] },
          propCount: { $ifNull: [{ $arrayElemAt: ['$prop.count', 0] }, 0] },
          firstProposalAt: { $arrayElemAt: ['$prop.first', 0] },
        },
      },
      {
        $project: {
          hired: 1,
          completed: 1,
          reviewed: 1,
          hasProposal: { $cond: [{ $gt: ['$propCount', 0] }, 1, 0] },
          ttfpMs: {
            $cond: [
              { $ifNull: ['$firstProposalAt', false] },
              { $subtract: ['$firstProposalAt', '$createdAt'] },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          jobsPosted: { $sum: 1 },
          withProposal: { $sum: '$hasProposal' },
          firstProposalIn24h: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$ttfpMs', null] },
                    { $lte: ['$ttfpMs', DAY_MS] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          hired: { $sum: '$hired' },
          completed: { $sum: '$completed' },
          reviewed: { $sum: '$reviewed' },
          avgTtfpMs: { $avg: '$ttfpMs' },
        },
      },
    ]);

    const r = (rows[0] as Record<string, number> | undefined) ?? {
      jobsPosted: 0,
      withProposal: 0,
      firstProposalIn24h: 0,
      hired: 0,
      completed: 0,
      reviewed: 0,
      avgTtfpMs: 0,
    };
    const pct = (n: number, d: number) =>
      d > 0 ? Math.round((n / d) * 1000) / 10 : 0;

    return {
      days,
      country: country ? country.toUpperCase() : 'all',
      counts: {
        jobsPosted: r.jobsPosted,
        withProposal: r.withProposal,
        firstProposalIn24h: r.firstProposalIn24h,
        hired: r.hired,
        completed: r.completed,
        reviewed: r.reviewed,
      },
      rates: {
        // Liquidity vital sign: did supply respond fast?
        proposalIn24hRate: pct(r.firstProposalIn24h, r.jobsPosted),
        anyProposalRate: pct(r.withProposal, r.jobsPosted),
        hireRate: pct(r.hired, r.jobsPosted),
        completionRate: pct(r.completed, r.hired),
        reviewRate: pct(r.reviewed, r.completed),
      },
      avgHoursToFirstProposal:
        r.avgTtfpMs != null && r.avgTtfpMs > 0
          ? Math.round((r.avgTtfpMs / (60 * 60 * 1000)) * 10) / 10
          : null,
    };
  }

  // ============== PENDING PROFESSIONALS MANAGEMENT ==============

  async getPendingPros(options: PendingProsOptions) {
    const { page, limit, search, status = "pending" } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<User> = {
      role: "pro",
    };

    // Filter by verification status
    if (status === "pending") {
      query.verificationStatus = { $nin: ["verified", "rejected"] };
    } else if (status === "approved") {
      query.verificationStatus = "verified";
    } else if (status === "rejected") {
      query.verificationStatus = "rejected";
    }

    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
          { city: { $regex: search, $options: "i" } },
        ],
      });
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select(
          "_id uid name email phone role avatar city bio categories subcategories selectedCategories selectedSubcategories selectedServices basePrice maxPrice pricingModel yearsExperience isProfileCompleted verificationStatus adminRejectionReason createdAt portfolioProjects",
        )
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPendingProsStats() {
    const [pending, approved, rejected, total] = await Promise.all([
      // Pending: not verified and not rejected
      this.userModel.countDocuments({
        role: "pro",
        verificationStatus: { $nin: ["verified", "rejected"] },
      }),
      // Approved: verificationStatus is verified
      this.userModel.countDocuments({
        role: "pro",
        verificationStatus: "verified",
      }),
      // Rejected: verificationStatus is rejected
      this.userModel.countDocuments({
        role: "pro",
        verificationStatus: "rejected",
      }),
      this.userModel.countDocuments({ role: "pro" }),
    ]);

    return { pending, approved, rejected, total };
  }

  async approvePro(proId: string, adminId: string): Promise<User> {
    const user = await this.userModel.findById(proId);
    if (!user) {
      throw new Error("Professional not found");
    }
    if (user.role !== "pro") {
      throw new Error("User is not a professional");
    }

    user.verificationStatus = "verified";
    user.isProfileCompleted = true; // Admin approval means profile is complete
    user.adminApprovedAt = new Date();
    user.adminApprovedBy = adminId;
    user.adminRejectionReason = undefined;

    await user.save();

    // Create notification for the pro. Stores English fallback copy
    // and i18n keys; the bell-icon feed resolves `t(titleKey, params)`
    // at view time so the same notification reads as Georgian or
    // Russian for users on those locales.
    await this.notificationModel.create({
      userId: proId,
      type: "profile_approved",
      title: "Profile Approved",
      message:
        "Your professional profile has been approved! You are now visible to clients.",
      titleKey: "notifications.types.profile_approved.title",
      messageKey: "notifications.types.profile_approved.message",
      isRead: false,
      createdAt: new Date(),
    });

    // Send SMS notification if user has a phone number
    if (user.phone) {
      const locale = resolveUserLocale(user);
      await this.smsService.sendNotificationSms(
        user.phone,
        ADMIN_SMS_COPY.proApproved[locale],
      );
    }

    return user;
  }

  async rejectPro(
    proId: string,
    adminId: string,
    reason: string,
  ): Promise<User> {
    const user = await this.userModel.findById(proId);
    if (!user) {
      throw new Error("Professional not found");
    }
    if (user.role !== "pro") {
      throw new Error("User is not a professional");
    }

    user.verificationStatus = "rejected";
    user.adminRejectionReason = reason;

    await user.save();

    // Create notification for the pro. The reason is interpolated
    // into both the EN fallback and the localized message via
    // `{reason}` so admins can include any free-text rejection note.
    await this.notificationModel.create({
      userId: proId,
      type: "profile_rejected",
      title: "Profile Needs Updates",
      message: `Your profile was not approved. Reason: ${reason}`,
      titleKey: "notifications.types.profile_rejected.title",
      messageKey: "notifications.types.profile_rejected.message",
      i18nParams: { reason },
      isRead: false,
      createdAt: new Date(),
    });

    // Send SMS notification if user has a phone number
    if (user.phone) {
      const locale = resolveUserLocale(user);
      await this.smsService.sendNotificationSms(
        user.phone,
        ADMIN_SMS_COPY.proRejected[locale],
      );
    }

    return user;
  }

  async updateVerificationStatus(
    proId: string,
    adminId: string,
    status: string,
    notes?: string,
    notifyUser: boolean = true,
  ): Promise<User> {
    console.log(`[Admin] updateVerificationStatus called: proId=${proId}, status=${status}`);

    const validStatuses = ['pending', 'submitted', 'verified', 'rejected'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid verification status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const user = await this.userModel.findById(proId);
    if (!user) {
      console.log(`[Admin] User not found: ${proId}`);
      throw new Error("Professional not found");
    }
    if (user.role !== "pro") {
      console.log(`[Admin] User is not a pro: ${user.role}`);
      throw new Error("User is not a professional");
    }

    const previousStatus = user.verificationStatus;
    console.log(`[Admin] Changing status from ${previousStatus} to ${status}`);
    user.verificationStatus = status;
    user.verificationNotes = notes || undefined;

    // Update related fields based on status
    if (status === 'verified') {
      user.isProfileCompleted = true;
      user.adminApprovedAt = new Date();
      user.adminApprovedBy = adminId;
      user.adminRejectionReason = undefined;
    } else if (status === 'rejected') {
      user.adminRejectionReason = notes;
    }

    await user.save();
    console.log(`[Admin] User saved. New verificationStatus: ${user.verificationStatus}`);

    // Create notification if status changed and notifyUser is true
    if (notifyUser && previousStatus !== status) {
      let notificationType = 'verification_update';
      let title = 'Verification Status Updated';
      let message = notes || `Your verification status has been updated to: ${status}`;
      let titleKey = 'notifications.types.verification_update.title';
      let messageKey = 'notifications.types.verification_update.message';
      const i18nParams: Record<string, string> = { status, notes: notes || '' };

      if (status === 'verified') {
        notificationType = 'profile_approved';
        title = 'Profile Approved';
        message = notes || 'Your professional profile has been approved! You are now visible to clients.';
        titleKey = 'notifications.types.profile_approved.title';
        messageKey = notes ? 'notifications.types.profile_approved.messageWithNote' : 'notifications.types.profile_approved.message';
      } else if (status === 'rejected') {
        notificationType = 'profile_rejected';
        title = 'Profile Needs Updates';
        message = notes || 'Your profile was not approved. Please check the admin notes.';
        titleKey = 'notifications.types.profile_rejected.title';
        messageKey = notes ? 'notifications.types.profile_rejected.messageWithNote' : 'notifications.types.profile_rejected.messageDefault';
      }

      await this.notificationModel.create({
        userId: proId,
        type: notificationType,
        title,
        message,
        titleKey,
        messageKey,
        i18nParams,
        isRead: false,
        createdAt: new Date(),
      });

      // Send SMS notification for significant status changes
      if (user.phone && (status === 'verified' || status === 'rejected')) {
        const locale = resolveUserLocale(user);
        const smsMessage =
          ADMIN_SMS_COPY[status === 'verified' ? 'statusVerified' : 'statusRejected'][locale];
        await this.smsService.sendNotificationSms(user.phone, smsMessage);
      }
    }

    return user;
  }

  // ============== JOB MANAGEMENT ==============

  async getJobById(jobId: string) {
    const job = await this.jobModel
      .findById(jobId)
      .populate("clientId", "name email avatar phone")
      .lean();

    if (!job) {
      throw new Error("Job not found");
    }

    return job;
  }

  async updateJob(jobId: string, updateData: any) {
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Update allowed fields
    const allowedFields = [
      "title",
      "description",
      "category",
      "subcategory",
      "status",
      "budgetAmount",
      "budgetType",
      "location",
      "urgency",
    ];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        (job as any)[field] = updateData[field];
      }
    }

    await job.save();
    return job;
  }

  async deleteJob(jobId: string) {
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Delete related proposals
    await this.proposalModel.deleteMany({ jobId });

    // Delete the job
    await this.jobModel.findByIdAndDelete(jobId);

    return { message: "Job deleted successfully" };
  }

  async getJobProposals(jobId: string) {
    const job = await this.jobModel.findById(jobId);
    if (!job) {
      throw new Error("Job not found");
    }

    // Get proposals - jobId is stored as string in proposals collection
    const proposals = await this.proposalModel
      .find({ jobId: jobId })
      .sort({ createdAt: -1 })
      .lean();

    // Manually populate proId since it's stored as string, not ObjectId
    const proIds = proposals.map((p: any) => p.proId).filter(Boolean);
    const pros = await this.userModel
      .find({ _id: { $in: proIds } })
      .select("name email avatar phone avgRating totalReviews verificationStatus city")
      .lean();

    const proMap = new Map(pros.map((p: any) => [p._id.toString(), p]));

    // Attach pro data to proposals
    const populatedProposals = proposals.map((p: any) => ({
      ...p,
      proId: proMap.get(p.proId) || { name: "Unknown", _id: p.proId },
    }));

    return populatedProposals;
  }

  // ============== INVITE MANAGEMENT ==============

  async getInvites(options: InviteListOptions) {
    const { page, limit, search, status, type, category } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<InviteToken> = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    if (status && status !== "all") {
      query.status = status;
    }

    if (type && type !== "all") {
      query.type = type;
    }

    if (category) {
      query.category = { $regex: category, $options: "i" };
    }

    const [items, total] = await Promise.all([
      this.inviteTokenModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inviteTokenModel.countDocuments(query),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getInviteStats() {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [
      total,
      pending,
      smsSent,
      opened,
      activated,
      typeProfessional,
      typeService,
      typeToolRental,
      todaySent,
      todayOpened,
      todayActivated,
    ] = await Promise.all([
      this.inviteTokenModel.countDocuments(),
      this.inviteTokenModel.countDocuments({ status: "pending" }),
      this.inviteTokenModel.countDocuments({ status: "sms_sent" }),
      this.inviteTokenModel.countDocuments({ status: "opened" }),
      this.inviteTokenModel.countDocuments({ status: "activated" }),
      this.inviteTokenModel.countDocuments({ type: "professional" }),
      this.inviteTokenModel.countDocuments({ type: "service" }),
      this.inviteTokenModel.countDocuments({ type: "tool-rental" }),
      this.inviteTokenModel.countDocuments({ smsSentAt: { $gte: startOfToday } }),
      this.inviteTokenModel.countDocuments({ openedAt: { $gte: startOfToday } }),
      this.inviteTokenModel.countDocuments({ activatedAt: { $gte: startOfToday } }),
    ]);

    const smsSentOrLater = smsSent + opened + activated;
    const conversionRate = total > 0 ? Math.round((activated / total) * 100) : 0;
    const openRate =
      smsSentOrLater > 0
        ? Math.round(((opened + activated) / smsSentOrLater) * 100)
        : 0;

    return {
      total,
      byStatus: { pending, sms_sent: smsSent, opened, activated },
      byType: {
        professional: typeProfessional,
        service: typeService,
        "tool-rental": typeToolRental,
      },
      conversionRate,
      openRate,
      todaySent,
      todayOpened,
      todayActivated,
    };
  }

  async deleteInvite(id: string) {
    const invite = await this.inviteTokenModel.findById(id);
    if (!invite) {
      throw new Error("Invite token not found");
    }
    await this.inviteTokenModel.findByIdAndDelete(id);
    return { message: "Invite deleted successfully" };
  }

  async resendInviteSms(id: string) {
    const invite = await this.inviteTokenModel.findById(id);
    if (!invite) {
      throw new Error("Invite token not found");
    }

    invite.status = "pending";
    invite.smsSentAt = undefined;
    invite.smsFailedAt = undefined;
    invite.smsError = undefined;
    await invite.save();

    return { message: "Invite marked for resend" };
  }

  // ============== MIGRATIONS ==============

  async syncVerificationStatus(): Promise<{
    updated: number;
    users: string[];
  }> {
    // Find all users who have isAdminApproved=true but verificationStatus is not 'verified'
    const usersToUpdate = await this.userModel
      .find({
        isAdminApproved: true,
        verificationStatus: { $ne: "verified" },
      })
      .select("_id name email");

    const userNames = usersToUpdate.map((u) => `${u.name} (${u.email})`);

    // Update all matching users
    const result = await this.userModel.updateMany(
      {
        isAdminApproved: true,
        verificationStatus: { $ne: "verified" },
      },
      {
        $set: { verificationStatus: "verified" },
      },
    );

    return {
      updated: result.modifiedCount,
      users: userNames,
    };
  }
}
