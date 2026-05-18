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
    ]),
    VerificationModule,
    UsersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
