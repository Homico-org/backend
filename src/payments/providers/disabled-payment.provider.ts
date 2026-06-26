import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import {
  CreateIntentParams,
  CreateIntentResult,
  DecodedWebhook,
  FetchIntentStatusResult,
  PaymentProvider,
  PaymentProviderName,
  RefundParams,
  RefundResult,
} from "./payment-provider.interface";

/**
 * No-op provider for when payments are intentionally OFF for an environment -
 * e.g. production before the Flitt merchant account is live.
 *
 * Why it exists: the factory forbids the `mock` provider in production (mock
 * fakes instant success, which must never reach real users). But forbidding
 * mock meant production REQUIRED a real provider to even boot - so without Flitt
 * credentials the backend crashed at startup. This provider closes that gap:
 * it boots cleanly so the app starts, but refuses every payment operation with
 * a 503 so nothing can be faked or silently succeed.
 *
 * Select it with `PAYMENT_PROVIDER=disabled`; production also falls back to it
 * when `PAYMENT_PROVIDER` is unset. When Flitt goes live, set
 * `PAYMENT_PROVIDER=flitt` (+ the FLITT_* env) and this is no longer used.
 */
@Injectable()
export class DisabledPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "disabled";
  private readonly logger = new Logger(DisabledPaymentProvider.name);

  private off(op: string): never {
    this.logger.warn(`Payment op "${op}" called while payments are disabled`);
    throw new ServiceUnavailableException(
      "Payments are not enabled in this environment",
    );
  }

  async createIntent(_params: CreateIntentParams): Promise<CreateIntentResult> {
    this.off("createIntent");
  }

  async verifyAndDecodeWebhook(
    _rawBody: string,
    _headers: Record<string, string>,
  ): Promise<DecodedWebhook> {
    this.off("verifyAndDecodeWebhook");
  }

  async fetchIntentStatus(
    _intentId: string,
  ): Promise<FetchIntentStatusResult> {
    this.off("fetchIntentStatus");
  }

  async refund(_params: RefundParams): Promise<RefundResult> {
    this.off("refund");
  }
}
