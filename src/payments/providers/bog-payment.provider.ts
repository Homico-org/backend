import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createVerify } from 'crypto';
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
 * Bank of Georgia E-Commerce payment provider.
 *
 * Implements PaymentProvider against BoG's OAuth2-secured API (introduced
 * 2022, replaces the legacy MD5-signed POST gateway).
 *
 * Flow:
 *   1. createIntent posts an order to /payments/v1/ecommerce/orders and
 *      returns BoG's order_id + the redirect URL the user is sent to.
 *   2. User pays on BoG's hosted page.
 *   3. BoG hits our webhook (POST /payments/webhooks/bog) with a signed
 *      payload. verifyAndDecodeWebhook verifies the RSA-SHA256 signature
 *      against BoG's public key before trusting any of the data.
 *   4. We can also poll GET /receipt/{order_id} if the webhook is delayed
 *      (used by fetchIntentStatus during the user's return-URL polling).
 *
 * Env vars (all required when PAYMENT_PROVIDER=bog):
 *   BOG_CLIENT_ID         - OAuth2 client id (from BoG merchant portal)
 *   BOG_CLIENT_SECRET     - OAuth2 client secret
 *   BOG_PUBLIC_KEY        - PEM-encoded RSA public key for webhook
 *                           signature verification. The PEM lives in env
 *                           as a single line with \n escapes; we restore
 *                           the newlines at init.
 *   BOG_OAUTH_URL         - optional override; defaults to BoG's prod URL
 *   BOG_API_BASE          - optional override; defaults to BoG's prod URL
 *
 * NB: this provider is fail-fast: missing/malformed env vars throw at
 * module init so a misconfigured deploy doesn't silently route real
 * payments to BoG's sandbox or vice-versa.
 */

const DEFAULT_OAUTH_URL =
  'https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token';
const DEFAULT_API_BASE = 'https://api.bog.ge/payments/v1';

interface OAuthTokenResponse {
  access_token: string;
  expires_in: number; // seconds
  token_type: string;
}

interface BogCreateOrderResponse {
  id: string;
  _links?: {
    redirect?: { href?: string };
    details?: { href?: string };
  };
}

/** Subset of BoG's order detail response - we only read what we need. */
interface BogOrderDetail {
  order_id: string;
  order_status?: {
    key?: string; // 'created' | 'pending' | 'completed' | 'rejected' | 'refunded' | ...
  };
  payment_detail?: {
    transfer_amount?: number;
    transaction_id?: string;
  };
  purchase_units?: {
    request_amount?: string;
  };
  external_order_id?: string;
}

interface BogRefundResponse {
  amount?: number;
  refund_id?: string;
}

@Injectable()
export class BogPaymentProvider implements PaymentProvider, OnModuleInit {
  readonly name: PaymentProviderName = 'bog';
  private readonly logger = new Logger(BogPaymentProvider.name);

  private clientId!: string;
  private clientSecret!: string;
  private publicKeyPem!: string;
  private oauthUrl!: string;
  private apiBase!: string;

  private cachedToken: { value: string; expiresAtMs: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // Only validate env when this provider is actually selected. The factory
    // also checks PAYMENT_PROVIDER, but the provider is constructed unconditionally
    // by Nest so we have to guard here too.
    const active = (this.configService.get<string>('PAYMENT_PROVIDER') || '')
      .toLowerCase();
    if (active !== 'bog') return;

    const clientId = this.configService.get<string>('BOG_CLIENT_ID');
    const clientSecret = this.configService.get<string>('BOG_CLIENT_SECRET');
    const publicKey = this.configService.get<string>('BOG_PUBLIC_KEY');

    if (!clientId || !clientSecret || !publicKey) {
      throw new Error(
        'BoG payment provider requires BOG_CLIENT_ID, BOG_CLIENT_SECRET, and BOG_PUBLIC_KEY env vars',
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    // Render env vars don't preserve newlines - we store the PEM with
    // literal \n sequences and restore them here.
    this.publicKeyPem = publicKey.replace(/\\n/g, '\n');
    this.oauthUrl =
      this.configService.get<string>('BOG_OAUTH_URL') || DEFAULT_OAUTH_URL;
    this.apiBase =
      this.configService.get<string>('BOG_API_BASE') || DEFAULT_API_BASE;

    if (!this.publicKeyPem.includes('BEGIN PUBLIC KEY')) {
      throw new Error(
        'BOG_PUBLIC_KEY does not look like a PEM-encoded public key',
      );
    }

    this.logger.log(`BoG provider initialized. API base: ${this.apiBase}`);
  }

  async createIntent(params: CreateIntentParams): Promise<CreateIntentResult> {
    const token = await this.getAccessToken();

    // BoG expects amounts as decimal strings, currency as ISO 4217, and
    // exposes optional locale per item. We pass minimal data - one
    // purchase unit covering the whole booking; itemization can come later.
    const body = {
      callback_url: this.buildCallbackUrl(params),
      external_order_id: params.metadata.entityId ?? '',
      purchase_units: {
        currency: params.currency,
        total_amount: (params.amountMinor / 100).toFixed(2),
        basket: [
          {
            quantity: 1,
            unit_price: (params.amountMinor / 100).toFixed(2),
            product_id: params.metadata.entityId ?? 'booking',
          },
        ],
      },
      redirect_urls: {
        success: params.returnUrl,
        fail: params.cancelUrl,
      },
    };

    const res = await fetch(`${this.apiBase}/ecommerce/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept-Language': 'ka',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `BoG createOrder failed ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as BogCreateOrderResponse;
    const redirectUrl = data._links?.redirect?.href;
    if (!data.id || !redirectUrl) {
      throw new Error(
        `BoG createOrder returned malformed response: ${JSON.stringify(data).slice(0, 300)}`,
      );
    }

    this.logger.log(
      `Created BoG order ${data.id} for ${params.metadata.entityType}:${params.metadata.entityId} amount=${params.amountMinor}`,
    );
    return { intentId: data.id, redirectUrl };
  }

  /**
   * Verify BoG's webhook signature against our cached public key, then
   * parse the JSON body and map to our standard DecodedWebhook shape.
   *
   * BoG sends `Callback-Signature` header (base64 RSA-SHA256 signature
   * over the raw body bytes). Reject on missing or invalid signature.
   */
  async verifyAndDecodeWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<DecodedWebhook> {
    const signature =
      headers['callback-signature'] ?? headers['Callback-Signature'];
    if (!signature) {
      throw new UnauthorizedException('Missing Callback-Signature header');
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(rawBody);
    verifier.end();

    const valid = verifier.verify(this.publicKeyPem, signature, 'base64');
    if (!valid) {
      this.logger.warn('BoG webhook signature verification failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Body shape: { event: 'order_payment', body: { ...order detail... } }
    interface BogWebhookEnvelope {
      event?: string;
      body?: BogOrderDetail;
    }
    let envelope: BogWebhookEnvelope;
    try {
      envelope = JSON.parse(rawBody) as BogWebhookEnvelope;
    } catch {
      throw new Error('BoG webhook body is not valid JSON');
    }

    const order = envelope.body;
    if (!order?.order_id) {
      throw new Error('BoG webhook missing order_id');
    }

    const mapped = this.mapBogStatus(order.order_status?.key);
    // The webhook contract only allows terminal statuses. BoG shouldn't
    // webhook on pending in practice (their event triggers fire on
    // completion / rejection / cancellation only). If somehow it does,
    // treat as failed to fail-safe rather than throwing - that way the
    // webhook returns 200 OK and BoG won't retry indefinitely.
    let webhookStatus: 'succeeded' | 'failed' | 'cancelled';
    if (mapped === 'pending') {
      this.logger.warn(
        `BoG webhook arrived with pending status for ${order.order_id} - treating as failed`,
      );
      webhookStatus = 'failed';
    } else {
      webhookStatus = mapped;
    }

    return {
      intentId: order.order_id,
      status: webhookStatus,
      amountCapturedMinor: this.extractCapturedMinor(order),
      rawProviderData: envelope,
    };
  }

  async fetchIntentStatus(intentId: string): Promise<FetchIntentStatusResult> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.apiBase}/receipt/${intentId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      // Provider doesn't know the order yet - treat as pending. Caller
      // (PaymentsService.reconcileFromReturnUrl) polls again.
      return { status: 'pending', amountCapturedMinor: 0 };
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `BoG getOrder failed ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as BogOrderDetail;
    const generic = this.mapBogStatus(data.order_status?.key);
    // mapBogStatus collapses 'pending' + 'created' both to 'pending', which
    // matches the FetchIntentStatusResult contract.
    return {
      status: generic,
      amountCapturedMinor: this.extractCapturedMinor(data),
    };
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    const token = await this.getAccessToken();
    const res = await fetch(
      `${this.apiBase}/payment/refund/${params.intentId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: (params.amountMinor / 100).toFixed(2),
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `BoG refund failed ${res.status}: ${text.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as BogRefundResponse;
    const refundId = data.refund_id ?? `bog_refund_${params.intentId}_${Date.now()}`;
    this.logger.log(
      `BoG refund issued ${refundId} for intent ${params.intentId} amount=${params.amountMinor} reason="${params.reason}"`,
    );
    return { refundId };
  }

  // ---- internals ----

  /**
   * OAuth2 client_credentials grant. Token is cached in memory until 60s
   * before its declared expiry, then refreshed lazily on next call.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAtMs > now + 60_000) {
      return this.cachedToken.value;
    }

    const form = new URLSearchParams();
    form.set('grant_type', 'client_credentials');

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );

    const res = await fetch(this.oauthUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`BoG OAuth failed ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as OAuthTokenResponse;
    if (!data.access_token || !data.expires_in) {
      throw new Error('BoG OAuth response missing access_token / expires_in');
    }

    this.cachedToken = {
      value: data.access_token,
      expiresAtMs: now + data.expires_in * 1000,
    };
    return data.access_token;
  }

  /**
   * Map BoG's status keys to the generic PaymentProvider status union.
   * Unknown statuses default to 'failed' to fail-safe (better to surface
   * a payment-failed UI than to silently mark a not-yet-completed payment
   * as succeeded).
   */
  private mapBogStatus(
    key: string | undefined,
  ): 'pending' | 'succeeded' | 'failed' | 'cancelled' {
    switch (key) {
      case 'created':
      case 'pending':
      case 'in_progress':
        return 'pending';
      case 'completed':
      case 'partial_completed':
        return 'succeeded';
      case 'rejected':
      case 'blocked':
      case 'expired':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      default:
        // Unknown -> treat as failed. Log so we notice if BoG adds a new
        // status we should handle.
        this.logger.warn(`Unknown BoG order_status key: ${key}`);
        return 'failed';
    }
  }

  private extractCapturedMinor(order: BogOrderDetail): number {
    const transferred = order.payment_detail?.transfer_amount;
    if (typeof transferred === 'number') {
      return Math.round(transferred * 100);
    }
    const requested = order.purchase_units?.request_amount;
    if (typeof requested === 'string') {
      const parsed = parseFloat(requested);
      if (!Number.isNaN(parsed)) return Math.round(parsed * 100);
    }
    return 0;
  }

  /**
   * BoG hits this URL on payment status changes. Builds the absolute URL
   * pointing at our generic webhook handler that routes by provider name.
   * The frontend's NEXT_PUBLIC_API_URL is the publicly-reachable origin -
   * we read PUBLIC_BACKEND_URL on the backend to keep them aligned.
   */
  private buildCallbackUrl(_params: CreateIntentParams): string {
    const apiBase =
      this.configService.get<string>('PUBLIC_BACKEND_URL') ||
      'http://localhost:3001';
    return `${apiBase}/payments/webhooks/bog`;
  }
}
