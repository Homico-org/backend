import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MilestonePaymentsService } from './milestone-payments.service';

/**
 * Auto-confirm milestone installments whose 7-day client-review window has
 * passed (pro marked done, client stayed silent). Escrow moves to
 * PENDING_RELEASE so the pro gets paid. Best-effort; failures log + continue.
 */
@Injectable()
export class MilestonePaymentsCronService {
  private readonly logger = new Logger(MilestonePaymentsCronService.name);

  constructor(private readonly service: MilestonePaymentsService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'milestone-payments-auto-confirm' })
  async autoConfirm() {
    try {
      await this.service.autoConfirmDue();
    } catch (err) {
      this.logger.warn(`auto-confirm sweep failed: ${(err as Error).message}`);
    }
  }
}
