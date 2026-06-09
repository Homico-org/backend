/**
 * End-to-end smoke test of the cancellation + dispute paths.
 *
 * Companion to `e2e-booking-payment.ts` (the happy-path test). This
 * script exercises the unhappy paths that are most likely to break in
 * production:
 *
 *   Scenario A - Client cancels >24h before booking
 *                Expected: 100% refund, 0% payout, escrow REFUNDED
 *
 *   Scenario B - Client cancels <2h before booking
 *                Expected: 0% refund, 100% payout, escrow PENDING_RELEASE
 *
 *   Scenario C - Pro cancels (any time before work)
 *                Expected: 100% refund, escrow REFUNDED, strike implicit
 *
 *   Scenario D - Client raises a 'quality' dispute mid-work
 *                Expected: booking DISPUTED, escrow IN_DISPUTE, dispute row OPEN
 *
 *   Scenario E - Admin splits the dispute 50/50
 *                Expected: dispute SPLIT, escrow PARTIALLY_REFUNDED
 *
 * Each scenario creates its own fresh booking against Ana so failures
 * are isolated. Total of ~5 bookings created on every run.
 *
 * Usage:
 *   npx ts-node scripts/e2e-cancel-dispute.ts
 */

// Make this a module so its top-level state doesn't collide with sibling
// e2e scripts when tsc walks the scripts/ directory.
export {};

const API = 'http://localhost:3001';

const CLIENT = { identifier: 'luka.ts@demo.ge', password: 'Demo123!' };
const PRO = { identifier: 'ana.g@demo.ge', password: 'Demo123!' };
const ADMIN = { identifier: 'admin@demo.ge', password: 'DevAdmin1234' };

const SAMPLE_PHOTO = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

let stepNumber = 0;
function pass(label: string, detail?: string): void {
  stepNumber++;
  // eslint-disable-next-line no-console
  console.log(`\x1b[32m✓\x1b[0m  ${stepNumber.toString().padStart(2, '0')}. ${label}${detail ? ` - ${detail}` : ''}`);
}
function info(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`\x1b[36mℹ\x1b[0m  ${label}`);
}
function fail(label: string, err: unknown): never {
  stepNumber++;
  // eslint-disable-next-line no-console
  console.error(`\x1b[31m✗\x1b[0m  ${stepNumber.toString().padStart(2, '0')}. ${label}`);
  // eslint-disable-next-line no-console
  console.error('   ', err);
  process.exit(1);
}
function section(label: string): void {
  // eslint-disable-next-line no-console
  console.log(`\n\x1b[1m── ${label} ──\x1b[0m`);
}

async function req<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
    /* keep raw */
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
  return { token: res.access_token, userId };
}

/**
 * Pick a free slot on Ana's calendar that is at least `minHoursAway`
 * away from now (today or future day). Returns the first match.
 */
async function findFreeSlot(
  proId: string,
  clientToken: string,
  minHoursAway: number,
  maxHoursAway: number | null = null,
): Promise<{ date: string; hour: number }> {
  const now = Date.now();
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d = new Date(now + dayOffset * 86_400_000);
    const iso = d.toISOString().split('T')[0];
    const slots = await req<{ hour: number; available: boolean }[]>(
      'GET',
      `/bookings/pro/${proId}/availability?date=${iso}`,
      { token: clientToken },
    );
    for (const s of slots) {
      if (!s.available) continue;
      const slotTime = new Date(d);
      slotTime.setHours(s.hour, 0, 0, 0);
      const hoursAway = (slotTime.getTime() - now) / 3_600_000;
      if (hoursAway < minHoursAway) continue;
      if (maxHoursAway != null && hoursAway > maxHoursAway) continue;
      return { date: iso, hour: s.hour };
    }
  }
  throw new Error(
    `No slot found between ${minHoursAway}h and ${maxHoursAway ?? '∞'}h from now`,
  );
}

/**
 * Create + pay for a booking. Returns the booking id + paid status so
 * the test can act on it. Idempotent shorthand for the first 4 steps
 * of the happy-path script.
 */
async function createAndPay(opts: {
  clientToken: string;
  proId: string;
  date: string;
  hour: number;
}): Promise<{ bookingId: string; totalMinor: number }> {
  const create = await req<{
    booking: { _id: string };
    paymentRedirectUrl: string;
    paymentId: string;
  }>('POST', '/bookings', {
    token: opts.clientToken,
    body: {
      professionalId: opts.proId,
      date: opts.date,
      startHour: opts.hour,
      endHour: opts.hour + 1,
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
  const bookingId = create.booking._id;
  await req('POST', `/bookings/${bookingId}/reconcile-payment`, {
    token: opts.clientToken,
  });
  return { bookingId, totalMinor: 6000 };
}

async function getBooking(bookingId: string, token: string): Promise<{
  status: string;
  paymentStatus: string;
  totalAmountMinor: number;
}> {
  return req('GET', `/bookings/${bookingId}`, { token });
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n\x1b[1mE2E cancellation + dispute flow\x1b[0m');
  // eslint-disable-next-line no-console
  console.log('==================================');

  const client = await login(CLIENT);
  pass('Login client', `userId=${client.userId.slice(-6)}`);
  const pro = await login(PRO);
  pass('Login pro', `userId=${pro.userId.slice(-6)}`);
  const admin = await login(ADMIN);
  pass('Login admin', `userId=${admin.userId.slice(-6)}`);

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO A: Client cancels BEFORE pro confirms - 100% refund
  // (the "unconfirmed" policy - the pro hasn't committed yet, so
  // none of the time-based penalties apply)
  // ════════════════════════════════════════════════════════════════════
  section('Scenario A: Client cancels before pro confirms (unconfirmed)');

  const slotA = await findFreeSlot(pro.userId, client.token, 26);
  info(`Slot A: ${slotA.date} ${slotA.hour}:00 (status will be PENDING when cancelled)`);
  const bA = await createAndPay({
    clientToken: client.token,
    proId: pro.userId,
    date: slotA.date,
    hour: slotA.hour,
  });
  pass('Create + pay booking A', `id=${bA.bookingId.slice(-6)}`);

  const quoteA = await req<{
    refundPercent: number;
    payoutPercent: number;
    policy: string;
    hoursUntilBooking: number;
  }>('GET', `/bookings/${bA.bookingId}/cancellation-quote`, {
    token: client.token,
  });
  if (
    quoteA.refundPercent !== 100 ||
    quoteA.payoutPercent !== 0 ||
    quoteA.policy !== 'client_unconfirmed'
  ) {
    fail(
      'Quote A wrong (unconfirmed policy expected)',
      `expected 100/0 client_unconfirmed; got ${quoteA.refundPercent}/${quoteA.payoutPercent} policy=${quoteA.policy}`,
    );
  }
  pass(
    'Quote A correct (unconfirmed)',
    `100% refund, policy=${quoteA.policy} (pro never confirmed)`,
  );

  const cancelledA = await req<{ status: string; paymentStatus: string }>(
    'POST',
    `/bookings/${bA.bookingId}/cancel`,
    { token: client.token, body: { reason: 'E2E test A' } },
  );
  if (cancelledA.status !== 'cancelled' || cancelledA.paymentStatus !== 'refunded') {
    fail(
      'Cancel A wrong final state',
      `status=${cancelledA.status} paymentStatus=${cancelledA.paymentStatus}`,
    );
  }
  pass('Cancel A applied', `status=cancelled, paymentStatus=refunded`);

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO B: Client cancels <2h before booking AFTER pro confirmed
  // - 0% refund (the late-cancel penalty applies because the pro
  // committed and the slot becomes a real loss)
  // ════════════════════════════════════════════════════════════════════
  section('Scenario B: Client cancels <2h after pro confirmed (late penalty)');

  let bB: { bookingId: string; totalMinor: number } | null = null;
  let slotB: { date: string; hour: number } | null = null;
  try {
    // The 2h window is tight - if it's late at night or Ana is fully
    // booked, this scenario can't run today.
    slotB = await findFreeSlot(pro.userId, client.token, 0.5, 2);
    info(`Slot B: ${slotB.date} ${slotB.hour}:00 (<2h away)`);
    bB = await createAndPay({
      clientToken: client.token,
      proId: pro.userId,
      date: slotB.date,
      hour: slotB.hour,
    });
    pass('Create + pay booking B', `id=${bB.bookingId.slice(-6)}`);

    // Pro confirms FIRST so the late-cancel penalty actually applies.
    // Without this step the policy would fall through to the gentler
    // client_unconfirmed branch (verified by Scenario A above).
    await req('PATCH', `/bookings/${bB.bookingId}/status`, {
      token: pro.token,
      body: { status: 'confirmed' },
    });
    pass('Pro confirms B', 'so the late-cancel policy can fire');

    const quoteB = await req<{
      refundPercent: number;
      payoutPercent: number;
      policy: string;
    }>('GET', `/bookings/${bB.bookingId}/cancellation-quote`, {
      token: client.token,
    });
    if (
      quoteB.refundPercent !== 0 ||
      quoteB.payoutPercent !== 100 ||
      quoteB.policy !== 'client_late'
    ) {
      fail(
        'Quote B wrong split',
        `expected 0/100 client_late; got ${quoteB.refundPercent}/${quoteB.payoutPercent} policy=${quoteB.policy}`,
      );
    }
    pass('Quote B correct', `0% refund / 100% payout, policy=${quoteB.policy}`);

    const cancelledB = await req<{ status: string; paymentStatus: string }>(
      'POST',
      `/bookings/${bB.bookingId}/cancel`,
      { token: client.token, body: { reason: 'E2E test B' } },
    );
    if (cancelledB.status !== 'cancelled') {
      fail('Cancel B wrong status', `status=${cancelledB.status}`);
    }
    pass('Cancel B applied', `status=cancelled, paymentStatus=${cancelledB.paymentStatus}`);
  } catch (e) {
    if (slotB === null) {
      info(
        `Scenario B skipped: no slot found <2h away (Ana's schedule may be exhausted for today)`,
      );
    } else {
      throw e;
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO C: Pro cancels - 100% refund regardless of timing
  // ════════════════════════════════════════════════════════════════════
  section('Scenario C: Pro cancels');

  const slotC = await findFreeSlot(pro.userId, client.token, 26);
  info(`Slot C: ${slotC.date} ${slotC.hour}:00`);
  const bC = await createAndPay({
    clientToken: client.token,
    proId: pro.userId,
    date: slotC.date,
    hour: slotC.hour,
  });
  pass('Create + pay booking C', `id=${bC.bookingId.slice(-6)}`);

  // Pro confirms first so the cancel happens from CONFIRMED rather than
  // PENDING - exercises the more interesting path.
  await req('PATCH', `/bookings/${bC.bookingId}/status`, {
    token: pro.token,
    body: { status: 'confirmed' },
  });

  const quoteC = await req<{
    refundPercent: number;
    payoutPercent: number;
    policy: string;
    isProCancelling: boolean;
  }>('GET', `/bookings/${bC.bookingId}/cancellation-quote`, {
    token: pro.token,
  });
  if (
    quoteC.refundPercent !== 100 ||
    quoteC.payoutPercent !== 0 ||
    quoteC.policy !== 'pro_cancel' ||
    !quoteC.isProCancelling
  ) {
    fail(
      'Quote C wrong (pro cancelling)',
      JSON.stringify(quoteC),
    );
  }
  pass('Quote C correct (pro cancel)', `100% refund, policy=${quoteC.policy}`);

  const cancelledC = await req<{ status: string; paymentStatus: string }>(
    'POST',
    `/bookings/${bC.bookingId}/cancel`,
    { token: pro.token, body: { reason: 'E2E pro cancel' } },
  );
  if (cancelledC.status !== 'cancelled' || cancelledC.paymentStatus !== 'refunded') {
    fail(
      'Pro cancel C wrong final state',
      `status=${cancelledC.status} paymentStatus=${cancelledC.paymentStatus}`,
    );
  }
  pass('Cancel C applied', `pro cancel -> client refunded`);

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO D: Client raises a quality dispute mid-work
  // ════════════════════════════════════════════════════════════════════
  section('Scenario D: Client raises quality dispute');

  const slotD = await findFreeSlot(pro.userId, client.token, 26);
  info(`Slot D: ${slotD.date} ${slotD.hour}:00`);
  const bD = await createAndPay({
    clientToken: client.token,
    proId: pro.userId,
    date: slotD.date,
    hour: slotD.hour,
  });
  pass('Create + pay booking D', `id=${bD.bookingId.slice(-6)}`);

  // Advance through PENDING -> CONFIRMED -> IN_PROGRESS so dispute is legal.
  await req('PATCH', `/bookings/${bD.bookingId}/status`, {
    token: pro.token,
    body: { status: 'confirmed' },
  });
  await req('PATCH', `/bookings/${bD.bookingId}/start`, {
    token: pro.token,
    body: { beforePhotos: [SAMPLE_PHOTO] },
  });
  pass('Booking D in IN_PROGRESS', '');

  const disputed = await req<{ status: string; disputeId?: string }>(
    'POST',
    `/bookings/${bD.bookingId}/dispute`,
    {
      token: client.token,
      body: {
        type: 'quality',
        description: 'Work was unsatisfactory (e2e test)',
        evidenceUrls: [SAMPLE_PHOTO],
      },
    },
  );
  if (disputed.status !== 'disputed') {
    fail('Dispute D wrong status', `got ${disputed.status}`);
  }
  if (!disputed.disputeId) {
    fail('Dispute D missing disputeId on booking', JSON.stringify(disputed));
  }
  pass('Dispute D raised', `disputeId=${disputed.disputeId.slice(-6)}`);

  const adminDisputes = await req<{
    data: Array<{ _id: string; status: string; type: string }>;
    total: number;
    openCount: number;
  }>('GET', '/payments/admin/disputes?status=open', { token: admin.token });
  const disputeList = adminDisputes.data ?? [];
  const myDispute = disputeList.find((d) => d._id === disputed.disputeId);
  if (!myDispute) {
    fail(
      'Admin queue does not contain the new dispute',
      `looking for ${disputed.disputeId}; got ${disputeList.length} items`,
    );
  }
  pass(
    'Admin sees dispute in queue',
    `${disputeList.length} open dispute(s), our one is type=${myDispute.type}`,
  );

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO E: Admin splits the dispute 50/50
  // ════════════════════════════════════════════════════════════════════
  section('Scenario E: Admin resolves dispute 50/50');

  const totalMinor = bD.totalMinor;
  const half = Math.round(totalMinor / 2);
  const resolved = await req<{ status: string; refundAmountMinor?: number; payoutAmountMinor?: number }>(
    'POST',
    `/payments/admin/disputes/${disputed.disputeId}/resolve`,
    {
      token: admin.token,
      body: {
        resolution: 'split',
        refundAmountMinor: half,
        payoutAmountMinor: totalMinor - half,
        note: 'E2E split 50/50',
      },
    },
  );
  if (resolved.status !== 'split') {
    fail('Resolve D wrong status', `got ${resolved.status}`);
  }
  pass(
    'Admin resolves split',
    `refund=${(half / 100).toFixed(2)} payout=${((totalMinor - half) / 100).toFixed(2)} GEL`,
  );

  // Re-read booking - paymentStatus should reflect the partial refund.
  const finalD = await getBooking(bD.bookingId, client.token);
  if (
    finalD.paymentStatus !== 'partially_refunded' &&
    finalD.paymentStatus !== 'refunded'
  ) {
    fail(
      'Booking D paymentStatus after split unexpected',
      `paymentStatus=${finalD.paymentStatus}`,
    );
  }
  pass(
    'Booking D paymentStatus reflects split',
    `paymentStatus=${finalD.paymentStatus}, status=${finalD.status}`,
  );

  // eslint-disable-next-line no-console
  console.log('\n\x1b[32m\x1b[1mAll unhappy-path scenarios passed.\x1b[0m');
  // eslint-disable-next-line no-console
  console.log(`Bookings created: A=${bA.bookingId.slice(-6)} ${bB ? `B=${bB.bookingId.slice(-6)} ` : ''}C=${bC.bookingId.slice(-6)} D=${bD.bookingId.slice(-6)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n\x1b[31mFatal:\x1b[0m', err);
  process.exit(1);
});
