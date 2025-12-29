import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
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
  namespace: '/notifications',
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds (supports multiple tabs)

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

      // Store connection (support multiple tabs/windows)
      if (!this.connectedUsers.has(payload.sub)) {
        this.connectedUsers.set(payload.sub, new Set());
      }
      this.connectedUsers.get(payload.sub)!.add(client.id);

      // Join a room with their user ID for direct notifications
      client.join(`user:${payload.sub}`);

      // Join admin room if admin
      if (payload.role === 'admin') {
        client.join('admin:notifications');
      }

      console.log(`[Notifications] User ${payload.sub} connected (${this.getConnectionCount(payload.sub)} connections)`);
    } catch (error) {
      console.error('[Notifications] Auth error:', error.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.userId) {
      const userSockets = this.connectedUsers.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.userId);
        }
      }
      console.log(`[Notifications] User ${client.userId} disconnected (${this.getConnectionCount(client.userId)} remaining)`);
    }
  }

  private getConnectionCount(userId: string): number {
    return this.connectedUsers.get(userId)?.size || 0;
  }

  // Check if a user is online
  isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  // Send notification to a specific user
  sendNotification(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
    console.log(`[Notifications] Sent notification to user ${userId}: ${notification.type}`);
  }

  // Send notification to multiple users
  sendNotificationToMany(userIds: string[], notification: any) {
    userIds.forEach(userId => {
      this.sendNotification(userId, notification);
    });
  }

  // Send unread count update to user
  sendUnreadCountUpdate(userId: string, count: number) {
    this.server.to(`user:${userId}`).emit('notification:count', { count });
  }

  // Broadcast system announcement to all connected users
  broadcastSystemAnnouncement(notification: any) {
    this.server.emit('notification:system', notification);
    console.log('[Notifications] Broadcast system announcement to all users');
  }

  // Send to all admins
  notifyAdmins(notification: any) {
    this.server.to('admin:notifications').emit('notification:admin', notification);
  }
}
