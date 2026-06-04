import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { accessSync, constants } from 'fs';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { ProjectRequestModule } from './project-request/project-request.module';
import { ConversationModule } from './conversation/conversation.module';
import { MessageModule } from './message/message.module';
import { OfferModule } from './offer/offer.module';
import { ReviewModule } from './review/review.module';
import { JobsModule } from './jobs/jobs.module';

import { VerificationModule } from './verification/verification.module';
import { CategoriesModule } from './categories/categories.module';
import { UploadModule } from './upload/upload.module';
import { HealthModule } from './health/health.module';
import { SupportModule } from './support/support.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { LikesModule } from './likes/likes.module';
import { FeedModule } from './feed/feed.module';
import { ChatModule } from './chat/chat.module';
import { LoggerModule } from './common/logger';
import { AiModule } from './ai/ai.module';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module';
import { PublicModule } from './public/public.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { CatalogSuggestionsModule } from './catalog-suggestions/catalog-suggestions.module';
import { PaymentsModule } from './payments/payments.module';
import { BusinessModule } from './business/business.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ServiceCatalogModule } from './service-catalog/service-catalog.module';
import { BookingsModule } from './bookings/bookings.module';
import { InviteModule } from './invite/invite.module';
import { SlaModule } from './sla/sla.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // In some environments (CI/sandboxes), reading `.env` can be disallowed.
    // Treat env file loading as best-effort and fall back to process.env.
    (() => {
      const envPath = join(process.cwd(), '.env');
      let ignoreEnvFile = false;
      try {
        accessSync(envPath, constants.R_OK);
      } catch {
        ignoreEnvFile = true;
      }
      return ConfigModule.forRoot({
        isGlobal: true,
        ...(ignoreEnvFile ? { ignoreEnvFile: true } : { envFilePath: envPath }),
      });
    })(),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: {
        // Cache images for 1 year (immutable content-addressed files)
        maxAge: 31536000000, // 1 year in milliseconds
        immutable: true,
        // Set proper headers for caching
        setHeaders: (res, _path) => {
          // Add cache headers for all static files
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          // Add Vary header for proper CDN caching
          res.setHeader('Vary', 'Accept-Encoding');
        },
      },
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri =
          configService.get<string>('MONGODB_URI') ||
          (process.env.NODE_ENV === 'production'
            ? undefined
            : 'mongodb://127.0.0.1:27017/homico');
        if (!uri) {
          throw new Error('MONGODB_URI is required in production');
        }
        return { uri };
      },
      inject: [ConfigService],
    }),
    // Global rate limiting (abuse protection)
    // Note: ttl is in milliseconds in current Nest throttler docs.
    ThrottlerModule.forRoot([
      // General API traffic
      { name: 'default', ttl: 60_000, limit: 120 },
      // Extra protection against burst traffic
      { name: 'burst', ttl: 10_000, limit: 40 },
      // AI cost ceiling: caps any single IP at ~200 OpenAI-billable
      // requests per day. Cost math: 200 * ~$0.001 = ~$0.20/IP/day, so
      // worst case (1000 attackers) = $200/day cap. Layered on top of
      // the per-route limits, not instead of.
      { name: 'ai-cost', ttl: 24 * 60 * 60_000, limit: 200 },
    ]),
    AuthModule,
    UsersModule,
    PortfolioModule,
    ProjectRequestModule,
    ConversationModule,
    MessageModule,
    OfferModule,
    ReviewModule,
    JobsModule,
    VerificationModule,
    CategoriesModule,
    UploadModule,
    HealthModule,
    SupportModule,
    NotificationsModule,
    AdminModule,
    LikesModule,
    FeedModule,
    ChatModule,
    LoggerModule,
    AiModule,
    AiAssistantModule,
    PublicModule,
    BusinessModule,
    AnalyticsModule,
    ServiceCatalogModule,
    BookingsModule,
    InviteModule,
    ServiceRequestsModule,
    CatalogSuggestionsModule,
    PaymentsModule,
    SlaModule,
  ],
  providers: [
    // Apply rate limiting across the whole API by default
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
