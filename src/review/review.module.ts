import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewRequest, ReviewRequestSchema } from './schemas/review-request.schema';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { UsersModule } from '../users/users.module';
import { VerificationModule } from '../verification/verification.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: ReviewRequest.name, schema: ReviewRequestSchema },
      { name: Booking.name, schema: BookingSchema },
    ]),
    UsersModule,
    VerificationModule,
    NotificationsModule,
    PortfolioModule,
    BadgesModule,
  ],
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
