/**
 * Marketing SMS blast to all UNREGISTERED invite phones (no token link).
 *
 *   node scripts/send-marketing-batch.js --dry-run        # preview only, sends nothing
 *   node scripts/send-marketing-batch.js                  # REAL send
 *   flags: --limit N  --delay-ms N (default 800)  --db homi_prod|homi_dev
 *
 * Safety:
 *  - Skips any invite whose phone matches a registered user (by last-9 digits).
 *  - Dedupes by phone (a pro with many listings is messaged once).
 *  - Skips invites already marked marketingSmsSentAt (so a re-run resumes,
 *    never double-sends).
 *  - Marketing => UBill stopList: true (respects UBill's opt-out registry).
 *  - On real send, records marketingSmsSentAt + marketingSmsId on the invite
 *    for audit + resume.
 */
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { resolve } = require("path");
dotenv.config({ path: resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limIdx = args.indexOf("--limit");
const limit = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;
const delayIdx = args.indexOf("--delay-ms");
const delayMs = delayIdx >= 0 ? parseInt(args[delayIdx + 1], 10) : 800;
const dbIdx = args.indexOf("--db");
const targetDb = dbIdx >= 0 ? args[dbIdx + 1] : "homi_prod";

const baseUri = process.env.MONGODB_URI || "";
const dbUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${targetDb}$1`);
const UBILL_API_KEY = process.env.UBILL_API_KEY || "";
const UBILL_BRAND_ID = parseInt(process.env.UBILL_BRAND_ID || "0", 10);

const TEXT =
  "Homico-ზე დაამატეთ თქვენი სერვისები და ფასები - დამკვეთები გეძებენ. რეგისტრაცია უფასოა: www.homico.ge";

function normalize(phone) {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!UBILL_API_KEY || !UBILL_BRAND_ID) {
    throw new Error("UBILL_API_KEY / UBILL_BRAND_ID missing in backend/.env");
  }
  console.log(`Connecting to ${targetDb} ...`);
  const conn = await mongoose.createConnection(dbUri).asPromise();
  const invitesCol = conn.collection("invitetokens");
  const usersCol = conn.collection("users");

  // Registered phones
  const users = await usersCol
    .find({ phone: { $exists: true, $ne: null } }, { projection: { phone: 1 } })
    .toArray();
  const registered = new Set();
  for (const u of users) {
    const n = normalize(u.phone);
    if (n) registered.add(n);
  }

  // Invites -> unregistered, deduped, not-yet-marketed
  const invites = await invitesCol
    .find(
      {},
      { projection: { phone: 1, marketingSmsSentAt: 1 } },
    )
    .toArray();

  const seen = new Set();
  const recipients = [];
  let skippedRegistered = 0,
    skippedDup = 0,
    skippedAlready = 0,
    skippedBadPhone = 0;

  for (const inv of invites) {
    const n = normalize(inv.phone);
    if (!n) {
      skippedBadPhone++;
      continue;
    }
    if (registered.has(n)) {
      skippedRegistered++;
      continue;
    }
    if (seen.has(n)) {
      skippedDup++;
      continue;
    }
    if (inv.marketingSmsSentAt) {
      skippedAlready++;
      seen.add(n);
      continue;
    }
    seen.add(n);
    recipients.push({ id: inv._id, phone: inv.phone, ubill: parseInt(`995${n}`, 10) });
  }

  const targetList = recipients.slice(0, limit);
  const segPerMsg = Math.ceil(TEXT.length / 67); // UCS-2 multipart ~67/seg

  console.log("\n========================================");
  console.log(`Message (${TEXT.length} chars, ~${segPerMsg} segments):`);
  console.log(`  ${TEXT}`);
  console.log("----------------------------------------");
  console.log(`Registered users:            ${users.length}`);
  console.log(`Total invites:               ${invites.length}`);
  console.log(`  skipped (registered):      ${skippedRegistered}`);
  console.log(`  skipped (duplicate phone): ${skippedDup}`);
  console.log(`  skipped (already sent):    ${skippedAlready}`);
  console.log(`  skipped (bad phone):       ${skippedBadPhone}`);
  console.log(`RECIPIENTS TO SEND:          ${targetList.length}`);
  console.log(`Est. billed SMS:             ${targetList.length * segPerMsg}`);
  console.log("========================================\n");

  if (dryRun) {
    console.log("DRY RUN - nothing sent. Sample recipients:");
    targetList.slice(0, 5).forEach((r) => console.log(`  ${r.phone} -> ${r.ubill}`));
    await conn.close();
    process.exit(0);
  }

  console.log(`REAL SEND starting in 5s... (${delayMs}ms between sends)`);
  await sleep(5000);

  let ok = 0,
    fail = 0;
  for (let i = 0; i < targetList.length; i++) {
    const r = targetList[i];
    try {
      const res = await fetch("https://api.ubill.dev/v1/sms/send", {
        method: "POST",
        headers: { key: UBILL_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          brandID: UBILL_BRAND_ID,
          numbers: [r.ubill],
          text: TEXT,
          stopList: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 200 && data.statusID === 0) {
        ok++;
        await invitesCol.updateOne(
          { _id: r.id },
          { $set: { marketingSmsSentAt: new Date(), marketingSmsId: data.smsID } },
        );
      } else {
        fail++;
        console.log(`  FAIL ${r.phone}: HTTP ${res.status} ${JSON.stringify(data)}`);
      }
    } catch (e) {
      fail++;
      console.log(`  FAIL ${r.phone}: ${e.message}`);
    }
    if ((i + 1) % 50 === 0 || i === targetList.length - 1) {
      console.log(`[${i + 1}/${targetList.length}] ok=${ok} fail=${fail}`);
    }
    if (i < targetList.length - 1) await sleep(delayMs);
  }

  console.log(`\nDONE. ok=${ok} fail=${fail} of ${targetList.length}`);
  await conn.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
