/**
 * Create a single test invite token for local QA.
 *
 * Usage:
 *   npx ts-node scripts/create-test-invite.ts <phone> [name] [category] [subcategory]
 *
 * Example:
 *   npx ts-node scripts/create-test-invite.ts 571072007 "Test User"
 *
 * Prints the URL you can open in the browser:
 *   http://localhost:3000/invite/<token>
 */

import * as crypto from "crypto";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const [, , rawPhone, name = "Test Pro", category = "plumber", subcategory = "pipes"] =
  process.argv;

if (!rawPhone) {
  console.error("Usage: npx ts-node scripts/create-test-invite.ts <phone> [name]");
  process.exit(1);
}

// Normalize phone — strip spaces, prefix +995 if 9-digit Georgian local number
const cleaned = rawPhone.replace(/\s+/g, "");
const phone = /^\d{9}$/.test(cleaned) ? `+995${cleaned}` : cleaned;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

const inviteTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: true, index: true },
    name: { type: String, required: true },
    city: { type: String },
    cityKey: { type: String },
    category: { type: String, required: true },
    subcategory: { type: String, required: true },
    categoryKa: { type: String },
    subcategoryKa: { type: String },
    type: { type: String },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    status: { type: String, default: "pending", index: true },
  },
  { timestamps: true },
);

const InviteToken = mongoose.model("InviteToken", inviteTokenSchema);

(async () => {
  await mongoose.connect(MONGODB_URI);

  const token = `test-${crypto.randomBytes(8).toString("hex")}`;

  const invite = await InviteToken.create({
    token,
    phone,
    name,
    city: "თბილისი",
    cityKey: "tbilisi",
    category,
    categoryKa: "სანტექნიკოსი",
    subcategory,
    subcategoryKa: "მილები და გაჟონვა",
    type: "professional",
    rating: 4.8,
    reviewCount: 0,
    status: "pending",
  });

  console.log("\n✓ Invite created");
  console.log(`  phone: ${phone}`);
  console.log(`  name:  ${name}`);
  console.log(`  _id:   ${invite._id}`);
  console.log(`  token: ${token}`);
  console.log(`\nOpen in browser:`);
  console.log(`  http://localhost:3000/invite/${token}\n`);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
