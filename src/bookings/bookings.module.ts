import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsController } from './bookings.controller';
import { BookingsCronService } from './bookings-cron.service';
import { BookingsService } from './bookings.service';
import { Booking, BookingSchema } from './schemas/booking.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { Dispute, DisputeSchema } from '../payments/schemas/dispute.schema';
import { PortfolioModule } from '../portfolio/portfolio.module';
import {
  ProjectRequest,
  ProjectRequestSchema,
} from '../project-request/schemas/project-request.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: User.name, schema: UserSchema },
      // Dispute model is owned by PaymentsModule, but BookingsService
      // writes to it when raising a dispute. PaymentsModule is @Global
      // so PaymentsService is auto-injectable; we just need the model
      // registered here too for direct insert access.
      { name: Dispute.name, schema: DisputeSchema },
      // Registered so a project-scoped booking can link/complete its
      // parent engagement. Model-only (no module import) - acyclic.
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
    ]),
    NotificationsModule,
    PortfolioModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsCronService],
  exports: [BookingsService],
})
export class BookingsModule {}
