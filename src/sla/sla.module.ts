import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  Booking,
  BookingSchema,
} from "../bookings/schemas/booking.schema";
import {
  ProjectTracking,
  ProjectTrackingSchema,
} from "../jobs/schemas/project-tracking.schema";
import { NotificationsModule } from "../notifications/notifications.module";
import { User, UserSchema } from "../users/schemas/user.schema";
import { SlaCronService } from "./sla-cron.service";
import { SlaService } from "./sla.service";

/**
 * Pro accountability SLA module. Hosts the cron-driven detector and
 * the penalty-application service. NotificationsModule provides the
 * in-app notifier used when penalties are applied.
 *
 * Registers User + Booking models for direct query access. The cron's
 * eventual chat + invite scanners will add ProjectTracking and Job
 * model registrations in Phase A.2.
 *
 * Exports SlaService so other modules (e.g. a future inline trigger
 * from BookingsService when payment confirms) can call recordMiss
 * directly without going through the cron.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: ProjectTracking.name, schema: ProjectTrackingSchema },
    ]),
    NotificationsModule,
  ],
  providers: [SlaService, SlaCronService],
  exports: [SlaService],
})
export class SlaModule {}
