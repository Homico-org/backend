import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Job, JobSchema } from '../jobs/schemas/job.schema';
import { Proposal, ProposalSchema } from '../jobs/schemas/proposal.schema';
import { SupportTicket, SupportTicketSchema } from '../support/schemas/support-ticket.schema';
import { Notification, NotificationSchema } from '../notifications/schemas/notification.schema';
import { InviteToken, InviteTokenSchema } from '../invite/schemas/invite-token.schema';
import { ProjectRequest, ProjectRequestSchema } from '../project-request/schemas/project-request.schema';
import { Order, OrderSchema } from '../product-orders/schemas/order.schema';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { ViewLog, ViewLogSchema } from '../users/schemas/view-log.schema';
import {
  ProfileChangeRequest,
  ProfileChangeRequestSchema,
} from '../users/schemas/profile-change-request.schema';
import { VerificationModule } from '../verification/verification.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Job.name, schema: JobSchema },
      { name: Proposal.name, schema: ProposalSchema },
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: InviteToken.name, schema: InviteTokenSchema },
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: ViewLog.name, schema: ViewLogSchema },
      {
        name: ProfileChangeRequest.name,
        schema: ProfileChangeRequestSchema,
      },
    ]),
    VerificationModule,
    UsersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
