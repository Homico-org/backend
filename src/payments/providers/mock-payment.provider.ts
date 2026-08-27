import { Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "crypto";
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
 * In-memory mock implementation of PaymentProvider for local dev and CI.
 *
 * Behavior:
 *  - createIntent immediately marks the intent SUCCEEDED in memory and
 *    returns a redirectUrl pointing at our own mock confirmation page
 *    (lives in the frontend at /bookings/[id]/pay/mock-confirm).
 *  - The mock confirmation page POSTs back to /payments/webhooks/mock
 *    which triggers verifyAndDecodeWebhook to return the succeeded state.
 *  - refund just records the refund in memory and returns a fake id.
 *  - fetchIntentStatus reads from the in-memory map.
 *
 * Use this as the active provider in dev until Flitt sandbox credentials are
 * provisioned (Task #8). Production should NEVER use this - the factory
 * refuses to return it when NODE_ENV=production.
 *
 * State is in-process - intents disappear on backend restart. That's fine
 * for dev; the booking flow handles "intent not found" the same way it
 * would handle a webhook delay or provider outage.
 */

interface MockIntentRecord {
  amountMinor: number;
  currency: string;
  capturedMinor: number;
  refundedMinor: number;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  metadata: Record<string, string>;
  returnUrl: string;
}

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name: PaymentProviderName = "mock";
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly intents = new Map<string, MockIntentRecord>();

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const intentId = `mock_${randomBytes(8).toString("hex")}`;
    // Auto-succeed immediately - dev wants instant feedback. The "real" UX
    // (redirect, pay, return) is simulated by the mock-confirm page.
    this.intents.set(intentId, {
      amountMinor: params.amountMinor,
      currency: params.currency,
      capturedMinor: params.amountMinor,
      refundedMinor: 0,
      status: "succeeded",
      metadata: params.metadata,
      returnUrl: params.returnUrl,
    });

    // Redirect URL. Bookings get the interactive mock-confirm page (simulate
    // success/failure). Other entity types (job-hire escrow, premium) have no
    // dedicated mock-confirm page, and the intent already auto-succeeded - so
    // bounce straight to the caller's returnUrl, whose reconcile-on-return path
    // finalizes exactly as the webhook would. Previously these all pointed at
    // `/bookings/undefined/pay/mock-confirm`, so the payment flow never opened.
    // Cleaning bookings (mobile) are pay-first: no booking row exists yet, so
    // there's no id for the web mock-confirm page and the mobile in-app browser
    // needs an absolute URL. The intent already auto-succeeded, so bounce to the
    // caller's returnUrl - the reconcile-on-return path finalizes it. The web
    // booking flow (real bookingId) still gets the interactive mock-confirm page.
    const redirectUrl =
      params.metadata.entityType === "booking" &&
      params.metadata.kind !== "cleaning_booking"
        ? `/bookings/${params.metadata.bookingId ?? "unknown"}/pay/mock-confirm?intent=${intentId}`
        : params.returnUrl;

    this.logger.log(
      `[mock] created intent ${intentId} amount=${params.amountMinor} ${params.currency} returnUrl=${params.returnUrl}`,
    );

    return { intentId, redirectUrl };
  }

  async verifyAndDecodeWebhook(
    rawBody: string,
    _headers: Record<string, string>,
  ): Promise<DecodedWebhook> {
    // Mock webhooks come from our own simulated-confirmation page so we
    // skip signature verification. Real providers MUST verify.
    let parsed: { intentId?: string; outcome?: "success" | "failure" };
    try {
      parsed = JSON.parse(rawBody) as {
        intentId?: string;
        outcome?: "success" | "failure";
      };
    } catch {
      throw new Error("mock webhook body is not valid JSON");
    }
    const intentId = parsed.intentId;
    if (!intentId) throw new Error("mock webhook missing intentId");

    const record = this.intents.get(intentId);
    if (!record) throw new Error(`mock intent ${intentId} not found`);

    const status: DecodedWebhook["status"] =
      parsed.outcome === "failure" ? "failed" : "succeeded";

    record.status = status === "succeeded" ? "succeeded" : "failed";
    record.capturedMinor =
      status === "succeeded" ? record.amountMinor : 0;
    this.intents.set(intentId, record);

    this.logger.log(`[mock] webhook ${intentId} status=${status}`);

    return {
      intentId,
      status,
      amountCapturedMinor: record.capturedMinor,
      rawProviderData: parsed,
    };
  }

  async fetchIntentStatus(
    intentId: string,
  ): Promise<FetchIntentStatusResult> {
    const record = this.intents.get(intentId);
    if (!record) {
      // Treat unknown intents as pending - the booking flow polls and will
      // eventually fall through to a timeout cancellation.
      return { status: "pending", amountCapturedMinor: 0 };
    }
    return {
      status: record.status,
      amountCapturedMinor: record.capturedMinor,
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const record = this.intents.get(params.intentId);
    if (!record) throw new Error(`mock intent ${params.intentId} not found`);
    if (record.status !== "succeeded") {
      throw new Error(
        `cannot refund intent ${params.intentId} with status ${record.status}`,
      );
    }
    const remaining = record.capturedMinor - record.refundedMinor;
    if (params.amountMinor > remaining) {
      throw new Error(
        `refund amount ${params.amountMinor} exceeds remaining ${remaining}`,
      );
    }
    record.refundedMinor += params.amountMinor;
    this.intents.set(params.intentId, record);

    const refundId = `mock_refund_${randomBytes(8).toString("hex")}`;
    this.logger.log(
      `[mock] refunded ${params.amountMinor} from ${params.intentId} -> ${refundId} (reason: ${params.reason})`,
    );
    return { refundId };
  }
}
