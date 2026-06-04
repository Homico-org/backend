/**
 * End-to-end smoke test of the booking + payment + escrow + payout flow.
 *
 * Walks the full happy path against the LOCAL backend (port 3001) with
 * seeded demo users:
 *
 *   1. Client logs in
 *   2. Client picks an available slot on Ana's calendar
 *   3. Client creates a booking - server makes Payment + Escrow rows
 *   4. Client reconciles the payment (mock provider auto-succeeds)
 *   5. Pro Ana logs in, confirms the booking
 *   6. Pro starts work + uploads before photos
 *   7. Pro completes work + uploads after photos
 *   8. Client confirms completion - escrow flips to pending_release
 *   9. Admin sees Ana's pending payout, processes it - escrow -> released
 *
 * Each step logs a green ✓ or a red ✗ with the failing payload so we
 * can pinpoint which transition broke.
 *
 * Runs against the same `MONGODB_URI` the backend is using (set by the
 * running `nest start --watch` process). No write happens through this
 * script directly - everything goes through real HTTP endpoints, so a
 * pass here is a real pass.
 *
 * Usage:
 *   npx ts-node scripts/e2e-booking-payment.ts
 */

// Make this a module so its top-level state (API, CLIENT, fn names, etc.)
// doesn't leak into the global scope and collide with sibling scripts.
export {};

const API = 'http://localhost:3001';

const CLIENT = { identifier: 'luka.ts@demo.ge', password: 'Demo123!' };
const PRO = { identifier: 'ana.g@demo.ge', password: 'Demo123!' };
const ADMIN = { identifier: 'admin@demo.ge', password: 'DevAdmin1234' };

const SAMPLE_PHOTO =
  'https://res.cloudinary.com/demo/image/upload/sample.jpg';

type Json = Record<string, unknown>;

let stepNumber = 0;
function pass(label: string, detail?: string): void {
  stepNumber++;
  // eslint-disable-next-line no-console
  console.log(`\x1b[32m✓\x1b[0m  ${stepNumber.toString().padStart(2, '0')}. ${label}${detail ? ` - ${detail}` : ''}`);
}
function fail(label: string, err: unknown): never {
  stepNumber++;
  // eslint-disable-next-line no-console
  console.error(`\x1b[31m✗\x1b[0m  ${stepNumber.toString().padStart(2, '0')}. ${label}`);
  // eslint-disable-next-line no-console
  console.error('   ', err);
  process.exit(1);
}

async function req<T = Json>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* keep raw text */
  }
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${method} ${path} - ${typeof parsed === 'object' ? JSON.stringify(parsed) : text}`,
    );
  }
  return parsed as T;
}

async function login(creds: { identifier: string; password: string }): Promise<{
  token: string;
  userId: string;
}> {
  const res = await req<{ access_token: string; user: { id?: string; _id?: string } }>(
    'POST',
    '/auth/login',
    { body: creds },
  );
  const userId = (res.user.id ?? res.user._id) as string;
  if (!res.access_token || !userId) {
    throw new Error(`login returned bad shape: ${JSON.stringify(res)}`);
  }
  return { token: res.access_token, userId };
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n\x1b[1mE2E booking + payment + payout flow\x1b[0m');
  // eslint-disable-next-line no-console
  console.log('=====================================\n');

  // ───── 1. Logins ──────────────────────────────────────────────────────
  let client: { token: string; userId: string };
  let pro: { token: string; userId: string };
  let admin: { token: string; userId: string };

  try {
    client = await login(CLIENT);
    pass('Login client (luka)', `userId=${client.userId.slice(-6)}`);
  } catch (e) {
    fail('Login client', e);
  }
  try {
    pro = await login(PRO);
    pass('Login pro (ana)', `userId=${pro!.userId.slice(-6)}`);
  } catch (e) {
    fail('Login pro', e);
  }
  try {
    admin = await login(ADMIN);
    pass('Login admin', `userId=${admin!.userId.slice(-6)}`);
  } catch (e) {
    fail('Login admin', e);
  }

  // ───── 2. Find an available slot on Ana ───────────────────────────────
  // Use the bulk range endpoint we just added.
  const today = new Date().toISOString().split('T')[0];
  const fortnight = new Date(Date.now() + 13 * 86_400_000).toISOString().split('T')[0];
  let availabilityRange: { date: string; hasSlots: boolean }[];
  try {
    availabilityRange = await req(
      'GET',
      `/bookings/pro/${pro!.userId}/availability/range?from=${today}&to=${fortnight}`,
      { token: client!.token },
    );
    const availableDays = availabilityRange.filter((d) => d.hasSlots).length;
    pass('Fetch bulk availability', `${availableDays}/${availabilityRange.length} days available`);
  } catch (e) {
    fail('Fetch bulk availability', e);
  }

  const firstAvailable = availabilityRange!.find((d) => d.hasSlots);
  if (!firstAvailable) {
    fail('No available days found in 14-day window', 'Ana has no `weeklySchedule` slots in the next 14 days');
  }

  let slots: { hour: number; available: boolean }[];
  try {
    slots = await req(
      'GET',
      `/bookings/pro/${pro!.userId}/availability?date=${firstAvailable!.date}`,
      { token: client!.token },
    );
    pass(
      `Fetch slot detail for ${firstAvailable!.date}`,
      `${slots.filter((s) => s.available).length} free hours`,
    );
  } catch (e) {
    fail('Fetch slot detail', e);
  }

  const freeHour = slots!.find((s) => s.available)?.hour;
  if (freeHour === undefined) {
    fail('Picked-day-has-no-free-hours', firstAvailable!.date);
  }

  // ───── 3. Create the booking ──────────────────────────────────────────
  let createRes: {
    booking: { _id: string; status: string };
    paymentRedirectUrl: string;
    paymentId: string;
  };
  try {
    createRes = await req('POST', '/bookings', {
      token: client!.token,
      body: {
        professionalId: pro!.userId,
        date: firstAvailable!.date,
        startHour: freeHour,
        endHour: freeHour! + 1,
        note: 'E2E smoke test booking',
        services: [
          {
            serviceKey: 'regular_standard_svc',
            name: 'Regular Cleaning',
            nameKa: 'სტანდარტული დასუფთავება',
            quantity: 1,
            unitPrice: 60,
            unit: 'm²',
          },
        ],
        totalAmount: 60,
      },
    });
    pass(
      'Create booking',
      `id=${createRes.booking._id.slice(-6)} status=${createRes.booking.status} paymentId=${createRes.paymentId?.slice(-6)}`,
    );
  } catch (e) {
    fail('Create booking', e);
  }

  const bookingId = createRes!.booking._id;

  if (createRes!.booking.status !== 'awaiting_payment') {
    fail(
      'Booking should be awaiting_payment',
      `got status=${createRes!.booking.status}`,
    );
  }
  pass('Booking is in awaiting_payment state', '');

  if (!createRes!.paymentRedirectUrl || !createRes!.paymentId) {
    fail(
      'Payment intent missing',
      `redirectUrl=${createRes!.paymentRedirectUrl}, paymentId=${createRes!.paymentId}`,
    );
  }
  pass('Payment intent created', createRes!.paymentRedirectUrl);

  // ───── 4. Reconcile (mock provider auto-succeeded the intent) ─────────
  let reconciled: { paymentStatus: string; status: string };
  try {
    reconciled = await req('POST', `/bookings/${bookingId}/reconcile-payment`, {
      token: client!.token,
    });
    pass(
      'Reconcile payment',
      `paymentStatus=${reconciled.paymentStatus} bookingStatus=${reconciled.status}`,
    );
  } catch (e) {
    fail('Reconcile payment', e);
  }

  if (reconciled!.status === 'awaiting_payment') {
    fail(
      'Booking should leave awaiting_payment after reconcile',
      `still awaiting_payment - mock provider may not be configured`,
    );
  }
  pass('Booking advanced past awaiting_payment', `status=${reconciled!.status}`);

  // ───── 5. Pro confirms ────────────────────────────────────────────────
  let confirmed: { status: string };
  try {
    confirmed = await req('PATCH', `/bookings/${bookingId}/status`, {
      token: pro!.token,
      body: { status: 'confirmed' },
    });
    pass('Pro confirms booking', `status=${confirmed.status}`);
  } catch (e) {
    fail('Pro confirm booking', e);
  }

  if (confirmed!.status !== 'confirmed') {
    fail('Expected confirmed status', `got=${confirmed!.status}`);
  }

  // ───── 6. Pro starts work ─────────────────────────────────────────────
  let started: { status: string; beforePhotos?: string[] };
  try {
    started = await req('PATCH', `/bookings/${bookingId}/start`, {
      token: pro!.token,
      body: { beforePhotos: [SAMPLE_PHOTO] },
    });
    pass(
      'Pro starts work',
      `status=${started.status} beforePhotos=${started.beforePhotos?.length ?? 0}`,
    );
  } catch (e) {
    fail('Pro start work', e);
  }

  // ───── 7. Pro completes work ──────────────────────────────────────────
  let completed: { status: string; afterPhotos?: string[] };
  try {
    completed = await req('PATCH', `/bookings/${bookingId}/complete`, {
      token: pro!.token,
      body: { afterPhotos: [SAMPLE_PHOTO] },
    });
    pass(
      'Pro completes work',
      `status=${completed.status} afterPhotos=${completed.afterPhotos?.length ?? 0}`,
    );
  } catch (e) {
    fail('Pro complete work', e);
  }

  if (completed!.status !== 'awaiting_client_confirmation') {
    fail(
      'Expected awaiting_client_confirmation after pro completes',
      `got=${completed!.status}`,
    );
  }

  // ───── 8. Client confirms completion ──────────────────────────────────
  let clientConfirmed: { status: string; escrowId?: string };
  try {
    clientConfirmed = await req('POST', `/bookings/${bookingId}/confirm-completion`, {
      token: client!.token,
    });
    pass(
      'Client confirms completion',
      `status=${clientConfirmed.status} escrowId=${clientConfirmed.escrowId?.slice(-6)}`,
    );
  } catch (e) {
    fail('Client confirm completion', e);
  }

  if (clientConfirmed!.status !== 'completed') {
    fail('Expected completed status', `got=${clientConfirmed!.status}`);
  }

  // ───── 9. Admin sees pending payout ───────────────────────────────────
  // listPendingPayouts returns { pros: [...] }, not a bare array.
  type PendingPros = {
    pros: Array<{
      proUserId: string;
      escrows: Array<{
        escrowId: string;
        payoutAmountMinor: number;
        amountHeldMinor: number;
      }>;
      totalPayoutMinor: number;
      bankAccount: unknown;
    }>;
  };
  let pending: PendingPros;
  try {
    pending = await req<PendingPros>('GET', '/payments/admin/pending-payouts', {
      token: admin!.token,
    });
    pass('Admin sees pending payouts', `${pending.pros.length} pro(s) waiting`);
  } catch (e) {
    fail('Admin list pending payouts', e);
  }

  const anaPending = pending!.pros.find((p) => p.proUserId === pro!.userId);
  if (!anaPending) {
    fail(
      'Ana not in pending payouts queue',
      `expected proUserId=${pro!.userId}; got ${pending!.pros.map((p) => p.proUserId).join(', ') || 'empty'}`,
    );
  }
  pass(
    'Ana is in the pending payout queue',
    `${anaPending!.escrows.length} escrow(s), payout=${(anaPending!.totalPayoutMinor / 100).toFixed(2)} GEL`,
  );

  // Ensure Ana has a bank account on file; the payout endpoint refuses
  // to process when one is missing. This is idempotent - the seed now
  // sets one, but on a stale DB or a fresh test pro the script needs
  // to backfill rather than fail with a useless error.
  if (!anaPending!.bankAccount) {
    try {
      await req('PUT', '/users/me/payout-account', {
        token: pro!.token,
        body: {
          bankCode: 'BAGAGE22',
          accountNumber: 'GE00BG0000000000000000',
          holderName: 'Ana Demo',
        },
      });
      pass('Set Ana bank account (was missing)', '');
    } catch (e) {
      fail('Set Ana bank account', e);
    }
  } else {
    pass('Ana has bank account on file', '');
  }

  // ───── 10. Admin processes the payout ─────────────────────────────────
  let payout: { _id?: string; status?: string };
  try {
    payout = await req('POST', '/payments/admin/payouts', {
      token: admin!.token,
      body: {
        proUserId: pro!.userId,
        escrowIds: anaPending!.escrows.map((e) => e.escrowId),
        transferReference: `E2E_TEST_${Date.now()}`,
        notes: 'Smoke-test payout',
      },
    });
    pass(
      'Admin processes payout',
      `payoutId=${payout._id?.slice(-6) ?? '?'} status=${payout.status ?? '?'}`,
    );
  } catch (e) {
    fail('Admin process payout', e);
  }

  // ───── 11. Verify escrow is now released ──────────────────────────────
  // Re-fetch pending payouts; Ana should no longer be in the list.
  try {
    const after = await req<PendingPros>('GET', '/payments/admin/pending-payouts', {
      token: admin!.token,
    });
    const stillThere = after.pros.find((p) => p.proUserId === pro!.userId);
    if (stillThere) {
      fail(
        'Ana still in pending payouts after payout processed',
        `escrows=${stillThere.escrows.length}`,
      );
    }
    pass('Ana removed from pending payouts after release', '');
  } catch (e) {
    fail('Re-check pending payouts', e);
  }

  // eslint-disable-next-line no-console
  console.log('\n\x1b[32m\x1b[1mAll 11 stages passed.\x1b[0m');
  // eslint-disable-next-line no-console
  console.log(`Booking: ${bookingId}`);
  // eslint-disable-next-line no-console
  console.log(`Payment provider: mock`);
  // eslint-disable-next-line no-console
  console.log(`Date / hour: ${firstAvailable!.date} ${freeHour!.toString().padStart(2, '0')}:00\n`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
