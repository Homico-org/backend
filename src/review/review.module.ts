import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewRequest, ReviewRequestSchema } from './schemas/review-request.schema';
import { UsersModule } from '../users/users.module';
import { VerificationModule } from '../verification/verification.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: ReviewRequest.name, schema: ReviewRequestSchema },
    ]),
    UsersModule,
    VerificationModule,
    NotificationsModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
