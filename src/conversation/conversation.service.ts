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
    // Find all conversations where user is either client or pro
    const conversations = await this.conversationModel
      .find({
        $or: [{ clientId: userId }, { proId: userId }]
      })
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
      const isClient = convObj.clientId?._id?.toString() === userId;

      // Determine the other participant
      let participant;
      if (isClient) {
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
        unreadCount: isClient ? convObj.unreadCountClient : convObj.unreadCountPro,
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
}
