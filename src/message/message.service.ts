import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Message, MessageStatus } from './schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationService } from '../conversation/conversation.service';
import { ChatGateway } from '../chat/chat.gateway';
import { User } from '../users/schemas/user.schema';
import { SmsService } from '../verification/services/sms.service';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(User.name) private userModel: Model<User>,
    private conversationService: ConversationService,
    private chatGateway: ChatGateway,
    private smsService: SmsService,
  ) {}

  async create(senderId: string, senderRole: string, createMessageDto: CreateMessageDto): Promise<Message> {
    const message = new this.messageModel({
      senderId,
      ...createMessageDto,
    });

    await message.save();
    const createdAt = (message as any).createdAt ?? new Date();

    // Emit immediately to reduce perceived send latency on receiver clients.
    this.chatGateway.emitNewMessage(createMessageDto.conversationId, {
      _id: message._id,
      conversationId: message.conversationId,
      senderId,
      content: message.content,
      attachments: message.attachments ?? [],
      isRead: message.isRead,
      status: message.status,
      createdAt,
    });

    await this.conversationService.updateLastMessage(
      createMessageDto.conversationId,
      createMessageDto.content.substring(0, 100),
      senderId,
    );

    // Increment unread count for the recipient
    const recipientRole = senderRole === 'client' ? 'pro' : 'client';
    await this.conversationService.incrementUnreadCount(
      createMessageDto.conversationId,
      recipientRole,
    );

    // Return populated message
    const populatedMessage = await this.messageModel
      .findById(message._id)
      .populate('senderId', 'name avatar')
      .exec();

    // Get conversation to notify the recipient
    const conversation = await this.conversationService.findById(createMessageDto.conversationId);
    if (conversation) {
      // Now both clientId and proId are direct user IDs
      const clientUserId = conversation.clientId?.toString();
      const proUserId = conversation.proId?.toString();

      // Determine recipient userId - if sender is client, recipient is pro's userId
      const recipientUserId = clientUserId === senderId ? proUserId : clientUserId;

      if (recipientUserId) {
        // Emit conversation update to recipient
        this.chatGateway.emitConversationUpdate(recipientUserId, {
          conversationId: createMessageDto.conversationId,
          lastMessage: createMessageDto.content.substring(0, 100),
          lastMessageAt: new Date(),
        });

        // SMS notification for new messages (if enabled)
        try {
          const recipient = await this.userModel
            .findById(recipientUserId)
            .select('phone notificationPreferences')
            .lean();

          const phone = (recipient as any)?.phone as string | undefined;
          const prefs = (recipient as any)?.notificationPreferences as any | undefined;
          const smsEnabled = prefs?.sms?.enabled !== false;
          const smsMessages = prefs?.sms?.messages !== false;

          if (phone && smsEnabled && smsMessages) {
            const sender = await this.userModel
              .findById(senderId)
              .select('name')
              .lean();
            const senderName = (sender as any)?.name || 'Homico';

            const snippet = (createMessageDto.content || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 80);

            const url = `https://www.homico.ge/messages?recipient=${senderId}`;
            const smsText = snippet
              ? `${senderName}: "${snippet}" ${url}`
              : `${senderName} sent you a message on Homico. ${url}`;

            await this.smsService.sendNotificationSms(phone, smsText);
          }
        } catch (e) {
          // Don't fail message sending if SMS fails
          // eslint-disable-next-line no-console
          console.error('Failed to send message SMS notification:', e);
        }
      }
    }

    return populatedMessage;
  }

  async findByConversation(conversationId: string, limit = 50, skip = 0): Promise<Message[]> {
    return this.messageModel
      .find({ conversationId })
      .sort({ createdAt: 1 }) // Changed to ascending order for proper chat display
      .limit(limit)
      .skip(skip)
      .populate('senderId', 'name avatar')
      .exec();
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.messageModel.findByIdAndUpdate(messageId, {
      isRead: true,
      readAt: new Date(),
    });
  }

  async markAllAsRead(conversationId: string, userId: string): Promise<void> {
    const now = new Date();

    // Find messages that need status update (to emit socket events)
    const messagesToUpdate = await this.messageModel.find({
      conversationId: new Types.ObjectId(conversationId),
      senderId: { $ne: new Types.ObjectId(userId) },
      status: { $ne: MessageStatus.READ },
    }).select('_id senderId').lean();

    // Update messages to read status
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(userId) },
        isRead: false,
      },
      {
        isRead: true,
        readAt: now,
        status: MessageStatus.READ,
      }
    );

    // Emit status update events to the original senders
    if (messagesToUpdate.length > 0) {
      const messageIds = messagesToUpdate.map(m => m._id.toString());
      // Get unique sender IDs
      const senderIds = [...new Set(messagesToUpdate.map(m => m.senderId.toString()))];

      // Emit to conversation room for real-time update
      this.chatGateway.emitMessageStatusUpdate(conversationId, messageIds, MessageStatus.READ);

      // Also emit to each sender directly
      senderIds.forEach(senderId => {
        this.chatGateway.emitToUser(senderId, 'messageStatusUpdate', {
          conversationId,
          messageIds,
          status: MessageStatus.READ,
        });
      });
    }
  }

  // Mark messages as delivered when recipient connects or opens conversation
  async markAsDelivered(conversationId: string, recipientId: string): Promise<void> {
    const now = new Date();

    // Find messages that need to be marked as delivered
    const messagesToUpdate = await this.messageModel.find({
      conversationId: new Types.ObjectId(conversationId),
      senderId: { $ne: new Types.ObjectId(recipientId) },
      status: MessageStatus.SENT,
    }).select('_id senderId').lean();

    if (messagesToUpdate.length === 0) return;

    // Update messages to delivered status
    await this.messageModel.updateMany(
      {
        conversationId: new Types.ObjectId(conversationId),
        senderId: { $ne: new Types.ObjectId(recipientId) },
        status: MessageStatus.SENT,
      },
      {
        status: MessageStatus.DELIVERED,
        deliveredAt: now,
      }
    );

    const messageIds = messagesToUpdate.map(m => m._id.toString());
    const senderIds = [...new Set(messagesToUpdate.map(m => m.senderId.toString()))];

    // Emit status update to conversation room
    this.chatGateway.emitMessageStatusUpdate(conversationId, messageIds, MessageStatus.DELIVERED);

    // Also emit to each sender directly
    senderIds.forEach(senderId => {
      this.chatGateway.emitToUser(senderId, 'messageStatusUpdate', {
        conversationId,
        messageIds,
        status: MessageStatus.DELIVERED,
      });
    });
  }

  // Mark all pending messages as delivered for a user (when they come online)
  async markAllUserMessagesAsDelivered(userId: string): Promise<void> {
    const now = new Date();

    // Get all conversations for this user
    const conversations = await this.conversationService.findByUserId(userId);

    for (const conversation of conversations) {
      await this.markAsDelivered(conversation._id.toString(), userId);
    }
  }
}
