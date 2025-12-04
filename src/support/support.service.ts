import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportTicket, TicketStatus } from './schemas/support-ticket.schema';
import { CreateTicketDto, SendMessageDto, UpdateTicketStatusDto, ContactFormDto } from './dto/create-ticket.dto';

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicket>,
  ) {}

  // Public contact form for unauthenticated users
  async createContactTicket(contactFormDto: ContactFormDto): Promise<{ success: boolean; ticketId: string }> {
    const fieldLabels: Record<string, string> = {
      email: 'Email',
      phone: 'Phone Number',
      idNumber: 'ID Number',
    };

    const subject = contactFormDto.type === 'account_issue'
      ? `Account Issue: ${fieldLabels[contactFormDto.field || ''] || 'General'}`
      : contactFormDto.type === 'feedback'
        ? 'User Feedback'
        : 'Contact Request';

    const messageContent = contactFormDto.field
      ? `Field: ${fieldLabels[contactFormDto.field]}\nValue: ${contactFormDto.value}\n\nMessage:\n${contactFormDto.message}\n\nContact Info:\nEmail: ${contactFormDto.contactEmail || 'Not provided'}\nPhone: ${contactFormDto.contactPhone || 'Not provided'}`
      : `Message:\n${contactFormDto.message}\n\nContact Info:\nEmail: ${contactFormDto.contactEmail || 'Not provided'}\nPhone: ${contactFormDto.contactPhone || 'Not provided'}`;

    const ticket = new this.ticketModel({
      subject,
      category: 'account',
      subcategory: contactFormDto.type,
      priority: 'medium',
      messages: [{
        content: messageContent,
        isAdmin: false,
        createdAt: new Date(),
      }],
      hasUnreadUserMessages: true,
      lastMessageAt: new Date(),
      // Store contact info for anonymous users
      guestEmail: contactFormDto.contactEmail,
      guestPhone: contactFormDto.contactPhone,
    });

    const savedTicket = await ticket.save();
    return { success: true, ticketId: savedTicket._id.toString() };
  }

  async createTicket(userId: string, createTicketDto: CreateTicketDto): Promise<SupportTicket> {
    const ticket = new this.ticketModel({
      userId: new Types.ObjectId(userId),
      subject: createTicketDto.subject,
      category: createTicketDto.category,
      subcategory: createTicketDto.subcategory,
      priority: createTicketDto.priority || 'medium',
      relatedItemType: createTicketDto.relatedItemType,
      relatedItemId: createTicketDto.relatedItemId ? new Types.ObjectId(createTicketDto.relatedItemId) : undefined,
      messages: [{
        senderId: new Types.ObjectId(userId),
        content: createTicketDto.message,
        isAdmin: false,
        createdAt: new Date(),
      }],
      hasUnreadUserMessages: true,
      lastMessageAt: new Date(),
    });

    return ticket.save();
  }

  async getUserTickets(userId: string): Promise<SupportTicket[]> {
    return this.ticketModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ lastMessageAt: -1 })
      .exec();
  }

  async getTicketById(ticketId: string, userId?: string, isAdmin = false): Promise<SupportTicket> {
    const ticket = await this.ticketModel
      .findById(ticketId)
      .populate('userId', 'name email avatar role')
      .populate('assignedTo', 'name email avatar')
      .exec();

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Non-admin users can only view their own tickets
    if (!isAdmin && ticket.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    return ticket;
  }

  async sendMessage(ticketId: string, userId: string, dto: SendMessageDto, isAdmin = false): Promise<SupportTicket> {
    const ticket = await this.ticketModel.findById(ticketId);

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    // Non-admin users can only message their own tickets
    if (!isAdmin && ticket.userId.toString() !== userId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    const message = {
      senderId: new Types.ObjectId(userId),
      content: dto.content,
      isAdmin,
      attachments: dto.attachments || [],
      createdAt: new Date(),
    };

    ticket.messages.push(message);
    ticket.lastMessageAt = new Date();

    if (isAdmin) {
      ticket.hasUnreadAdminMessages = true;
      ticket.hasUnreadUserMessages = false;
      if (ticket.status === 'open') {
        ticket.status = 'in_progress';
      }
    } else {
      ticket.hasUnreadUserMessages = true;
      ticket.hasUnreadAdminMessages = false;
    }

    return ticket.save();
  }

  async markAsRead(ticketId: string, userId: string, isAdmin = false): Promise<void> {
    const update = isAdmin
      ? { hasUnreadUserMessages: false }
      : { hasUnreadAdminMessages: false };

    await this.ticketModel.findByIdAndUpdate(ticketId, update);
  }

  // Admin methods
  async getAllTickets(filters?: {
    status?: TicketStatus;
    priority?: string;
    hasUnread?: boolean;
  }): Promise<SupportTicket[]> {
    const query: any = {};

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.priority) {
      query.priority = filters.priority;
    }
    if (filters?.hasUnread) {
      query.hasUnreadUserMessages = true;
    }

    return this.ticketModel
      .find(query)
      .populate('userId', 'name email avatar role')
      .populate('assignedTo', 'name email avatar')
      .sort({ hasUnreadUserMessages: -1, lastMessageAt: -1 })
      .exec();
  }

  async updateTicketStatus(ticketId: string, dto: UpdateTicketStatusDto): Promise<SupportTicket> {
    const update: any = { status: dto.status };

    if (dto.status === 'resolved') {
      update.resolvedAt = new Date();
    } else if (dto.status === 'closed') {
      update.closedAt = new Date();
    }

    const ticket = await this.ticketModel.findByIdAndUpdate(
      ticketId,
      update,
      { new: true }
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async assignTicket(ticketId: string, adminId: string): Promise<SupportTicket> {
    const ticket = await this.ticketModel.findByIdAndUpdate(
      ticketId,
      { assignedTo: new Types.ObjectId(adminId), status: 'in_progress' },
      { new: true }
    );

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  async getTicketStats(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    unread: number;
  }> {
    const [total, open, inProgress, resolved, unread] = await Promise.all([
      this.ticketModel.countDocuments(),
      this.ticketModel.countDocuments({ status: 'open' }),
      this.ticketModel.countDocuments({ status: 'in_progress' }),
      this.ticketModel.countDocuments({ status: 'resolved' }),
      this.ticketModel.countDocuments({ hasUnreadUserMessages: true }),
    ]);

    return { total, open, inProgress, resolved, unread };
  }
}
