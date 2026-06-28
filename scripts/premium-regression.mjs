#!/usr/bin/env node
/**
 * Premium flow regression test — standalone, re-runnable.
 *
 *   node scripts/premium-regression.mjs
 *   API_BASE=http://localhost:3001 node scripts/premium-regression.mjs
 *
 * Exercises the premium checkout / reconcile / grant flow against a RUNNING
 * dev API (default http://localhost:3001) with the mock payment provider
 * (instant success). Prints PASS / FAIL / SKIP per check together with the
 * actual response so it doubles as an acceptance test for the
 * "premium hardening" work.
 *
 * It does NOT assume the hardening is already in place: the allow-list,
 * role and malformed-id checks print EXPECTED vs ACTUAL and never crash the
 * run, so the same script reports today's behaviour and tomorrow's.
 *
 * WARNING: this MUTATES the dev DB (it grants real premium to demo pros).
 * It only ever touches demo accounts (admin@demo.ge, bulkpro-*@demo.ge,
 * client demo accounts) and is written to be re-runnable: it picks pros
 * that are NOT currently premium for the happy-path / pending-payment
 * checks, and falls back to SKIP when the pool is exhausted.
 *
 * Accounts (from `npm run seed:dev`):
 *   admin   admin@demo.ge        / DevAdmin1234
 *   pros    bulkpro-1..N@demo.ge / Demo123!
 *   clients zurab.kh@demo.ge, luka.ts@demo.ge, sopio.m@demo.ge / Demo123!
 */

const API_BASE = process.env.API_BASE || "http://localhost:3001";
const PRO_PASSWORD = "Demo123!";
const CLIENT_ACCOUNTS = [
  "zurab.kh@demo.ge",
  "luka.ts@demo.ge",
  "sopio.m@demo.ge",
];

// ---- tiny test harness ----------------------------------------------------

let passed = 0;
let failed = 0;
let skipped = 0;

function pass(name, detail) {
  passed++;
  console.log(`PASS  ${name}${detail ? `\n        ${detail}` : ""}`);
}
function fail(name, detail) {
  failed++;
  console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
}
function skip(name, why) {
  skipped++;
  console.log(`SKIP  ${name}${why ? `\n        ${why}` : ""}`);
}
function check(name, ok, detail) {
  (ok ? pass : fail)(name, detail);
  return ok;
}

const j = (v) => JSON.stringify(v);

// ---- HTTP helper ----------------------------------------------------------

async function api(method, path, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function login(identifier, password) {
  const { status, body } = await api("POST", "/auth/login", {
    body: { identifier, password },
  });
  if ((status !== 200 && status !== 201) || !body?.access_token) {
    throw new Error(`login failed for ${identifier}: HTTP ${status} ${j(body)}`);
  }
  return { token: body.access_token, user: body.user };
}

async function isPremiumPro(token) {
  const { body } = await api("GET", "/users/me", { token });
  return { isPremium: !!body?.isPremium, tier: body?.premiumTier, me: body };
}

async function findFreshPro(maxScan, exclude = new Set()) {
  for (let i = 1; i <= maxScan; i++) {
    const email = `bulkpro-${i}@demo.ge`;
    if (exclude.has(email)) continue;
    let session;
    try {
      session = await login(email, PRO_PASSWORD);
    } catch {
      continue;
    }
    const { isPremium } = await isPremiumPro(session.token);
    if (!isPremium) return { email, ...session };
  }
  return null;
}

// ---- main -----------------------------------------------------------------

async function main() {
  console.log("=".repeat(72));
  console.log("  HOMICO premium regression");
  console.log(`  API_BASE = ${API_BASE}`);
  console.log("  WARNING: mutates the dev DB (grants premium to demo pros).");
  console.log("=".repeat(72));

  let admin;
  try {
    admin = await login("admin@demo.ge", "DevAdmin1234");
    pass("admin login", `role=${admin.user?.role} id=${admin.user?.id}`);
  } catch (e) {
    fail("admin login", String(e.message || e));
    console.log("\nCannot reach the API / log in as admin — aborting.");
    summary();
    process.exit(1);
  }

  const proA = await findFreshPro(20);
  const usedPros = new Set();

  // CHECK 1
  let proCheckout = null;
  if (!proA) {
    skip(
      "1. premium checkout (pro/monthly)",
      "no non-premium pro account available (all bulkpro-* are premium). Cannot run the happy path re-runnably.",
    );
  } else {
    usedPros.add(proA.email);
    const { status, body } = await api("POST", "/payments/premium/checkout", {
      token: proA.token,
      body: { tier: "pro", period: "monthly" },
    });
    const hasShape = !!body?.paymentId && !!body?.redirectUrl;
    const ok = check(
      "1. premium checkout (pro/monthly) -> {paymentId, redirectUrl}",
      status === 201 && hasShape,
      `account=${proA.email} HTTP ${status} resp=${j(body)}`,
    );
    if (ok) proCheckout = body;
  }

  // CHECK 2
  if (!proCheckout) {
    skip("2. reconcile -> succeeded", "no paymentId from check 1");
    skip("2b. checkout amount == 10000 minor (100 GEL)", "no paymentId");
  } else {
    const { status, body } = await api(
      "GET",
      `/payments/${proCheckout.paymentId}/reconcile`,
      { token: proA.token },
    );
    check(
      "2. reconcile paymentId -> status succeeded",
      status === 200 && body?.status === "succeeded",
      `HTTP ${status} resp=${j(body)}`,
    );
    check(
      "2b. checkout amount == 10000 minor (100 GEL)",
      body?.amountMinor === 10000,
      `expected amountMinor=10000  actual=${body?.amountMinor}`,
    );
  }

  // CHECK 3
  if (!proCheckout) {
    skip("3. premium granted (isPremium=true, tier=pro)", "no successful checkout");
  } else {
    const { isPremium, tier, me } = await isPremiumPro(proA.token);
    check(
      "3. premium granted -> /users/me isPremium=true, tier=pro",
      isPremium === true && tier === "pro",
      `account=${proA.email} isPremium=${isPremium} tier=${tier} expiresAt=${me?.premiumExpiresAt}`,
    );
  }

  // CHECK 4
  if (!proCheckout) {
    skip("4. ALREADY_PREMIUM on re-checkout", "no premium user from earlier checks");
  } else {
    const { status, body } = await api("POST", "/payments/premium/checkout", {
      token: proA.token,
      body: { tier: "pro", period: "monthly" },
    });
    const msg = bodyMessage(body);
    check(
      "4. re-checkout for premium user -> HTTP 400 ALREADY_PREMIUM",
      status === 400 && /ALREADY_PREMIUM/.test(msg),
      `HTTP ${status} message=${j(msg)}`,
    );
  }

  // CHECK 5 (allow-list)
  const proForAllow = (await findFreshPro(20, usedPros)) || proA;
  if (proForAllow) usedPros.add(proForAllow.email);

  if (!proForAllow) {
    skip("5. allow-list (basic/pro-yearly/elite)", "no pro account to test with");
  } else {
    await allowListCase(proForAllow.token, {
      name: "5a. checkout tier=basic",
      body: { tier: "basic", period: "monthly" },
      expectStatus: 400,
      expectNote: "basic should be rejected after hardening",
    });
    await allowListCase(proForAllow.token, {
      name: "5b. checkout tier=pro period=yearly",
      body: { tier: "pro", period: "yearly" },
      expectStatus: 400,
      expectNote: "yearly should be rejected after hardening",
    });
    await allowListCase(proForAllow.token, {
      name: "5c. checkout tier=elite period=monthly (valid, 25000 minor)",
      body: { tier: "elite", period: "monthly" },
      expectStatus: 201,
      expectNote: "elite = Super Pro is valid; amount 25000 minor",
      verifyAmountMinor: 25000,
    });
  }

  // CHECK 6 (role)
  let client = null;
  for (const email of CLIENT_ACCOUNTS) {
    try {
      const session = await login(email, PRO_PASSWORD);
      if (session.user?.role === "client") {
        client = { email, ...session };
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!client) {
    skip(
      "6. ROLE: client checkout -> 403",
      "could not log in to any demo client account (zurab.kh / luka.ts / sopio.m @demo.ge with Demo123!)",
    );
  } else {
    const { status, body } = await api("POST", "/payments/premium/checkout", {
      token: client.token,
      body: { tier: "pro", period: "monthly" },
    });
    const expected = 403;
    const ok = status === expected;
    (ok ? pass : fail)(
      "6. ROLE: client-role checkout -> 403 (after hardening)",
      `account=${client.email} EXPECTED HTTP ${expected}  ACTUAL HTTP ${status}  resp=${j(body)}` +
        (ok ? "" : "  [pre-hardening: clients can still buy premium]"),
    );
  }

  // CHECK 7 (cross-user reconcile)
  const crossA = await findFreshPro(20, usedPros);
  if (crossA) usedPros.add(crossA.email);
  const userB =
    client ||
    (await (async () => {
      const p = await findFreshPro(20, usedPros);
      return p || proA;
    })());

  if (!crossA) {
    skip(
      "7. cross-user reconcile does not grant A premium",
      "no spare non-premium pro to act as the victim (user A)",
    );
  } else if (!userB) {
    skip("7. cross-user reconcile", "no second account to act as user B");
  } else {
    const aCheckout = await api("POST", "/payments/premium/checkout", {
      token: crossA.token,
      body: { tier: "pro", period: "monthly" },
    });
    if (aCheckout.status !== 201 || !aCheckout.body?.paymentId) {
      skip(
        "7. cross-user reconcile",
        `could not create pending payment for A: HTTP ${aCheckout.status} ${j(aCheckout.body)}`,
      );
    } else {
      const pid = aCheckout.body.paymentId;
      const recon = await api("GET", `/payments/${pid}/reconcile`, {
        token: userB.token,
      });
      const blocked =
        recon.status === 403 ||
        recon.status === 404 ||
        recon.body?.status === "forbidden";
      const aAfter = await isPremiumPro(crossA.token);
      const grantedAsSideEffect = aAfter.isPremium === true;

      check(
        "7a. cross-user reconcile is blocked (forbidden/404, no detail leak)",
        blocked,
        `B=${userB.email} reconciling A(${crossA.email})'s payment: HTTP ${recon.status} resp=${j(recon.body)}`,
      );
      check(
        "7b. cross-user reconcile did NOT grant A premium",
        !grantedAsSideEffect,
        `A(${crossA.email}) isPremium after B's reconcile = ${aAfter.isPremium} (EXPECTED false)` +
          (grantedAsSideEffect
            ? "  [pre-hardening leak: grant happens before ownership check]"
            : ""),
      );
    }
  }

  // CHECK 8 (malformed id)
  const anyToken = proA?.token || admin.token;
  {
    const { status, body } = await api(
      "GET",
      "/payments/not-an-id/reconcile",
      { token: anyToken },
    );
    const expected = 400;
    const ok = status === expected;
    (ok ? pass : fail)(
      "8. malformed paymentId reconcile -> 400 (after hardening)",
      `EXPECTED HTTP ${expected}  ACTUAL HTTP ${status}  resp=${j(body)}` +
        (ok ? "" : "  [pre-hardening: bad ObjectId throws 500]"),
    );
  }

  summary();
  process.exit(failed > 0 ? 1 : 0);
}

// ---- helpers --------------------------------------------------------------

function bodyMessage(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (Array.isArray(body.message)) return body.message.join("; ");
  return String(body.message ?? body.error ?? j(body));
}

async function allowListCase(token, opts) {
  const { name, body, expectStatus, expectNote, verifyAmountMinor } = opts;
  const { status, body: resp } = await api("POST", "/payments/premium/checkout", {
    token,
    body,
  });
  const statusOk =
    expectStatus === 201 ? status === 201 || status === 200 : status === expectStatus;

  let detail =
    `EXPECTED HTTP ${expectStatus}  ACTUAL HTTP ${status}  resp=${j(resp)}  (${expectNote})`;

  if (
    verifyAmountMinor != null &&
    (status === 201 || status === 200) &&
    resp?.paymentId
  ) {
    const recon = await api("GET", `/payments/${resp.paymentId}/reconcile`, {
      token,
    });
    const amt = recon.body?.amountMinor;
    const amtOk = amt === verifyAmountMinor;
    detail += `\n        amount: EXPECTED ${verifyAmountMinor} minor  ACTUAL ${amt}`;
    (statusOk && amtOk ? pass : fail)(name, detail);
    return;
  }

  (statusOk ? pass : fail)(name, detail);
}

function summary() {
  console.log("=".repeat(72));
  console.log(
    `  RESULT: ${passed} PASS, ${failed} FAIL, ${skipped} SKIP  (total ${passed + failed + skipped})`,
  );
  console.log("=".repeat(72));
}

main().catch((e) => {
  console.error("\nFATAL (unexpected error, not a check failure):");
  console.error(e);
  process.exit(2);
});
