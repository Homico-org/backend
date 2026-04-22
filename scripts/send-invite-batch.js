/**
 * Send Homico invite SMS to an existing batch of pending invitetokens rows.
 *
 *   node scripts/send-invite-batch.js [--cohort <path>] [--dry-run] [--delay-ms N]
 *
 * Reads a cohort JSON (defaults to scripts/invite-cohort.json) produced by
 * the selection script. Each entry must have { token, phone } — the script
 * looks up the row by token in invitetokens and sends SMS using that row's
 * existing token. On success it marks { status: 'sent', sentAt, smsID }.
 *
 * Use --dry-run to preview messages without calling UBill.
 * Use --delay-ms to override the 800ms pause between sends (UBill rate limit).
 */

const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const cohortIdx = args.indexOf("--cohort");
const cohortPath =
  cohortIdx >= 0 && args[cohortIdx + 1]
    ? args[cohortIdx + 1]
    : path.join(__dirname, "invite-cohort.json");
const delayIdx = args.indexOf("--delay-ms");
const delayMs =
  delayIdx >= 0 && args[delayIdx + 1] ? parseInt(args[delayIdx + 1], 10) : 800;

const { UBILL_API_KEY, UBILL_BRAND_ID, MONGODB_URI } = process.env;
if (!dryRun && (!UBILL_API_KEY || !UBILL_BRAND_ID)) {
  console.error("Missing UBILL_API_KEY or UBILL_BRAND_ID in .env");
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

const DB_NAME = process.env.MONGODB_DB || "homi_prod";

if (!fs.existsSync(cohortPath)) {
  console.error(`Cohort file not found: ${cohortPath}`);
  process.exit(1);
}
const cohort = JSON.parse(fs.readFileSync(cohortPath, "utf8"));
if (!Array.isArray(cohort) || cohort.length === 0) {
  console.error(`Cohort is empty or invalid: ${cohortPath}`);
  process.exit(1);
}

function buildMessage(inviteUrl) {
  return (
    `გამარჯობა! Homico-ზე მარტივად იპოვით დამკვეთებს სერვისებზე. ` +
    `რეგისტრაცია უფასოა: ${inviteUrl}\n` +
    `დახმარება: info@homico.ge`
  );
}

async function sendOne(col, entry, idx, total) {
  const row = await col.findOne({ token: entry.token });
  if (!row) {
    console.log(`[${idx + 1}/${total}] ✗ ${entry.phone} — token not found in DB`);
    return { ok: false, reason: "not_found" };
  }
  if (row.smsID) {
    console.log(`[${idx + 1}/${total}] ⇢ ${entry.phone} — already sent (${row.smsID}), skipping`);
    return { ok: true, reason: "already_sent" };
  }
  if (row.status === "activated") {
    console.log(`[${idx + 1}/${total}] ⇢ ${entry.phone} — already activated, skipping`);
    return { ok: true, reason: "already_activated" };
  }

  const inviteUrl = `https://homico.ge/i/${row.token}`;
  const message = buildMessage(inviteUrl);
  const ubillNumber = parseInt(row.phone.replace(/^\+/, ""), 10);

  if (dryRun) {
    console.log(
      `[${idx + 1}/${total}] DRY ${row.phone} [${row.subcategory}] ${message.length}ch → ${inviteUrl}`,
    );
    return { ok: true, reason: "dry_run" };
  }

  let ubillBody = "";
  let ubillStatus = 0;
  try {
    const res = await fetch("https://api.ubill.dev/v1/sms/send", {
      method: "POST",
      headers: { key: UBILL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandID: parseInt(UBILL_BRAND_ID, 10),
        numbers: [ubillNumber],
        text: message,
        stopList: false,
      }),
    });
    ubillStatus = res.status;
    ubillBody = await res.text();
  } catch (err) {
    console.log(`[${idx + 1}/${total}] ✗ ${row.phone} — fetch error: ${err.message}`);
    await col.updateOne(
      { _id: row._id },
      {
        $set: {
          status: "send_failed",
          ubillError: String(err.message),
          updatedAt: new Date(),
        },
      },
    );
    return { ok: false, reason: "fetch_error" };
  }

  if (ubillStatus < 200 || ubillStatus >= 300) {
    console.log(`[${idx + 1}/${total}] ✗ ${row.phone} — UBill ${ubillStatus}: ${ubillBody}`);
    await col.updateOne(
      { _id: row._id },
      {
        $set: {
          status: "send_failed",
          ubillResponse: ubillBody,
          updatedAt: new Date(),
        },
      },
    );
    return { ok: false, reason: "ubill_error" };
  }

  let smsID = null;
  try {
    const parsed = JSON.parse(ubillBody);
    if (parsed && parsed.smsID) smsID = String(parsed.smsID);
  } catch { /* ignore */ }

  await col.updateOne(
    { _id: row._id },
    {
      $set: {
        status: "sms_sent",
        smsID,
        sentAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
  console.log(
    `[${idx + 1}/${total}] ✓ ${row.phone} [${row.subcategory}] smsID=${smsID ?? "n/a"}`,
  );
  return { ok: true, reason: "sent" };
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection("invitetokens");

  console.log(
    `Batch sender — cohort=${cohortPath} size=${cohort.length} db=${DB_NAME} delay=${delayMs}ms dry=${dryRun}`,
  );
  console.log("");

  const stats = { sent: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < cohort.length; i++) {
    const result = await sendOne(col, cohort[i], i, cohort.length);
    if (result.ok && result.reason === "sent") stats.sent++;
    else if (result.ok) stats.skipped++;
    else stats.failed++;
    // Sleep between sends (skip after the last and on dry-run)
    if (!dryRun && i < cohort.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log("");
  console.log(
    `Summary: sent=${stats.sent} skipped=${stats.skipped} failed=${stats.failed} of ${cohort.length}`,
  );

  await client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
