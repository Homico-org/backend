# Real Payments - Go-Live Runbook (Flitt)

**Status:** the payment integration is **production-ready code**. Going live is a
_configuration + sandbox-test_ exercise, not a build. The provider is **Flitt**
(flitt.com, formerly Fondy); the only blocker is obtaining Flitt merchant
credentials.

The engine lives in `src/payments/` with a provider abstraction:
`PAYMENT_PROVIDER` selects `mock` (dev), `flitt` (live), or `disabled` (prod
before go-live). The factory **refuses `mock` in `NODE_ENV=production`** and
throws at boot, so fake payments can never ship by accident.

What's already done (verified):

- Flitt hosted-checkout integration (`flitt-payment.provider.ts`) implementing the
  shared `PaymentProvider` interface, so escrow / milestones / product-orders /
  premium all ride it unchanged.
- **Webhook signature verification** over the raw body. `rawBody: true` is enabled
  in `main.ts` (required so re-serialization can't break the signature). Forged
  callbacks are rejected.
- **Idempotent** webhook handler - terminal payment states are never reprocessed.
- Reconcile endpoints (`GET /payments/:id/reconcile`, per-entity variants) to
  fast-path status when a webhook is delayed.
- Return pages that poll reconcile and show paid / pending / failed:
  `orders/[id]/return`, `projects/[id]/pay/return`, `bookings/[id]/pay/return`,
  `pro/premium/return`.
- `.env.example` documents every required var.

**Escrow model:** Flitt does a NORMAL sale (no card preauth - those expire in
~7 days, too short for a renovation). Money settles into Homico's Flitt balance
and is HELD as escrow in our DB, then released/split to the pro on completion.
Commission is **5%** (`PLATFORM_FEE_RATE`), frozen per escrow. Pro payout at
launch is **manual** (admin marks the bank transfer from the `GE72…` settlement
account); Flitt's Withdrawal API can automate it later using the Credit key.

> Premium (the MVP) is a simple platform charge - no escrow, no payout. `flitt`
> powers it the same way; `grantPremium` flips the subscription on webhook
> success.

---

## Step 0 - Request from Flitt (the only blocker)

Open a Flitt merchant account and get, from the portal (Merchant settings →
Basic profile):

1. **Merchant ID** (numeric) → `FLITT_MERCHANT_ID`.
2. **Payment key** (signs payment operations, SECRET) → `FLITT_PAYMENT_KEY`.
3. **Sandbox / test access** - test merchant credentials + **test card numbers**.
4. **Settlement account** confirmation (where funds land) and currency = **GEL**.
5. **Refunds enabled** (needed for dispute / refund flows).
6. (Optional, later) **Credit private key** → `FLITT_CREDIT_KEY`, only for
   automated Withdrawal/p2p payouts. Leave blank while payouts are manual.

Secrets are NOT shared in chat. They go straight into the Render environment
(prod) or your local `.env` (sandbox), set by you.

---

## Step 1 - Sandbox test (NEVER test on live first)

In `backend/.env` (local), set sandbox values:

```
PAYMENT_PROVIDER=flitt
FLITT_MERCHANT_ID=<sandbox merchant id>
FLITT_PAYMENT_KEY=<sandbox payment key>
# FLITT_API_BASE=<sandbox api base>     # if Flitt gives a separate sandbox base
PUBLIC_BACKEND_URL=<a public tunnel to localhost:3001, e.g. ngrok>
FRONTEND_URL=http://localhost:3000
PAYMENT_TIMEOUT_MIN=30
```

Flitt's callback must reach `PUBLIC_BACKEND_URL/payments/webhooks/flitt`. On
localhost that means a tunnel (ngrok / cloudflared) - localhost is not reachable
from Flitt. We pass it as `server_callback_url` per order; register it in the
portal too if it asks.

Run the full loop and confirm each stage:

1. Restart backend (`npm run start`). It logs `Active payment provider: flitt` +
   `Flitt provider initialized`.
2. Buy premium / fund a milestone from the UI → you're redirected to Flitt's
   hosted page.
3. Pay with a **test card**.
4. Backend log shows the callback received + `Webhook processed: <order_id> ->
   succeeded`. (A "signature verification failed" WARN = wrong
   `FLITT_PAYMENT_KEY`.)
5. The return page flips to **Paid**; the order/escrow/premium status updates in
   the DB.
6. Test the failure path too (cancel / declined card) → `failed`/`cancelled`.

Do not proceed until both success and failure paths work in sandbox.

---

## Step 2 - Go live (Render env)

Set on the **backend** service (api.homico.ge):

```
PAYMENT_PROVIDER=flitt
FLITT_MERCHANT_ID=<LIVE merchant id>
FLITT_PAYMENT_KEY=<LIVE payment key>
PUBLIC_BACKEND_URL=https://api.homico.ge
FRONTEND_URL=https://homico.ge
PAYMENT_TIMEOUT_MIN=30
```

Deploy. Then a **1 ₾ real smoke test**: make one real payment, confirm it lands
and settles in the Flitt portal. Finally enable the frontend UI:

- Premium (the MVP): set `NEXT_PUBLIC_FEATURE_PREMIUM=true`.
- Escrow / bookings / shopping: keep `NEXT_PUBLIC_FEATURE_PAYMENTS` OFF until the
  marketplace-payout model is approved; flip on when ready.

---

## Step 3 - Monitoring & ops (already built)

- Admin → **Disputes** (`/admin/disputes`) and **Payouts** (`/admin/payouts`).
- Reconcile endpoints cover delayed webhooks.
- Watch backend logs for Flitt checkout errors and `signature verification failed`.

---

## Payments OFF on prod (before Flitt is live)

Production boots with payments **disabled** by default: leave `PAYMENT_PROVIDER`
unset (or set it to `disabled`) and the app starts normally with a
`DisabledPaymentProvider` that refuses every payment op - so nothing can be faked
and the backend never crashes for lack of a real provider. The frontend
additionally hides payment UI via `NEXT_PUBLIC_FEATURE_PREMIUM` /
`NEXT_PUBLIC_FEATURE_PAYMENTS` (unset on prod). When Flitt is live, set
`PAYMENT_PROVIDER=flitt` + the `FLITT_*` env.

## Rollback

To halt payments after going live, set `PAYMENT_PROVIDER=disabled` and redeploy
(the backend stays up; payment ops refuse). `mock` remains forbidden in
production (it fakes instant success). Per-feature, also flip the
`NEXT_PUBLIC_FEATURE_*` flags off on the frontend.

---

## Pre-flight checklist (tick before opening payments)

- [ ] Flitt merchant account live, refunds enabled, GEL settlement confirmed.
- [ ] Sandbox: success path verified end-to-end.
- [ ] Sandbox: failure/cancel path verified.
- [ ] Webhook signature verifies (no "signature verification failed" in logs).
- [ ] Render env set (`PAYMENT_PROVIDER=flitt`, `FLITT_*`, `PUBLIC_BACKEND_URL`, `FRONTEND_URL`).
- [ ] 1 ₾ live smoke test settled in the Flitt portal.
- [ ] Admin disputes/payouts dashboards reachable.
- [ ] Frontend flag on (`NEXT_PUBLIC_FEATURE_PREMIUM` for the premium MVP).
