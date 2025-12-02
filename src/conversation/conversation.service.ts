import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { Message } from '../message/schemas/message.schema';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
  ) {}

  async findOrCreate(clientId: string, proId: string, projectRequestId?: string): Promise<Conversation> {
    let conversation = await this.conversationModel
      .findOne({ clientId, proId })
      .exec();

    if (!conversation) {
      conversation = new this.conversationModel({
        clientId,
        proId,
        projectRequestId,
      });
      await conversation.save();
    }

    return conversation;
  }

  async findByUser(userId: string, role: string): Promise<Conversation[]> {
    const query = role === 'client' ? { clientId: userId } : { proId: userId };

    return this.conversationModel
      .find(query)
      .populate('clientId', 'name avatar')
      .populate('proId')
      .sort({ lastMessageAt: -1 })
      .exec();
  }

  async updateLastMessage(
    conversationId: string,
    messagePreview: string,
    senderId: string,
  ): Promise<void> {
    await this.conversationModel.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: messagePreview,
      lastMessageBy: senderId,
    });
  }

  async startConversation(clientId: string, proId: string, messageContent: string): Promise<{ conversation: Conversation; message: Message }> {
    // Find or create conversation
    const conversation = await this.findOrCreate(clientId, proId);

    // Create the first message
    const message = new this.messageModel({
      conversationId: conversation._id,
      senderId: clientId,
      content: messageContent,
      isRead: false,
    });
    await message.save();

    // Update conversation with last message info
    await this.updateLastMessage(
      conversation._id.toString(),
      messageContent.substring(0, 100),
      clientId,
    );

    return { conversation, message };
  }
}
