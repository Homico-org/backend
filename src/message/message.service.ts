import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message } from './schemas/message.schema';
import { CreateMessageDto } from './dto/create-message.dto';
import { ConversationService } from '../conversation/conversation.service';

@Injectable()
export class MessageService {
  constructor(
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private conversationService: ConversationService,
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
    return this.messageModel
      .findById(message._id)
      .populate('senderId', 'name avatar')
      .exec();
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
