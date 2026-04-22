/**
 * Send a Homico invite SMS to one phone number.
 *
 *   node scripts/send-invite-sms.js <phone> [name] [--force]
 *
 * Creates an InviteToken in MongoDB and sends the marketing SMS via UBill.
 * Refuses to send if this phone already has a token (use --force to override).
 * Requires UBILL_API_KEY + UBILL_BRAND_ID + MONGODB_URI in backend/.env.
 */

const crypto = require('crypto');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter((a) => !a.startsWith('--'));
const [rawPhone, rawName = 'პროფესიონალი'] = positional;

if (!rawPhone) {
  console.error('Usage: node scripts/send-invite-sms.js <phone> [name] [--force]');
  process.exit(1);
}

const { UBILL_API_KEY, UBILL_BRAND_ID, MONGODB_URI } = process.env;
if (!UBILL_API_KEY || !UBILL_BRAND_ID) {
  console.error('Missing UBILL_API_KEY or UBILL_BRAND_ID in .env');
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

// Normalize phone — Georgian local 9-digit → +995XXXXXXXXX
const cleaned = rawPhone.replace(/\s+/g, '');
const phone = /^\d{9}$/.test(cleaned) ? `+995${cleaned}` : cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
const ubillNumber = parseInt(phone.replace(/^\+/, ''), 10);

// Target DB — prod uses homi_prod on the shared Atlas cluster. Override with
// MONGODB_DB env var if needed.
const DB_NAME = process.env.MONGODB_DB || 'homi_prod';

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const col = client.db(DB_NAME).collection('invitetokens');

  // Dedupe: refuse to re-send if this phone already has any invite token.
  // Use --force to override (e.g. after manually deleting a stale row).
  const existing = await col.findOne({ phone });
  if (existing && !force) {
    console.error(
      `⚠ Phone ${phone} already has an invite (status: ${existing.status}, ` +
      `token: ${existing.token}, sent: ${existing.createdAt?.toISOString?.() ?? 'n/a'}).`,
    );
    console.error('  Use --force to send anyway.');
    await client.close();
    process.exit(2);
  }

  const token = `inv-${crypto.randomBytes(6).toString('hex')}`;
  const now = new Date();

  const insertResult = await col.insertOne({
    token,
    phone,
    name: rawName,
    city: 'თბილისი',
    cityKey: 'tbilisi',
    // V3 catalog keys (not legacy plumber/pipes)
    category: 'plumbing',
    categoryKa: 'სანტექნიკა',
    subcategory: 'plumbing_install',
    subcategoryKa: 'ახალი მონტაჟი და დაყენება',
    type: 'professional',
    rating: 0,
    reviewCount: 0,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });
  console.log(`✓ Invite token created: ${token}`);

  const inviteUrl = `https://homico.ge/i/${token}`;
  // No name prefix — the `name` we have is often a scraped service title
  // (e.g. "შუშის კარის რეგულირება"), not a person, so personalizing with
  // it reads absurdly. Generic opener works for everyone.
  const message =
    `გამარჯობა! Homico-ზე მარტივად იპოვით დამკვეთებს სერვისებზე. ` +
    `რეგისტრაცია უფასოა: ${inviteUrl}\n` +
    `დახმარება: info@homico.ge`;

  console.log(`\n--- SMS to ${phone} (${message.length} chars) ---\n${message}\n---`);

  const res = await fetch('https://api.ubill.dev/v1/sms/send', {
    method: 'POST',
    headers: { key: UBILL_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brandID: parseInt(UBILL_BRAND_ID, 10),
      numbers: [ubillNumber],
      text: message,
      stopList: false,
    }),
  });

  const body = await res.text();
  console.log(`UBill response: ${res.status} ${body}`);
  if (!res.ok) {
    // Mark the row as failed so we don't consider this phone "already sent".
    await col.updateOne(
      { _id: insertResult.insertedId },
      { $set: { status: 'send_failed', ubillResponse: body, updatedAt: new Date() } },
    );
    process.exit(1);
  }

  // Record the UBill smsID so we can correlate with UBill's delivery dashboard.
  let smsID = null;
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.smsID) smsID = String(parsed.smsID);
  } catch { /* non-JSON response, leave smsID null */ }

  await col.updateOne(
    { _id: insertResult.insertedId },
    {
      $set: {
        status: 'sms_sent',
        smsID,
        sentAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );

  console.log('\n✓ SMS queued');
  console.log(`  smsID: ${smsID ?? 'n/a'}`);
  console.log(`  Open in browser: ${inviteUrl}`);

  await client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
