import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Job } from '../jobs/schemas/job.schema';
import { Proposal } from '../jobs/schemas/proposal.schema';
import { SupportTicket } from '../support/schemas/support-ticket.schema';
import { Notification } from '../notifications/schemas/notification.schema';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Proposal.name) private proposalModel: Model<Proposal>,
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicket>,
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
  ) {}

  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
      this.userModel.countDocuments({ role: 'client' }),
      this.userModel.countDocuments({ role: 'pro' }),
      this.userModel.countDocuments({ role: 'company' }),
      this.userModel.countDocuments({ role: 'admin' }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfToday } }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
      this.userModel.countDocuments({ role: 'pro', verificationStatus: 'verified' }),
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
      this.jobModel.countDocuments({ status: 'open' }),
      this.jobModel.countDocuments({ status: 'in_progress' }),
      this.jobModel.countDocuments({ status: 'completed' }),
      this.jobModel.countDocuments({ status: 'cancelled' }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfToday } }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfWeek } }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.jobModel.countDocuments({ createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } }),
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
      this.proposalModel.countDocuments({ status: 'pending' }),
      this.proposalModel.countDocuments({ status: 'accepted' }),
      this.proposalModel.countDocuments({ status: 'rejected' }),
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
      this.ticketModel.countDocuments({ status: 'open' }),
      this.ticketModel.countDocuments({ status: 'in_progress' }),
      this.ticketModel.countDocuments({ status: 'resolved' }),
      this.ticketModel.countDocuments({ hasUnreadUserMessages: true }),
    ]);

    // Calculate growth percentages
    const userGrowth = usersLastMonth > 0
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;

    const jobGrowth = jobsLastMonth > 0
      ? Math.round(((jobsThisMonth - jobsLastMonth) / jobsLastMonth) * 100)
      : jobsThisMonth > 0 ? 100 : 0;

    // Calculate acceptance rate
    const acceptanceRate = totalProposals > 0
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
      .select('name email role avatar createdAt accountType companyName')
      .lean();
  }

  async getRecentJobs(limit: number = 10) {
    return this.jobModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('clientId', 'name email avatar')
      .select('title category location status budgetAmount budgetType createdAt proposalCount')
      .lean();
  }

  async getRecentProposals(limit: number = 10) {
    return this.proposalModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('proId', 'name email avatar')
      .populate('jobId', 'title category')
      .select('status proposedPrice createdAt')
      .lean();
  }

  async getActivityTimeline(limit: number = 20) {
    const [recentUsers, recentJobs, recentProposals, recentTickets] = await Promise.all([
      this.userModel.find().sort({ createdAt: -1 }).limit(limit).select('name role createdAt').lean(),
      this.jobModel.find().sort({ createdAt: -1 }).limit(limit).populate('clientId', 'name').select('title status createdAt').lean(),
      this.proposalModel.find().sort({ createdAt: -1 }).limit(limit).populate('proId', 'name').populate('jobId', 'title').select('status createdAt').lean(),
      this.ticketModel.find().sort({ createdAt: -1 }).limit(limit).populate('userId', 'name').select('subject status createdAt').lean(),
    ]);

    // Combine and sort by date
    const activities = [
      ...recentUsers.map(u => ({ type: 'user_signup', data: u, date: (u as any).createdAt })),
      ...recentJobs.map(j => ({ type: 'job_created', data: j, date: (j as any).createdAt })),
      ...recentProposals.map(p => ({ type: 'proposal_sent', data: p, date: (p as any).createdAt })),
      ...recentTickets.map(t => ({ type: 'ticket_created', data: t, date: (t as any).createdAt })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    return activities;
  }

  async getJobsByCategory() {
    return this.jobModel.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  async getJobsByLocation() {
    return this.jobModel.aggregate([
      { $match: { location: { $exists: true, $ne: '' } } },
      { $group: { _id: '$location', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
  }

  async getUsersByRole() {
    return this.userModel.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]);
  }

  async getDailySignups(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.userModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
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
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
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
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }
}
