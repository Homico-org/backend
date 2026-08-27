import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationType } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';
import { ExpoPushService } from './expo-push.service';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
    private expoPushService: ExpoPushService,
  ) {}

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    const notification = new this.notificationModel({
      ...createNotificationDto,
      userId: new Types.ObjectId(createNotificationDto.userId),
      referenceId: createNotificationDto.referenceId
        ? new Types.ObjectId(createNotificationDto.referenceId)
        : undefined,
    });
    return notification.save();
  }

  async findAllForUser(
    userId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const { limit = 20, offset = 0, unreadOnly = false } = options;

    const query: any = { userId: new Types.ObjectId(userId) };
    if (unreadOnly) {
      query.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .exec(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({
        userId: new Types.ObjectId(userId),
        isRead: false,
      }),
    ]);

    return { notifications, total, unreadCount };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      isRead: false,
    });
  }

  // Exact unread counts folded into the activity-menu categories the header
  // surfaces (tile badges + footer summary). Unlike the frontend's previous
  // best-effort tally over the loaded bell feed, this counts ALL unread docs
  // server-side via aggregation, so paginated feeds don't undercount.
  async getUnreadCountsByCategory(userId: string): Promise<{
    invitations: number;
    newProposals: number;
    proposalReplies: number;
    bookings: number;
    reviews: number;
  }> {
    const rows = await this.notificationModel.aggregate<{
      _id: NotificationType;
      count: number;
    }>([
      { $match: { userId: new Types.ObjectId(userId), isRead: false } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);

    const byType = new Map<string, number>(
      rows.map((r) => [r._id, r.count]),
    );
    const sum = (...types: NotificationType[]) =>
      types.reduce((acc, t) => acc + (byType.get(t) ?? 0), 0);

    return {
      invitations: sum(NotificationType.JOB_INVITATION),
      newProposals: sum(NotificationType.NEW_PROPOSAL),
      proposalReplies: sum(
        NotificationType.PROPOSAL_ACCEPTED,
        NotificationType.PROPOSAL_REJECTED,
      ),
      bookings: sum(
        NotificationType.NEW_BOOKING,
        NotificationType.BOOKING_CONFIRMED,
        NotificationType.BOOKING_STARTED,
        NotificationType.BOOKING_CANCELLED,
        NotificationType.BOOKING_COMPLETED,
      ),
      reviews: sum(
        NotificationType.NEW_REVIEW,
        NotificationType.REVIEW_PROMPT,
      ),
    };
  }

  async markAsRead(userId: string, notificationIds?: string[]): Promise<{ modifiedCount: number }> {
    const query: any = { userId: new Types.ObjectId(userId) };

    if (notificationIds && notificationIds.length > 0) {
      query._id = { $in: notificationIds.map((id) => new Types.ObjectId(id)) };
    }

    const result = await this.notificationModel.updateMany(query, { isRead: true });
    return { modifiedCount: result.modifiedCount };
  }

  async markAllAsRead(userId: string): Promise<{ modifiedCount: number }> {
    const result = await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { isRead: true },
    );
    return { modifiedCount: result.modifiedCount };
  }

  async delete(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.notificationModel.deleteOne({
      _id: new Types.ObjectId(notificationId),
      userId: new Types.ObjectId(userId),
    });
    return result.deletedCount > 0;
  }

  async deleteAll(userId: string): Promise<{ deletedCount: number }> {
    const result = await this.notificationModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });
    return { deletedCount: result.deletedCount };
  }

  // Helper method to create notifications from other services.
  //
  // `title` / `message` are the English fallback copy stored on the
  // document. When `i18n` is also provided, the bell-icon feed
  // resolves the localized strings via `t(titleKey, params)` on the
  // active UI locale, so the same notification renders differently
  // for a Georgian vs. US user without storing 3 copies of each.
  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      link?: string;
      referenceId?: string;
      referenceModel?: string;
      metadata?: any;
      i18n?: {
        titleKey?: string;
        messageKey?: string;
        params?: Record<string, string | number>;
      };
    },
  ): Promise<Notification> {
    const notification = await this.create({
      userId,
      type,
      title,
      message,
      titleKey: options?.i18n?.titleKey,
      messageKey: options?.i18n?.messageKey,
      i18nParams: options?.i18n?.params,
      link: options?.link,
      referenceId: options?.referenceId,
      referenceModel: options?.referenceModel,
      metadata: options?.metadata,
    });

    // Push real-time notification via WebSocket
    try {
      this.notificationsGateway.sendNotification(userId, {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        titleKey: notification.titleKey,
        messageKey: notification.messageKey,
        i18nParams: notification.i18nParams,
        isRead: notification.isRead,
        link: notification.link,
        referenceId: notification.referenceId,
        referenceModel: notification.referenceModel,
        metadata: notification.metadata,
        createdAt: (notification as any).createdAt,
      });
    } catch (error) {
      console.error('[Notifications] Failed to push real-time notification:', error);
    }

    // Deliver to the user's devices too. The socket above only reaches an app
    // that is open right now; this is what reaches a backgrounded or killed
    // app. Fire-and-forget - sendToUser swallows its own failures.
    void this.expoPushService.sendToUser(userId, {
      title,
      body: message,
      type,
      titleKey: options?.i18n?.titleKey,
      messageKey: options?.i18n?.messageKey,
      i18nParams: options?.i18n?.params,
      data: {
        notificationId: String(notification._id),
        link: options?.link,
        referenceId: options?.referenceId,
        // The OS renders title/body as sent, so the banner itself is the
        // English fallback. These let the app show localized copy once it is
        // opened from the tap, and are what a future server-side
        // localization pass would key off.
        titleKey: options?.i18n?.titleKey,
        messageKey: options?.i18n?.messageKey,
        i18nParams: options?.i18n?.params,
      },
    });

    return notification;
  }

  // Notify multiple users at once
  async notifyMany(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    options?: {
      link?: string;
      referenceId?: string;
      referenceModel?: string;
      metadata?: any;
      i18n?: {
        titleKey?: string;
        messageKey?: string;
        params?: Record<string, string | number>;
      };
    },
  ): Promise<void> {
    await Promise.all(
      userIds.map(userId => this.notify(userId, type, title, message, options))
    );
  }

  /**
   * Count job invitation notifications created since a given date for a specific inviter (job owner).
   * Note: invitations are stored as notifications per invited pro, with metadata.clientId set.
   */
  async countJobInvitationsSentByUser(userId: string, since: Date): Promise<number> {
    return this.notificationModel.countDocuments({
      type: NotificationType.JOB_INVITATION,
      'metadata.clientId': userId,
      createdAt: { $gte: since },
    });
  }

  // Broadcast system announcement to all users
  async broadcastAnnouncement(
    title: string,
    message: string,
    options?: { link?: string; metadata?: any },
  ): Promise<void> {
    // This would typically save to a separate announcements collection
    // and broadcast to all connected users
    this.notificationsGateway.broadcastSystemAnnouncement({
      type: NotificationType.SYSTEM_ANNOUNCEMENT,
      title,
      message,
      ...options,
      createdAt: new Date(),
    });
  }
}
