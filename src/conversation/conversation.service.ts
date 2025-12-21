import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { Message } from '../message/schemas/message.schema';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(User.name) private userModel: Model<User>,
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

  async findByUser(userId: string, role: string): Promise<any[]> {
    // Build query based on role
    // For clients: clientId matches userId
    // For pros: proId matches userId (now proId IS the userId directly)
    let query: any;

    if (role === 'pro') {
      // Query for conversations where user is either client or pro
      query = {
        $or: [
          { clientId: new Types.ObjectId(userId) },
          { clientId: userId },
          { proId: new Types.ObjectId(userId) },
          { proId: userId }
        ]
      };
    } else {
      // Client query
      query = {
        $or: [
          { clientId: new Types.ObjectId(userId) },
          { clientId: userId }
        ]
      };
    }

    const conversations = await this.conversationModel
      .find(query)
      .populate('clientId', 'name avatar email role')
      .populate('proId', 'name avatar email role title categories')
      .sort({ lastMessageAt: -1 })
      .exec();

    // Transform to include participant info
    return conversations.map(conv => {
      const convObj = conv.toObject();

      // Determine if current user is the client in this conversation
      const isClientInConv = convObj.clientId?._id?.toString() === userId;

      // Determine the other participant
      let participant;
      if (isClientInConv) {
        // Current user is client, participant is the pro
        const pro = convObj.proId as any;
        participant = {
          _id: pro?._id,
          name: pro?.name || 'Unknown Pro',
          avatar: pro?.avatar,
          role: 'pro',
          title: pro?.title || pro?.categories?.[0] || '',
        };
      } else {
        // Current user is pro, participant is the client
        const client = convObj.clientId as any;
        participant = {
          _id: client?._id,
          name: client?.name || 'Unknown Client',
          avatar: client?.avatar,
          role: client?.role || 'client',
          title: '',
        };
      }

      return {
        _id: convObj._id,
        participant,
        lastMessage: convObj.lastMessagePreview ? {
          content: convObj.lastMessagePreview,
          createdAt: convObj.lastMessageAt,
          senderId: convObj.lastMessageBy,
        } : null,
        unreadCount: isClientInConv ? convObj.unreadCountClient : convObj.unreadCountPro,
        createdAt: (convObj as any).createdAt,
        updatedAt: (convObj as any).updatedAt,
      };
    });
  }

  async findById(conversationId: string): Promise<Conversation | null> {
    return this.conversationModel
      .findById(conversationId)
      .populate('clientId', 'name avatar email role')
      .populate('proId', 'name avatar email role title categories')
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

  async incrementUnreadCount(conversationId: string, recipientRole: 'client' | 'pro'): Promise<void> {
    const update = recipientRole === 'client'
      ? { $inc: { unreadCountClient: 1 } }
      : { $inc: { unreadCountPro: 1 } };

    await this.conversationModel.findByIdAndUpdate(conversationId, update);
  }

  async resetUnreadCount(conversationId: string, userRole: 'client' | 'pro'): Promise<void> {
    const update = userRole === 'client'
      ? { unreadCountClient: 0 }
      : { unreadCountPro: 0 };

    await this.conversationModel.findByIdAndUpdate(conversationId, update);
  }

  async startConversation(senderId: string, recipientId: string, messageContent: string, senderRole: string): Promise<{ conversation: Conversation; message: Message }> {
    // Determine client and pro based on roles
    // Now both clientId and proId are direct user IDs
    let clientId: string;
    let proId: string;

    if (senderRole === 'client') {
      clientId = senderId;
      proId = recipientId; // This is now the pro's userId directly
    } else {
      // Sender is pro - recipientId is client userId
      clientId = recipientId;
      proId = senderId; // Pro's userId directly
    }

    // Find or create conversation
    const conversation = await this.findOrCreate(clientId, proId);

    // Create the first message
    const message = new this.messageModel({
      conversationId: conversation._id,
      senderId: senderId,
      content: messageContent,
      isRead: false,
    });
    await message.save();

    // Update conversation with last message info
    await this.updateLastMessage(
      conversation._id.toString(),
      messageContent.substring(0, 100),
      senderId,
    );

    // Increment unread count for recipient
    const recipientRole = senderRole === 'client' ? 'pro' : 'client';
    await this.incrementUnreadCount(conversation._id.toString(), recipientRole);

    return { conversation, message };
  }

  async findOrStartConversation(userId: string, recipientId: string, userRole: string): Promise<Conversation> {
    let clientId: string;
    let proId: string;

    if (userRole === 'client') {
      clientId = userId;
      proId = recipientId; // Now directly the pro's userId
    } else {
      clientId = recipientId; // client userId
      proId = userId; // Pro's userId directly
    }

    return this.findOrCreate(clientId, proId);
  }

  async getTotalUnreadCount(userId: string, role: string): Promise<number> {
    let query: any;

    if (role === 'pro') {
      // For pro, count unread in conversations where they are the pro
      query = {
        $or: [
          { proId: new Types.ObjectId(userId) },
          { proId: userId }
        ]
      };

      // Aggregate unreadCountPro for pro users
      const result = await this.conversationModel.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$unreadCountPro' } } }
      ]).exec();

      return result[0]?.total || 0;
    } else {
      // Client query
      query = {
        $or: [
          { clientId: new Types.ObjectId(userId) },
          { clientId: userId }
        ]
      };

      // Aggregate unreadCountClient for client users
      const result = await this.conversationModel.aggregate([
        { $match: query },
        { $group: { _id: null, total: { $sum: '$unreadCountClient' } } }
      ]).exec();

      return result[0]?.total || 0;
    }
  }

  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationModel.findById(conversationId).exec();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Check if user is part of this conversation
    const isClient = conversation.clientId?.toString() === userId;
    const isPro = conversation.proId?.toString() === userId;

    if (!isClient && !isPro) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    // Delete all messages in this conversation
    await this.messageModel.deleteMany({ conversationId: new Types.ObjectId(conversationId) }).exec();

    // Delete the conversation
    await this.conversationModel.findByIdAndDelete(conversationId).exec();
  }
}
