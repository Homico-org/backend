import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { Message } from '../message/schemas/message.schema';
import { ProProfile } from '../pro-profile/schemas/pro-profile.schema';

@Injectable()
export class ConversationService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(ProProfile.name) private proProfileModel: Model<ProProfile>,
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
    // For pros: proId matches their proProfileId (need to look it up first)
    let query: any = { clientId: userId };
    let userProProfileId: string | null = null;

    if (role === 'pro') {
      // Look up the pro's profile ID
      // Handle userId stored as both ObjectId and string
      const proProfile = await this.proProfileModel.findOne({
        $or: [
          { userId: new Types.ObjectId(userId) },
          { userId: userId }
        ]
      }).exec();
      if (proProfile) {
        userProProfileId = proProfile._id.toString();
        // Query for proId as both ObjectId and string (data may be stored inconsistently)
        query = {
          $or: [
            { clientId: userId }, // In case they were a client in some conversations
            { proId: proProfile._id },
            { proId: proProfile._id.toString() }
          ]
        };
      }
    } else {
      // Client can also have conversations where they're the client
      // Handle clientId stored as both ObjectId and string
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
      .populate({
        path: 'proId',
        populate: {
          path: 'userId',
          select: 'name avatar email role'
        }
      })
      .sort({ lastMessageAt: -1 })
      .exec();

    // Transform to include participant info
    return conversations.map(conv => {
      const convObj = conv.toObject();

      // Determine if current user is the client in this conversation
      // They are client if clientId matches their userId
      const isClientInConv = convObj.clientId?._id?.toString() === userId;

      // Determine the other participant
      let participant;
      if (isClientInConv) {
        // Current user is client, participant is the pro
        const pro = convObj.proId as any;
        participant = {
          _id: pro?.userId?._id || pro?._id,
          name: pro?.userId?.name || 'Unknown Pro',
          avatar: pro?.userId?.avatar || pro?.avatar,
          role: 'pro',
          title: pro?.title || pro?.primaryCategory || '',
          proProfileId: pro?._id,
        };
      } else {
        // Current user is pro (or the proId matches their profile), participant is the client
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
      .populate({
        path: 'proId',
        populate: {
          path: 'userId',
          select: 'name avatar email role'
        }
      })
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
    // If sender is client, recipient should be pro (proProfileId)
    // If sender is pro, recipient is the client (userId)
    let clientId: string;
    let proId: string;

    if (senderRole === 'client') {
      clientId = senderId;
      proId = recipientId; // This should be proProfileId
    } else {
      // Sender is pro - recipientId is client userId
      clientId = recipientId;
      // Look up the sender's proProfileId
      const proProfile = await this.proProfileModel.findOne({ userId: senderId }).exec();
      proId = proProfile?._id?.toString() || senderId;
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
      proId = recipientId; // proProfileId
    } else {
      clientId = recipientId; // client userId
      // Look up the sender's proProfileId
      const proProfile = await this.proProfileModel.findOne({ userId: userId }).exec();
      proId = proProfile?._id?.toString() || userId;
    }

    return this.findOrCreate(clientId, proId);
  }

  async getTotalUnreadCount(userId: string, role: string): Promise<number> {
    let query: any;

    if (role === 'pro') {
      // Look up the pro's profile ID
      const proProfile = await this.proProfileModel.findOne({
        $or: [
          { userId: new Types.ObjectId(userId) },
          { userId: userId }
        ]
      }).exec();

      if (!proProfile) return 0;

      query = {
        $or: [
          { proId: proProfile._id },
          { proId: proProfile._id.toString() }
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
}
