import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { CompanyModule } from './company/company.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    PortfolioModule,
    ProjectRequestModule,
    ConversationModule,
    MessageModule,
    OfferModule,
    ReviewModule,
    JobsModule,
    CompanyModule,
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
  ],
})
export class AppModule {}
