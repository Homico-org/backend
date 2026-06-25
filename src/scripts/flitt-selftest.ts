/**
 * Flitt integration self-test.
 *
 *   npm run flitt:selftest
 *
 * 1. Offline: asserts our SHA1 signature matches the Flitt/Fondy spec and is
 *    key-order independent (the same `flittSignature` the provider uses).
 * 2. Live (only if FLITT_MERCHANT_ID + FLITT_PAYMENT_KEY are set): a READ-ONLY
 *    POST to /status/order_id for a nonexistent order. This moves no money but
 *    tells us whether Flitt ACCEPTS our signature - the riskiest unknown for
 *    BOTH checkout and reverse, which sign identically. A "signature" error =>
 *    our signing is wrong; an "order not found"-style error => signature OK.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { flittSignature } from '../payments/providers/flitt-payment.provider';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) pass++;
  else {
    fail++;
    console.log('  FAIL:', msg);
  }
};

function offlineChecks(): void {
  console.log('Offline signature checks:');

  // Known vector: secret | values-sorted-by-key | joined by '|'. Empty values
  // and the signature key itself are excluded.
  const sig = flittSignature(
    { order_id: 'A', merchant_id: '1', amount: 100, signature: 'x', empty: '' },
    'secret',
  );
  const expected = createHash('sha1').update('secret|100|1|A').digest('hex');
  ok(sig === expected, `known vector: ${sig} !== ${expected}`);

  // Reverse-style params must sign the same regardless of key insertion order.
  const a = flittSignature(
    { order_id: 'o1', merchant_id: '4057097', amount: 6000, currency: 'GEL' },
    'k',
  );
  const b = flittSignature(
    { currency: 'GEL', amount: 6000, merchant_id: '4057097', order_id: 'o1' },
    'k',
  );
  ok(a === b, 'signature must be key-order independent');

  console.log(`  ${pass} passed, ${fail} failed (offline)\n`);
}

async function liveStatusPing(): Promise<void> {
  const mid = process.env.FLITT_MERCHANT_ID;
  const key = process.env.FLITT_PAYMENT_KEY;
  const base = process.env.FLITT_API_BASE || 'https://pay.flitt.com/api';

  if (!mid || !key) {
    console.log(
      'Live ping: SKIPPED (set FLITT_MERCHANT_ID + FLITT_PAYMENT_KEY to run it).',
    );
    return;
  }

  console.log(`Live signature ping -> ${base}/status/order_id (read-only)...`);
  const request: Record<string, string | number> = {
    order_id: `selftest-${Date.now()}`,
    merchant_id: mid,
  };
  request.signature = flittSignature(request, key);

  let json: { response?: Record<string, unknown> };
  try {
    const res = await fetch(`${base}/status/order_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request }),
    });
    json = (await res.json()) as { response?: Record<string, unknown> };
  } catch (e) {
    console.log('  network error:', (e as Error).message);
    fail++;
    return;
  }

  const r = json.response || {};
  const msg = String(r.error_message || '');
  if (/signature/i.test(msg)) {
    console.log(`  SIGNATURE REJECTED by Flitt: "${msg}"`);
    console.log(
      '  -> our signing is wrong; checkout AND reverse will fail. Re-copy FLITT_PAYMENT_KEY.',
    );
    fail++;
  } else if (r.response_status === 'failure') {
    console.log(
      `  Signature ACCEPTED (Flitt returned a non-signature error: "${msg || r.error_code}").`,
    );
    console.log(
      '  -> auth + signature are correct; checkout and reverse share this signing.',
    );
  } else {
    console.log(
      `  Signature ACCEPTED. response_status=${r.response_status} order_status=${r.order_status}`,
    );
  }
}

async function main(): Promise<void> {
  console.log('=== Flitt self-test ===\n');
  offlineChecks();
  await liveStatusPing();
  console.log(
    '\nNote: a real reverse (refund) needs an actual captured order; this ping',
  );
  console.log(
    'validates the shared signature reverse also uses. The reverse RESPONSE field',
  );
  console.log(
    'names (reverse_status) are confirmed by cancelling a real sandbox booking.',
  );
  process.exit(fail ? 1 : 0);
}

void main();
