import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import {
  CreateIntentParams,
  CreateIntentResult,
  DecodedWebhook,
  FetchIntentStatusResult,
  PaymentProvider,
  PaymentProviderName,
  RefundParams,
  RefundResult,
} from './payment-provider.interface';

/**
 * Flitt (flitt.com, formerly Fondy) payment provider.
 *
 * Flitt is a hosted-checkout gateway with the classic Fondy request/response
 * envelope: every call posts `{ request: { ...params, signature } }` and gets
 * back `{ response: { ... } }`. Requests are signed with SHA1 over the secret
 * key + the request's values sorted by key and joined with `|`.
 *
 * Escrow model (IMPORTANT): we do a NORMAL sale here, NOT a card preauth.
 * A literal card hold expires in ~7 days, which can't survive a multi-week
 * renovation job. So the money is captured into Homico's Flitt settlement
 * balance immediately and HELD as escrow in our own DB (see Escrow schema);
 * it is released/split to the pro on completion. Same "blocked until done"
 * UX, mechanics that survive a long job.
 *
 * Flow:
 *   1. createIntent generates a unique order_id, posts it to
 *      `${apiBase}/checkout/url`, and returns Flitt's hosted checkout_url.
 *      We hand `order_id` back as our intentId - Flitt echoes it on the
 *      callback so we can correlate (it is our (provider, providerIntentId)).
 *   2. User pays on Flitt's hosted page.
 *   3. Flitt POSTs our server callback (POST /payments/webhooks/flitt).
 *      verifyAndDecodeWebhook recomputes the SHA1 signature over the payload
 *      and rejects forgeries before trusting any field.
 *   4. fetchIntentStatus polls `${apiBase}/status/order_id` when the user
 *      returns before the callback lands (return-page reconcile).
 *   5. refund posts to `${apiBase}/reverse/order_id` (Flitt reversal).
 *
 * Env vars (required when PAYMENT_PROVIDER=flitt):
 *   FLITT_MERCHANT_ID   - numeric merchant id from the Flitt portal
 *   FLITT_PAYMENT_KEY   - "Payment key" secret used to sign payment ops
 * Optional:
 *   FLITT_CREDIT_KEY    - "Credit private key" (for future Withdrawal/p2p
 *                         auto-payouts; unused while payout is manual)
 *   FLITT_API_BASE      - override; defaults to https://pay.flitt.com/api
 *
 * Fail-fast: missing/malformed env throws at module init so a misconfigured
 * deploy never silently routes real money to the wrong place.
 */

const DEFAULT_API_BASE = 'https://pay.flitt.com/api';

/**
 * Flitt/Fondy request signature: SHA1(secretKey | v1 | v2 | ...) where the
 * values are the request params (excluding `signature`, the response signature
 * field, and empty values) sorted by key name and joined with `|`. Lowercase
 * hex. Exported so the self-test script signs identically to the provider -
 * one source of truth, no drift.
 */
export function flittSignature(
  params: Record<string, string | number | undefined | null>,
  key: string,
): string {
  const parts = Object.entries(params)
    .filter(
      ([k, v]) =>
        k !== 'signature' &&
        k !== 'response_signature_string' &&
        v !== undefined &&
        v !== null &&
        `${v}` !== '',
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, v]) => `${v}`);

  return createHash('sha1')
    .update([key, ...parts].join('|'), 'utf8')
    .digest('hex');
}

interface FlittEnvelope<T> {
  response: T & {
    response_status?: string; // 'success' | 'failure'
    error_code?: number | string;
    error_message?: string;
  };
}

interface FlittCheckoutResponse {
  checkout_url?: string;
  payment_id?: string | number;
}

interface FlittOrderStatusResponse {
  order_status?: string; // created|processing|declined|approved|expired|reversed
  amount?: string | number;
  currency?: string;
}

interface FlittReverseResponse {
  reverse_status?: string; // approved|declined|...
  reversal_id?: string | number;
}

@Injectable()
export class FlittPaymentProvider implements PaymentProvider, OnModuleInit {
  readonly name: PaymentProviderName = 'flitt';
  private readonly logger = new Logger(FlittPaymentProvider.name);

  private merchantId!: string;
  private paymentKey!: string;
  private creditKey?: string;
  private apiBase!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // The provider is constructed unconditionally by Nest, so only validate
    // env when Flitt is actually the selected provider.
    const active = (this.configService.get<string>('PAYMENT_PROVIDER') || '')
      .toLowerCase();
    if (active !== 'flitt') return;

    const merchantId = this.configService.get<string>('FLITT_MERCHANT_ID');
    const paymentKey = this.configService.get<string>('FLITT_PAYMENT_KEY');

    const missing = [
      !merchantId?.trim() && 'FLITT_MERCHANT_ID',
      !paymentKey?.trim() && 'FLITT_PAYMENT_KEY',
    ].filter(Boolean);
    if (missing.length) {
      throw new Error(
        `PAYMENT_PROVIDER=flitt but missing env: ${missing.join(', ')}. ` +
          `Set it in backend/.env (Flitt portal -> Merchant settings -> Basic profile), ` +
          `or use PAYMENT_PROVIDER=mock to run the backend without Flitt.`,
      );
    }
    if (!/^\d+$/.test(merchantId.trim())) {
      throw new Error('FLITT_MERCHANT_ID must be numeric');
    }

    this.merchantId = merchantId.trim();
    this.paymentKey = paymentKey;
    this.creditKey = this.configService.get<string>('FLITT_CREDIT_KEY');
    this.apiBase =
      this.configService.get<string>('FLITT_API_BASE') || DEFAULT_API_BASE;

    this.logger.log(`Flitt provider initialized. API base: ${this.apiBase}`);
  }

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    // We own the order_id and it MUST be unique per attempt (Flitt rejects a
    // re-used order_id). Carry the entity in the prefix for dashboard
    // readability; the UUID guarantees uniqueness across retries.
    const orderId = `hm-${params.metadata.entityType ?? 'pay'}-${params.metadata.entityId ?? 'x'}-${randomUUID()}`;

    const request: Record<string, string | number> = {
      order_id: orderId,
      merchant_id: this.merchantId,
      order_desc:
        params.description ||
        `Homico ${params.metadata.entityType ?? ''} ${params.metadata.entityId ?? ''}`.trim(),
      // Flitt amounts are integer minor units (tetri for GEL) - same as ours.
      amount: params.amountMinor,
      currency: params.currency,
      server_callback_url: this.callbackUrl(),
      // Flitt redirects the customer back via POST; sending them straight to a
      // Next.js page route 500s ("Invalid Server Actions request"). Bounce
      // through a route handler that 303s to the real GET return page.
      response_url: this.bounceUrl(params.returnUrl),
      lang: 'ka',
    };
    if (params.payerEmail) request.sender_email = params.payerEmail;

    const signed = { ...request, signature: this.sign(request, this.paymentKey) };

    const data = await this.post<FlittCheckoutResponse>(
      `${this.apiBase}/checkout/url`,
      signed,
    );

    if (data.response_status !== 'success' || !data.checkout_url) {
      throw new Error(
        `Flitt checkout failed: ${data.error_code ?? ''} ${data.error_message ?? JSON.stringify(data).slice(0, 200)}`,
      );
    }

    this.logger.log(
      `Created Flitt order ${orderId} for ${params.metadata.entityType}:${params.metadata.entityId} amount=${params.amountMinor}`,
    );
    return { intentId: orderId, redirectUrl: data.checkout_url };
  }

  /**
   * Flitt POSTs the result to our server_callback_url. The body may arrive as
   * JSON or as form-encoded; we handle both, then recompute the SHA1 signature
   * over every field except `signature`/`response_signature_string` and reject
   * on mismatch before trusting anything.
   */
  async verifyAndDecodeWebhook(
    rawBody: string,
    _headers: Record<string, string>,
  ): Promise<DecodedWebhook> {
    const fields = this.parseCallbackBody(rawBody);

    const provided = fields['signature'];
    if (!provided) {
      throw new UnauthorizedException('Missing Flitt callback signature');
    }

    const toSign: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'signature' || k === 'response_signature_string') continue;
      toSign[k] = v;
    }
    const expected = this.sign(toSign, this.paymentKey);
    if (expected.toLowerCase() !== provided.toLowerCase()) {
      this.logger.warn('Flitt callback signature verification failed');
      throw new UnauthorizedException('Invalid Flitt callback signature');
    }

    const orderId = fields['order_id'];
    if (!orderId) {
      throw new Error('Flitt callback missing order_id');
    }

    const mapped = this.mapStatus(fields['order_status']);
    // The DecodedWebhook contract only carries terminal states. Flitt's server
    // callback fires on terminal transitions (approved/declined/expired/
    // reversed); if a non-terminal one somehow arrives, fail-safe so the
    // handler still returns 200 and Flitt stops retrying. The return-page
    // reconcile (fetchIntentStatus) is the recovery path for that edge.
    let status: 'succeeded' | 'failed' | 'cancelled';
    if (mapped === 'pending') {
      this.logger.warn(
        `Flitt callback arrived with non-terminal status for ${orderId} - treating as failed`,
      );
      status = 'failed';
    } else {
      status = mapped;
    }

    return {
      intentId: orderId,
      status,
      amountCapturedMinor: this.toMinor(fields['amount']),
      rawProviderData: fields,
    };
  }

  async fetchIntentStatus(intentId: string): Promise<FetchIntentStatusResult> {
    const request: Record<string, string | number> = {
      order_id: intentId,
      merchant_id: this.merchantId,
    };
    const signed = { ...request, signature: this.sign(request, this.paymentKey) };

    const data = await this.post<FlittOrderStatusResponse>(
      `${this.apiBase}/status/order_id`,
      signed,
    );

    // Unknown order yet (e.g. user returned before Flitt registered it) ->
    // pending, so PaymentsService keeps polling.
    if (data.response_status === 'failure') {
      return { status: 'pending', amountCapturedMinor: 0 };
    }

    return {
      status: this.mapStatus(data.order_status),
      amountCapturedMinor: this.toMinor(data.amount),
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const request: Record<string, string | number> = {
      order_id: params.intentId,
      merchant_id: this.merchantId,
      amount: params.amountMinor,
      currency: 'GEL',
    };
    const signed = { ...request, signature: this.sign(request, this.paymentKey) };

    const data = await this.post<FlittReverseResponse>(
      `${this.apiBase}/reverse/order_id`,
      signed,
    );

    const ok =
      data.response_status === 'success' &&
      (data.reverse_status === 'approved' || data.reverse_status === 'success');
    if (!ok) {
      throw new Error(
        `Flitt reverse failed: ${data.error_code ?? ''} ${data.error_message ?? data.reverse_status ?? ''}`,
      );
    }

    const refundId =
      data.reversal_id != null
        ? String(data.reversal_id)
        : `flitt_reverse_${params.intentId}_${Date.now()}`;
    this.logger.log(
      `Flitt reverse issued ${refundId} for ${params.intentId} amount=${params.amountMinor} reason="${params.reason}"`,
    );
    return { refundId };
  }

  // ---- internals ----

  /**
   * Flitt/Fondy signature: SHA1(secretKey | v1 | v2 | ...) where the values
   * are the request's params (excluding signature + empty values) sorted by
   * key name and joined with `|`. Returns lowercase hex.
   */
  private sign(
    params: Record<string, string | number | undefined | null>,
    key: string,
  ): string {
    return flittSignature(params, key);
  }

  /** Callback body can be JSON `{...}` or form-encoded `a=1&b=2`. */
  private parseCallbackBody(rawBody: string): Record<string, string> {
    const trimmed = (rawBody || '').trim();
    if (trimmed.startsWith('{')) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        // Some Flitt setups wrap the payload as { response: {...} }.
        const payload =
          obj && typeof obj === 'object' && 'response' in obj
            ? (obj.response as Record<string, unknown>)
            : obj;
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(payload)) {
          if (v !== null && v !== undefined) out[k] = String(v);
        }
        return out;
      } catch {
        // fall through to form parsing
      }
    }
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(trimmed)) out[k] = v;
    return out;
  }

  private mapStatus(
    status: string | undefined,
  ): 'pending' | 'succeeded' | 'failed' | 'cancelled' {
    switch ((status || '').toLowerCase()) {
      case 'created':
      case 'processing':
        return 'pending';
      case 'approved':
        return 'succeeded';
      case 'declined':
      case 'expired':
        return 'failed';
      case 'reversed':
        return 'cancelled';
      default:
        this.logger.warn(`Unknown Flitt order_status: ${status}`);
        return 'failed';
    }
  }

  private toMinor(amount: string | number | undefined): number {
    if (typeof amount === 'number') return Math.round(amount);
    if (typeof amount === 'string' && amount.trim() !== '') {
      const n = Number(amount);
      if (!Number.isNaN(n)) return Math.round(n);
    }
    return 0;
  }

  private callbackUrl(): string {
    const base =
      this.configService.get<string>('PUBLIC_BACKEND_URL') ||
      'http://localhost:3001';
    return `${base}/payments/webhooks/flitt`;
  }

  /**
   * Wrap the frontend return URL in our POST-accepting bouncer so Flitt's
   * POST redirect doesn't hit a Next.js page route directly (which 500s).
   * The bouncer 303s the browser on to `returnUrl` as a GET.
   */
  private bounceUrl(returnUrl: string): string {
    try {
      const origin = new URL(returnUrl).origin;
      return `${origin}/api/payments/return?to=${encodeURIComponent(returnUrl)}`;
    } catch {
      return returnUrl;
    }
  }

  private async post<T>(
    url: string,
    request: Record<string, string | number>,
  ): Promise<FlittEnvelope<T>['response']> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Flitt ${url} failed ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as FlittEnvelope<T>;
    if (!json || !json.response) {
      throw new Error(
        `Flitt ${url} returned malformed envelope: ${JSON.stringify(json).slice(0, 200)}`,
      );
    }
    return json.response;
  }
}
