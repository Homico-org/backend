import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AmplitudeService } from './amplitude.service';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { BackfillService } from './backfill.service';
import { AnalyticsEvent, AnalyticsEventSchema } from './schemas/analytics-event.schema';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { Proposal, ProposalSchema } from '../jobs/schemas/proposal.schema';
import { ProjectTracking, ProjectTrackingSchema } from '../jobs/schemas/project-tracking.schema';
import { Review, ReviewSchema } from '../review/schemas/review.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

/**
 * Global so any feature module can inject AmplitudeService / AnalyticsService
 * without having to re-import this module. Analytics is a cross-cutting
 * concern that doesn't deserve boilerplate at every consumer.
 *
 * Two services live here for distinct purposes:
 *  - AnalyticsService   - WRITES events to MongoDB for our own admin dashboards
 *  - AmplitudeService   - SENDS events to Amplitude SaaS for product analytics
 *
 * Some call sites will want to hit one, some both. Keeping them as separate
 * services (rather than a single fan-out) lets callers be explicit about
 * where each event matters.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: AnalyticsEvent.name, schema: AnalyticsEventSchema },
      // Read-only access to these collections for BackfillService.
      // Mongoose allows the same schema to be registered in multiple
      // modules; ownership stays with the source module.
      { name: Booking.name, schema: BookingSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: ProjectTracking.name, schema: ProjectTrackingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AmplitudeService, BackfillService],
  exports: [AnalyticsService, AmplitudeService],
})
export class AnalyticsModule {}
