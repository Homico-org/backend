import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { UserBadge, UserBadgeSchema } from './schemas/user-badge.schema';
import { Review, ReviewSchema } from '../review/schemas/review.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserBadge.name, schema: UserBadgeSchema },
      // Read-only access to Review/User for badge conditions (counts, stats).
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [BadgesController],
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
