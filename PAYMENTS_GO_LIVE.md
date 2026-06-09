# Real Payments - Go-Live Runbook (Bank of Georgia)

**Status as of audit:** the payment integration is **production-ready code**. Going
live is a *configuration + sandbox-test* exercise, not a build. The only blocker
is obtaining Bank of Georgia (BoG) merchant credentials.

The engine lives in `src/payments/` with a provider abstraction:
`PAYMENT_PROVIDER` selects `mock` (dev) or `bog` (real). The factory **refuses
`mock` in `NODE_ENV=production`** and throws at boot, so fake payments can never
ship by accident.

What's already done (verified):
- BoG modern OAuth E-Commerce API (`bog-payment.provider.ts`).
- **Webhook signature verification** - RSA-SHA256 over the raw body using
  `BOG_PUBLIC_KEY`; forged callbacks are rejected (`401`). `rawBody: true` is
  enabled in `main.ts` (required for this).
- **Idempotent** webhook handler - terminal payment states are never reprocessed.
- Reconcile endpoints (`GET /payments/:id/reconcile`, per-entity variants) to
  fast-path status when a webhook is delayed.
- Return pages that poll reconcile and show paid / pending / failed:
  `orders/[id]/return`, `projects/[id]/pay/return`, `bookings/[id]/pay/return`.
- Escrow / milestones / product-orders all ride this engine.
- `.env.example` documents every required var.

---

## Step 0 - Request from Bank of Georgia (the only blocker)

Open a merchant account with BoG's **E-Commerce / online payments** product (the
modern `api.bog.ge` OAuth gateway, a.k.a. BoG iPay e-commerce). Ask specifically
for, in writing:

1. **OAuth2 credentials** - `client_id` and `client_secret`.
   → maps to `BOG_CLIENT_ID`, `BOG_CLIENT_SECRET`.
2. **Callback signing public key** (PEM) - the RSA public key BoG signs payment
   callbacks with. → maps to `BOG_PUBLIC_KEY`.
3. **Sandbox / test access** - separate sandbox `client_id`/`secret`, the sandbox
   API + OAuth base URLs, and **test card numbers**.
4. **Merchant dashboard access** to register our callback + redirect URLs.
5. **Settlement account** confirmation (where funds land) and supported
   currency = **GEL**.
6. **Refunds enabled** on the account (needed for dispute / refund flows).

You will NOT share these secrets in chat. They go straight into the Render
environment (prod) or your local `.env` (sandbox), set by you.

---

## Step 1 - Sandbox test (NEVER test on live first)

In `backend/.env` (local), set sandbox values:

```
PAYMENT_PROVIDER=bog
BOG_CLIENT_ID=<sandbox client id>
BOG_CLIENT_SECRET=<sandbox client secret>
BOG_PUBLIC_KEY=<sandbox PEM public key>     # single line, \n-escaped, or real newlines
BOG_OAUTH_URL=<sandbox oauth url from BoG>
BOG_API_BASE=<sandbox api base from BoG>
PUBLIC_BACKEND_URL=<a public tunnel to localhost:3001, e.g. ngrok>   # BoG must reach the webhook
FRONTEND_URL=http://localhost:3000
PAYMENT_TIMEOUT_MIN=30
```

Note: BoG's webhook must reach `PUBLIC_BACKEND_URL/payments/webhooks/bog`. On
localhost that means a tunnel (ngrok / cloudflared) - localhost is not reachable
from BoG. Register that tunnel URL as the callback in the BoG sandbox dashboard.

Run the full loop and confirm each stage:
1. Restart backend (`npm run start`). It should log `Active payment provider: bog`
   and `BoG provider initialized. API base: <sandbox>`.
2. Create a real order / fund a milestone from the UI → you're redirected to BoG.
3. Pay with a **test card**.
4. Backend log shows the webhook received + `Webhook processed: ... -> succeeded`.
   (A `401`/"signature verification failed" here = wrong `BOG_PUBLIC_KEY`.)
5. The return page flips to **Paid**; the order/escrow status updates in the DB.
6. Test the failure path too (cancel / declined card) → `failed`/`cancelled`.

Do not proceed until both success and failure paths work in sandbox.

---

## Step 2 - Register production URLs with BoG

- **Webhook (callback):** `https://api.homico.ge/payments/webhooks/bog`
- **Redirect success/fail:** handled per-order by `returnUrl`/`cancelUrl`
  (built from `FRONTEND_URL`), so just confirm `FRONTEND_URL=https://homico.ge`
  in prod and that BoG allows our domains.

---

## Step 3 - Go live (Render env)

Set on the **backend** service (api.homico.ge):

```
PAYMENT_PROVIDER=bog
BOG_CLIENT_ID=<LIVE client id>
BOG_CLIENT_SECRET=<LIVE client secret>
BOG_PUBLIC_KEY=<LIVE PEM public key>
BOG_OAUTH_URL=<live oauth url>      # or omit to use the built-in prod default
BOG_API_BASE=<live api base>        # or omit to use the built-in prod default (api.bog.ge)
PUBLIC_BACKEND_URL=https://api.homico.ge
FRONTEND_URL=https://homico.ge
PAYMENT_TIMEOUT_MIN=30
```

Deploy. Then a **1 ₾ real smoke test**: make one real payment, confirm it lands
in the BoG merchant dashboard and settles. Only after that, announce/enable
payments broadly.

---

## Step 4 - Monitoring & ops (already built)

- Admin → **Disputes** (`/admin/disputes`) and **Payouts** (`/admin/payouts`).
- Reconcile endpoints cover delayed webhooks.
- Watch backend logs for `BoG createOrder failed` and `signature verification
  failed`.

## Payments OFF on prod (before BoG is live)

Production boots with payments **disabled** by default: leave `PAYMENT_PROVIDER`
unset (or set it to `disabled`) and the app starts normally with a
`DisabledPaymentProvider` that refuses every payment op with a 503 - so nothing
can be faked and the backend never crashes for lack of a real provider. The
frontend additionally hides all payment UI via `NEXT_PUBLIC_FEATURE_PAYMENTS`
(unset on prod). When BoG is live, set `PAYMENT_PROVIDER=bog` + the `BOG_*` env.

## Rollback

To halt payments after going live, set `PAYMENT_PROVIDER=disabled` and redeploy
(the backend stays up; payment ops 503). `mock` remains forbidden in production
(it fakes instant success). Per-feature, also flip `NEXT_PUBLIC_FEATURE_PAYMENTS`
off on the frontend.

---

## Pre-flight checklist (tick before opening payments)

- [ ] BoG merchant account live, refunds enabled, GEL settlement confirmed.
- [ ] Sandbox: success path verified end-to-end.
- [ ] Sandbox: failure/cancel path verified.
- [ ] Webhook signature verifies (no `401` in logs).
- [ ] Prod webhook URL registered with BoG.
- [ ] Render env set (provider=bog, all `BOG_*`, `PUBLIC_BACKEND_URL`, `FRONTEND_URL`).
- [ ] 1 ₾ live smoke test settled in BoG dashboard.
- [ ] Admin disputes/payouts dashboards reachable.
