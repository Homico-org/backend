import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationType } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<Notification>,
    @Inject(forwardRef(() => NotificationsGateway))
    private notificationsGateway: NotificationsGateway,
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

  // Helper method to create notifications from other services
  async notify(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: { link?: string; referenceId?: string; referenceModel?: string; metadata?: any },
  ): Promise<Notification> {
    const notification = await this.create({
      userId,
      type,
      title,
      message,
      ...options,
    });

    // Push real-time notification via WebSocket
    try {
      this.notificationsGateway.sendNotification(userId, {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
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

    return notification;
  }

  // Notify multiple users at once
  async notifyMany(
    userIds: string[],
    type: NotificationType,
    title: string,
    message: string,
    options?: { link?: string; referenceId?: string; referenceModel?: string; metadata?: any },
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
