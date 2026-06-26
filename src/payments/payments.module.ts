import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { FlittPaymentProvider } from "./providers/flitt-payment.provider";
import { MockPaymentProvider } from "./providers/mock-payment.provider";
import { DisabledPaymentProvider } from "./providers/disabled-payment.provider";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";
import { Dispute, DisputeSchema } from "./schemas/dispute.schema";
import { Escrow, EscrowSchema } from "./schemas/escrow.schema";
import { Payment, PaymentSchema } from "./schemas/payment.schema";
import { Payout, PayoutSchema } from "./schemas/payout.schema";
import { User, UserSchema } from "../users/schemas/user.schema";
import { NotificationsModule } from "../notifications/notifications.module";
import { PremiumCronService } from "./premium-cron.service";

/**
 * Global so feature modules (BookingsModule, JobsModule) can inject
 * `PaymentsService` without re-importing this module. Payments are a
 * cross-cutting concern - any feature that wants to take or refund money
 * goes through us, and we don't want boilerplate at every consumer.
 *
 * Provider implementations (MockPaymentProvider, FlittPaymentProvider)
 * are providers here but NOT exported - consumers should go through
 * PaymentsService, never call providers directly. The factory hides the
 * choice of provider behind a uniform interface.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Escrow.name, schema: EscrowSchema },
      { name: Dispute.name, schema: DisputeSchema },
      { name: Payout.name, schema: PayoutSchema },
      // Used by PaymentsService to read bank-account snapshots when
      // computing pending payouts. Read-only here; mutations live in
      // UsersService (its own MongooseModule.forFeature).
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderFactory,
    MockPaymentProvider,
    FlittPaymentProvider,
    DisabledPaymentProvider,
    PremiumCronService,
  ],
  exports: [PaymentsService, PaymentProviderFactory],
})
export class PaymentsModule {}
