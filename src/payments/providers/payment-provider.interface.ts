/**
 * Abstraction over a payment provider (BoG, TBC, Pay.ge, Stripe, Mock).
 *
 * Phase 1 ships with MockPaymentProvider (instant success, no external
 * dependency). Phase 3 adds the real BoG implementation. The interface is
 * intentionally narrow - just the operations Homico's escrow lifecycle
 * needs - to keep new providers cheap to add.
 *
 * All money amounts are MINOR units of the currency (tetri for GEL).
 * Providers are responsible for converting to their native API format if
 * they expect major units (e.g. Stripe wants cents, BoG wants tetri).
 */

export type PaymentProviderName =
  | "mock"
  | "bog"
  | "tbc"
  | "pay-ge"
  | "stripe"
  // Payments intentionally off for this environment (boots, but refuses every
  // operation). See DisabledPaymentProvider.
  | "disabled";

export interface CreateIntentParams {
  amountMinor: number;
  currency: "GEL";
  description: string;
  /** Internal IDs we want echoed back in webhook payloads. */
  metadata: Record<string, string>;
  /** Where to send the user after they finish/cancel at the provider. */
  returnUrl: string;
  cancelUrl: string;
  /** The end-user paying. Some providers want this for 3DS / fraud checks. */
  payerUserId: string;
  payerEmail?: string;
  payerPhone?: string;
}

export interface CreateIntentResult {
  /** Provider's canonical reference for this payment (becomes Payment.providerIntentId). */
  intentId: string;
  /** URL to redirect the user to (provider-hosted page). */
  redirectUrl: string;
}

export interface DecodedWebhook {
  intentId: string;
  status: "succeeded" | "failed" | "cancelled";
  amountCapturedMinor: number;
  /** Untyped raw payload kept for audit / debugging. */
  rawProviderData: unknown;
}

export interface FetchIntentStatusResult {
  status: "pending" | "succeeded" | "failed" | "cancelled";
  amountCapturedMinor: number;
}

export interface RefundParams {
  intentId: string;
  amountMinor: number;
  reason: string;
}

export interface RefundResult {
  refundId: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;

  /**
   * Reserve money and return a hosted-page URL to redirect the user to.
   * The actual capture happens via webhook OR the user returning to our
   * site and us re-checking status.
   */
  createIntent(params: CreateIntentParams): Promise<CreateIntentResult>;

  /**
   * Called from the webhook controller. MUST verify the request signature
   * against the provider's public key / shared secret before returning a
   * decoded payload. Throws on signature mismatch.
   */
  verifyAndDecodeWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<DecodedWebhook>;

  /**
   * Re-check intent status from the provider's API. Used when the user
   * returns to our return URL but the webhook hasn't arrived yet (or as a
   * fallback if webhooks failed entirely).
   */
  fetchIntentStatus(intentId: string): Promise<FetchIntentStatusResult>;

  /**
   * Issue a refund (full or partial) against a previously succeeded intent.
   * Returns the provider's refund reference.
   */
  refund(params: RefundParams): Promise<RefundResult>;
}
