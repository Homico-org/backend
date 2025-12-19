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
}
