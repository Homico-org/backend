import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { Dispute, DisputeSchema } from '../payments/schemas/dispute.schema';
import {
  ProjectRequest,
  ProjectRequestSchema,
} from '../project-request/schemas/project-request.schema';
import { MilestonePaymentsController } from './milestone-payments.controller';
import { MilestonePaymentsCronService } from './milestone-payments.cron';
import { MilestonePaymentsService } from './milestone-payments.service';
import {
  MilestonePayment,
  MilestonePaymentSchema,
} from './schemas/milestone-payment.schema';

/**
 * Milestone / escrow payments for project engagements. Rides the global
 * PaymentsModule (charge, escrow, dispute, payout) - we only add the schedule
 * lifecycle. ProjectRequest is registered read-only here to resolve an
 * engagement's assigned pro + client at propose/approve time.
 */
@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: MilestonePayment.name, schema: MilestonePaymentSchema },
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
      { name: Dispute.name, schema: DisputeSchema },
    ]),
  ],
  controllers: [MilestonePaymentsController],
  providers: [MilestonePaymentsService, MilestonePaymentsCronService],
  exports: [MilestonePaymentsService],
})
export class MilestonePaymentsModule {}
