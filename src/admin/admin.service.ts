import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, Model } from "mongoose";
import { Job } from "../jobs/schemas/job.schema";
import { Proposal } from "../jobs/schemas/proposal.schema";
import { Notification } from "../notifications/schemas/notification.schema";
import { SupportTicket } from "../support/schemas/support-ticket.schema";
import { User } from "../users/schemas/user.schema";
import { SmsService } from "../verification/services/sms.service";

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

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicket>,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    private readonly smsService: SmsService,
  ) {}

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
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  async getJobsByLocation() {
    return this.jobModel.aggregate([
      { $match: { location: { $type: "string", $ne: "" } } },
      { $group: { _id: "$location", count: { $sum: 1 } } },
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

    // Create notification for the pro
    await this.notificationModel.create({
      userId: proId,
      type: "profile_approved",
      title: "Profile Approved",
      message:
        "Your professional profile has been approved! You are now visible to clients.",
      isRead: false,
      createdAt: new Date(),
    });

    // Send SMS notification if user has a phone number
    if (user.phone) {
      const smsMessage = `გილოცავთ! თქვენი Homico პროფილი დადასტურებულია. ახლა კლიენტებს შეუძლიათ თქვენი ნახვა. homico.ge`;
      await this.smsService.sendNotificationSms(user.phone, smsMessage);
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

    // Create notification for the pro
    await this.notificationModel.create({
      userId: proId,
      type: "profile_rejected",
      title: "Profile Needs Updates",
      message: `Your profile was not approved. Reason: ${reason}`,
      isRead: false,
      createdAt: new Date(),
    });

    // Send SMS notification if user has a phone number
    if (user.phone) {
      const smsMessage = `თქვენი Homico პროფილი საჭიროებს განახლებას. გთხოვთ შეამოწმოთ შეტყობინებები აპლიკაციაში. homico.ge`;
      await this.smsService.sendNotificationSms(user.phone, smsMessage);
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

      if (status === 'verified') {
        notificationType = 'profile_approved';
        title = 'Profile Approved';
        message = notes || 'Your professional profile has been approved! You are now visible to clients.';
      } else if (status === 'rejected') {
        notificationType = 'profile_rejected';
        title = 'Profile Needs Updates';
        message = notes || 'Your profile was not approved. Please check the admin notes.';
      }

      await this.notificationModel.create({
        userId: proId,
        type: notificationType,
        title,
        message,
        isRead: false,
        createdAt: new Date(),
      });

      // Send SMS notification for significant status changes
      if (user.phone && (status === 'verified' || status === 'rejected')) {
        const smsMessage = status === 'verified'
          ? `გილოცავთ! თქვენი Homico პროფილი დადასტურებულია. homico.ge`
          : `თქვენი Homico პროფილი საჭიროებს განახლებას. შეამოწმეთ შეტყობინებები. homico.ge`;
        await this.smsService.sendNotificationSms(user.phone, smsMessage);
      }
    }

    return user;
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
