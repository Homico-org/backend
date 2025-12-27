import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

export enum ActivityType {
  // Auth
  USER_REGISTER = 'user.register',
  USER_LOGIN = 'user.login',
  USER_LOGOUT = 'user.logout',
  USER_PASSWORD_RESET = 'user.password_reset',

  // Account
  USER_DELETE = 'user.delete',
  USER_UPDATE = 'user.update',
  USER_UPGRADE_TO_PRO = 'user.upgrade_to_pro',
  USER_VERIFICATION_SUBMIT = 'user.verification_submit',
  USER_VERIFICATION_APPROVED = 'user.verification_approved',
  USER_VERIFICATION_REJECTED = 'user.verification_rejected',

  // Profile
  PROFILE_UPDATE = 'profile.update',
  PROFILE_DEACTIVATE = 'profile.deactivate',
  PROFILE_REACTIVATE = 'profile.reactivate',
  AVATAR_UPLOAD = 'avatar.upload',

  // Jobs
  JOB_CREATE = 'job.create',
  JOB_UPDATE = 'job.update',
  JOB_DELETE = 'job.delete',
  JOB_STATUS_CHANGE = 'job.status_change',

  // Proposals
  PROPOSAL_CREATE = 'proposal.create',
  PROPOSAL_UPDATE = 'proposal.update',
  PROPOSAL_WITHDRAW = 'proposal.withdraw',
  PROPOSAL_ACCEPT = 'proposal.accept',
  PROPOSAL_REJECT = 'proposal.reject',

  // Messages
  CONVERSATION_START = 'conversation.start',
  MESSAGE_SEND = 'message.send',

  // Reviews
  REVIEW_CREATE = 'review.create',
  REVIEW_UPDATE = 'review.update',

  // Portfolio
  PORTFOLIO_ADD = 'portfolio.add',
  PORTFOLIO_UPDATE = 'portfolio.update',
  PORTFOLIO_DELETE = 'portfolio.delete',

  // Admin
  ADMIN_USER_UPDATE = 'admin.user_update',
  ADMIN_USER_DELETE = 'admin.user_delete',
  ADMIN_VERIFICATION_ACTION = 'admin.verification_action',
}

interface ActivityLogData {
  type: ActivityType;
  userId?: string;
  userEmail?: string;
  userName?: string;
  targetId?: string;
  targetType?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: winston.Logger;
  private activityLogger: winston.Logger;

  constructor() {
    const lokiHost = process.env.LOKI_HOST || 'http://localhost:3100';
    const lokiUser = process.env.LOKI_USER || '';
    const lokiPassword = process.env.LOKI_PASSWORD || '';
    const appName = process.env.APP_NAME || 'homico-backend';
    const environment = process.env.NODE_ENV || 'development';

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      }),
    );

    // JSON format for Loki
    const jsonFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    );

    // Loki basic auth for Grafana Cloud
    const lokiBasicAuth = lokiUser && lokiPassword
      ? { username: lokiUser, password: lokiPassword }
      : undefined;

    // Transports array
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: consoleFormat,
      }),
    ];

    // Add Loki transport if LOKI_HOST is configured
    if (process.env.LOKI_HOST) {
      transports.push(
        new LokiTransport({
          host: lokiHost,
          labels: { app: appName, env: environment },
          json: true,
          format: jsonFormat,
          replaceTimestamp: true,
          basicAuth: lokiBasicAuth,
          onConnectionError: (err) => console.error('Loki connection error:', err),
        }),
      );
      console.log(`[Logger] Loki transport configured for: ${lokiHost}`);
    }

    // Main application logger
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      transports,
    });

    // Activity logger with specific labels
    const activityTransports: winston.transport[] = [
      new winston.transports.Console({
        format: consoleFormat,
      }),
    ];

    if (process.env.LOKI_HOST) {
      activityTransports.push(
        new LokiTransport({
          host: lokiHost,
          labels: { app: appName, env: environment, type: 'activity' },
          json: true,
          format: jsonFormat,
          replaceTimestamp: true,
          basicAuth: lokiBasicAuth,
          onConnectionError: (err) => console.error('Loki connection error:', err),
        }),
      );
    }

    this.activityLogger = winston.createLogger({
      level: 'info',
      transports: activityTransports,
    });
  }

  // Standard NestJS logger methods
  log(message: string, context?: string) {
    this.logger.info(message, { context });
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context });
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context });
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context });
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context });
  }

  // Activity logging - this is what you'll query in Grafana
  logActivity(data: ActivityLogData) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      activity_type: data.type,
      user_id: data.userId || 'anonymous',
      user_email: data.userEmail || 'unknown',
      user_name: data.userName || 'unknown',
      target_id: data.targetId,
      target_type: data.targetType,
      details: data.details,
      ip: data.ip,
      user_agent: data.userAgent,
    };

    this.activityLogger.info(`Activity: ${data.type}`, logEntry);

    // Also log to console in a readable format
    console.log(
      `[ACTIVITY] ${data.type} | User: ${data.userEmail || data.userId || 'anonymous'} | Target: ${data.targetType}:${data.targetId || 'N/A'}`,
    );
  }

  // Helper for user deletion - captures full user data before delete
  logUserDeletion(user: any, deletedBy?: string) {
    this.logActivity({
      type: ActivityType.USER_DELETE,
      userId: user._id?.toString() || user.id,
      userEmail: user.email,
      userName: user.name,
      details: {
        deletedBy: deletedBy || 'self',
        userRole: user.role,
        userPhone: user.phone,
        userCity: user.city,
        accountCreatedAt: user.createdAt,
        wasVerified: user.verificationStatus === 'verified',
        hadCompletedProfile: user.isProfileCompleted,
        // Store important user data for reference
        fullUserSnapshot: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          city: user.city,
          categories: user.categories,
          createdAt: user.createdAt,
        },
      },
    });
  }
}
