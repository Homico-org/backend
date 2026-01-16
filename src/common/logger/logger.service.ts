import { Injectable, LoggerService as NestLoggerService, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ActivityLog } from './schemas/activity-log.schema';

export enum ActivityType {
  // Auth
  USER_REGISTER = 'user.register',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_PASSWORD_RESET = 'user.password_reset',

  // Account
  USER_DELETE = 'user.delete',
  USER_UPDATE = 'user.update',
  USER_UPGRADE_TO_PRO = 'user.upgrade_to_pro',
  USER_VERIFICATION_SUBMIT = 'user.verification_submit',
  USER_VERIFICATION_APPROVED = 'user.verification_approved',
  USER_VERIFICATION_REJECTED = 'user.verification_rejected',

  // Profile
  PROFILE_UPDATE = 'profile.update',
  PROFILE_DEACTIVATE = 'profile.deactivate',
  PROFILE_REACTIVATE = 'profile.reactivate',
  AVATAR_UPLOAD = 'avatar.upload',

  // Jobs
  JOB_CREATE = 'job.create',
  JOB_UPDATE = 'job.update',
  JOB_DELETE = 'job.delete',
  JOB_STATUS_CHANGE = 'job.status_change',

  // Proposals
  PROPOSAL_CREATE = 'proposal.create',
  PROPOSAL_UPDATE = 'proposal.update',
  PROPOSAL_WITHDRAW = 'proposal.withdraw',
  PROPOSAL_ACCEPT = 'proposal.accept',
  PROPOSAL_REJECT = 'proposal.reject',

  // Messages
  CONVERSATION_START = 'conversation.start',
  MESSAGE_SEND = 'message.send',

  // Reviews
  REVIEW_CREATE = 'review.create',
  REVIEW_UPDATE = 'review.update',

  // Portfolio
  PORTFOLIO_ADD = 'portfolio.add',
  PORTFOLIO_UPDATE = 'portfolio.update',
  PORTFOLIO_DELETE = 'portfolio.delete',

  // Admin
  ADMIN_USER_UPDATE = 'admin.user_update',
  ADMIN_USER_DELETE = 'admin.user_delete',
  ADMIN_VERIFICATION_ACTION = 'admin.verification_action',
}

export interface ActivityLogData {
  type: ActivityType;
  userId?: string;
  userEmail?: string;
  userName?: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class LoggerService implements NestLoggerService, OnModuleInit {
  constructor(
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLog>,
  ) {}

  onModuleInit() {
    console.log('[Logger] MongoDB Activity Logger initialized');
  }

  // Standard NestJS logger methods
  log(message: string, context?: string) {
    console.log(`[${context || 'LOG'}] ${message}`);
  }

  error(message: string, trace?: string, context?: string) {
    console.error(`[${context || 'ERROR'}] ${message}`, trace);
  }

  warn(message: string, context?: string) {
    console.warn(`[${context || 'WARN'}] ${message}`);
  }

  debug(message: string, context?: string) {
    console.debug(`[${context || 'DEBUG'}] ${message}`);
  }

  verbose(message: string, context?: string) {
    console.log(`[${context || 'VERBOSE'}] ${message}`);
  }

  // Activity logging - saves to MongoDB
  async logActivity(data: ActivityLogData): Promise<void> {
    try {
      // Save to MongoDB
      await this.activityLogModel.create({
        type: data.type,
        userId: data.userId || 'anonymous',
        userEmail: data.userEmail || 'unknown',
        userName: data.userName || 'unknown',
        targetId: data.targetId,
        targetType: data.targetType,
        details: data.details,
        ip: data.ip,
        userAgent: data.userAgent,
        timestamp: new Date(),
      });

      // Also log to console
      console.log(
        `[ACTIVITY] ${data.type} | User: ${data.userEmail || data.userId || 'anonymous'} | Target: ${data.targetType}:${data.targetId || 'N/A'}`,
      );
    } catch (error) {
      console.error('[ACTIVITY LOG ERROR]', error);
    }
  }

  // Helper for user deletion - captures full user data before delete
  async logUserDeletion(user: any, deletedBy?: string): Promise<void> {
    await this.logActivity({
      type: ActivityType.USER_DELETE,
      userId: user._id?.toString() || user.id,
      userEmail: user.email,
      userName: user.name,
      details: {
        deletedBy: deletedBy || 'self',
        userRole: user.role,
        userPhone: user.phone,
        userCity: user.city,
        accountCreatedAt: user.createdAt,
        wasVerified: user.verificationStatus === 'verified',
        hadCompletedProfile: user.isProfileCompleted,
        // Store full user data for reference
        fullUserSnapshot: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          city: user.city,
          categories: user.categories,
          subcategories: user.subcategories,
          createdAt: user.createdAt,
          avatar: user.avatar,
          title: user.title,
          description: user.description,
        },
      },
    });
  }

  // Query methods for admin panel
  async getActivityLogs(options: {
    type?: string;
    userId?: string;
    userEmail?: string;
    q?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ logs: ActivityLog[]; total: number; page: number; pages: number }> {
    const { type, userId, userEmail, q, startDate, endDate, page = 1, limit = 50 } = options;

    const query: any = {};

    if (type) query.type = type;
    if (userId) query.userId = userId;
    if (userEmail) query.userEmail = { $regex: userEmail, $options: 'i' };
    if (q) {
      const qTrim = q.trim();
      if (qTrim) {
        query.$or = [
          { userEmail: { $regex: qTrim, $options: 'i' } },
          { userName: { $regex: qTrim, $options: 'i' } },
          { userId: { $regex: qTrim, $options: 'i' } },
          { targetId: { $regex: qTrim, $options: 'i' } },
          { targetType: { $regex: qTrim, $options: 'i' } },
          { type: { $regex: qTrim, $options: 'i' } },
        ];
      }
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    const total = await this.activityLogModel.countDocuments(query);
    const pages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    const logs = await this.activityLogModel
      .find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return { logs, total, page, pages };
  }

  // Get activity stats
  async getActivityStats(): Promise<any> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayCount, weekCount, monthCount, byType] = await Promise.all([
      this.activityLogModel.countDocuments({ timestamp: { $gte: today } }),
      this.activityLogModel.countDocuments({ timestamp: { $gte: thisWeek } }),
      this.activityLogModel.countDocuments({ timestamp: { $gte: thisMonth } }),
      this.activityLogModel.aggregate([
        { $match: { timestamp: { $gte: thisMonth } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      today: todayCount,
      thisWeek: weekCount,
      thisMonth: monthCount,
      byType,
    };
  }

  // Get deleted users
  async getDeletedUsers(page = 1, limit = 20): Promise<any> {
    return this.getActivityLogs({
      type: ActivityType.USER_DELETE,
      page,
      limit,
    });
  }
}
