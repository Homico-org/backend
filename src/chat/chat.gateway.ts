import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

interface SupportTypingData {
  ticketId: string;
  isTyping: boolean;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'https://homico-frontend.onrender.com',
      'https://app.homico.ge',
      'https://homico.ge',
      'https://www.homico.ge',
      'https://dev.homico.ge',
      'https://app.dev.homico.ge',
    ],
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.userRole = payload.role;

      // Store connection
      this.connectedUsers.set(payload.sub, client.id);

      // Join a room with their user ID for direct messaging
      client.join(`user:${payload.sub}`);

      console.log(`User ${payload.sub} connected via WebSocket`);
    } catch (error) {
      console.error('WebSocket auth error:', error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      this.connectedUsers.delete(client.userId);
      console.log(`User ${client.userId} disconnected from WebSocket`);
    }
  }

  @SubscribeMessage('joinConversation')
  handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() conversationId: string,
  ) {
    client.join(`conversation:${conversationId}`);
    console.log(`User ${client.userId} joined conversation ${conversationId}`);
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() conversationId: string,
  ) {
    client.leave(`conversation:${conversationId}`);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    client.to(`conversation:${data.conversationId}`).emit('userTyping', {
      userId: client.userId,
      isTyping: data.isTyping,
    });
  }

  // Support Ticket WebSocket Events
  @SubscribeMessage('joinSupportTicket')
  handleJoinSupportTicket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() ticketId: string,
  ) {
    client.join(`support:${ticketId}`);
    console.log(`User ${client.userId} joined support ticket ${ticketId}`);
  }

  @SubscribeMessage('leaveSupportTicket')
  handleLeaveSupportTicket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() ticketId: string,
  ) {
    client.leave(`support:${ticketId}`);
  }

  @SubscribeMessage('supportTyping')
  handleSupportTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SupportTypingData,
  ) {
    client.to(`support:${data.ticketId}`).emit('supportUserTyping', {
      userId: client.userId,
      isAdmin: client.userRole === 'admin',
      isTyping: data.isTyping,
    });
  }

  // Join admin support room for real-time ticket notifications
  @SubscribeMessage('joinAdminSupport')
  handleJoinAdminSupport(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (client.userRole === 'admin') {
      client.join('admin:support');
      console.log(`Admin ${client.userId} joined admin support room`);
    }
  }

  @SubscribeMessage('leaveAdminSupport')
  handleLeaveAdminSupport(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave('admin:support');
  }

  // Project Chat WebSocket Events
  @SubscribeMessage('joinProjectChat')
  handleJoinProjectChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() jobId: string,
  ) {
    client.join(`project:${jobId}`);
    console.log(`User ${client.userId} joined project chat ${jobId}`);
  }

  @SubscribeMessage('leaveProjectChat')
  handleLeaveProjectChat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() jobId: string,
  ) {
    client.leave(`project:${jobId}`);
  }

  @SubscribeMessage('projectTyping')
  handleProjectTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { jobId: string; isTyping: boolean },
  ) {
    client.to(`project:${data.jobId}`).emit('projectTyping', {
      userId: client.userId,
      isTyping: data.isTyping,
    });
  }

  // Emit project message to project room
  emitProjectMessage(jobId: string, message: any) {
    this.server.to(`project:${jobId}`).emit('projectMessage', message);
  }

  // Emit poll update to project room
  emitPollUpdate(jobId: string, data: { type: 'created' | 'voted' | 'approved' | 'closed' | 'deleted'; poll: any }) {
    this.server.to(`project:${jobId}`).emit('projectPollUpdate', data);
  }

  // Emit materials/workspace update to project room
  emitMaterialsUpdate(jobId: string, data: { type: 'section_added' | 'section_updated' | 'section_deleted' | 'item_added' | 'item_deleted'; section?: any; item?: any; sectionId?: string }) {
    this.server.to(`project:${jobId}`).emit('projectMaterialsUpdate', data);
  }

  // Method to emit new message to conversation participants
  emitNewMessage(conversationId: string, message: any) {
    this.server.to(`conversation:${conversationId}`).emit('newMessage', message);
  }

  // Method to emit to a specific user (for notifications)
  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  // Method to emit conversation update (new message notification)
  emitConversationUpdate(userId: string, conversation: any) {
    this.server.to(`user:${userId}`).emit('conversationUpdate', conversation);
  }

  // Check if a user is online
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // Method to emit message status update to conversation participants
  emitMessageStatusUpdate(conversationId: string, messageIds: string[], status: string) {
    this.server.to(`conversation:${conversationId}`).emit('messageStatusUpdate', {
      conversationId,
      messageIds,
      status,
    });
  }

  // Support Ticket Methods
  // Emit new support message to ticket room and admin room
  emitSupportMessage(ticketId: string, message: any, ticket: any) {
    // Emit to ticket room (for both user and admin viewing this ticket)
    this.server.to(`support:${ticketId}`).emit('supportNewMessage', {
      ticketId,
      message,
    });

    // Emit ticket update to admin room for list refresh
    this.server.to('admin:support').emit('supportTicketUpdate', {
      ticketId,
      ticket,
    });

    // Emit to the ticket owner's personal room if they're not in the ticket room
    if (ticket.userId) {
      this.server.to(`user:${ticket.userId.toString()}`).emit('supportTicketUpdate', {
        ticketId,
        ticket,
      });
    }
  }

  // Emit support message status update
  emitSupportMessageStatus(ticketId: string, messageIds: string[], status: string) {
    this.server.to(`support:${ticketId}`).emit('supportMessageStatusUpdate', {
      ticketId,
      messageIds,
      status,
    });
  }

  // Emit new support ticket to admin room
  emitNewSupportTicket(ticket: any) {
    this.server.to('admin:support').emit('supportNewTicket', ticket);
  }

  // Emit support ticket status change
  emitSupportTicketStatusChange(ticketId: string, status: string, ticket: any) {
    this.server.to(`support:${ticketId}`).emit('supportTicketStatusChange', {
      ticketId,
      status,
      ticket,
    });
    this.server.to('admin:support').emit('supportTicketStatusChange', {
      ticketId,
      status,
      ticket,
    });
  }
}
