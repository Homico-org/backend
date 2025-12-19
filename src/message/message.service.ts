import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationService } from '../conversation/conversation.service';
import { ChatGateway } from '../chat/chat.gateway';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private conversationService: ConversationService,
    private chatGateway: ChatGateway,
  ) {}

  async create(senderId: string, senderRole: string, createMessageDto: CreateMessageDto): Promise<Message> {
    const message = new this.messageModel({
      senderId,
      ...createMessageDto,
    });

    await message.save();

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

    // Emit WebSocket event for real-time updates
    this.chatGateway.emitNewMessage(createMessageDto.conversationId, populatedMessage);

    // Get conversation to notify the recipient
    const conversation = await this.conversationService.findById(createMessageDto.conversationId);
    if (conversation) {
      // Determine recipient ID based on sender
      const recipientId = conversation.clientId.toString() === senderId
        ? conversation.proId.toString()
        : conversation.clientId.toString();

      // Emit conversation update to recipient
      this.chatGateway.emitConversationUpdate(recipientId, {
        conversationId: createMessageDto.conversationId,
        lastMessage: createMessageDto.content.substring(0, 100),
        lastMessageAt: new Date(),
      });
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
    await this.messageModel.updateMany(
      {
        conversationId,
        senderId: { $ne: userId },
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );
  }
}
