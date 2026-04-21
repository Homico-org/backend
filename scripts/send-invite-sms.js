/**
 * Send a Homico invite SMS to one phone number.
 *
 *   node scripts/send-invite-sms.js <phone> [name]
 *
 * Creates an InviteToken in MongoDB and sends the marketing SMS via UBill.
 * Requires UBILL_API_KEY + UBILL_BRAND_ID + MONGODB_URI in backend/.env.
 */

const crypto = require('crypto');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const [, , rawPhone, rawName = 'პროფესიონალი'] = process.argv;

if (!rawPhone) {
  console.error('Usage: node scripts/send-invite-sms.js <phone> [name]');
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

  const token = `inv-${crypto.randomBytes(6).toString('hex')}`;

  await col.insertOne({
    token,
    phone,
    name: rawName,
    city: 'თბილისი',
    cityKey: 'tbilisi',
    category: 'plumber',
    categoryKa: 'სანტექნიკოსი',
    subcategory: 'pipes',
    subcategoryKa: 'მილები',
    type: 'professional',
    rating: 0,
    reviewCount: 0,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  console.log(`✓ Invite token created: ${token}`);

  const inviteUrl = `https://homico.ge/i/${token}`;
  const message =
    `${rawName}, Homico-ზე პირველ 100 პროფესიონალში მოხვდით!\n` +
    `რეგისტრაცია თქვენთვის უფასოა - ${inviteUrl}\n` +
    `კითხვებისთვის მოგვწერეთ - info@homico.ge`;

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
  if (!res.ok) process.exit(1);

  console.log('\n✓ SMS queued');
  console.log(`  Open in browser: ${inviteUrl}`);

  await client.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
