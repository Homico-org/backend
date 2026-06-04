/**
 * Migration: backfill `country: "GE"` and `currency: "GEL"` on all
 * existing documents that pre-date the multi-country foundation
 * (2026-05).
 *
 * Until now Homico has been Georgia-only, so every existing pro, job,
 * booking and servicePricing entry is implicitly Georgian. This script
 * makes that implicit fact explicit so future country-scoped queries
 * (`/users/pros?country=GE`, `/jobs?country=GE`) actually match the
 * historical data instead of silently dropping it.
 *
 * What it touches:
 *   users   - role:'pro' AND country missing  -> set country = "GE"
 *   jobs    - country missing                 -> set country = "GE"
 *   bookings - country missing                -> set country = "GE"
 *   bookings - totalAmount > 0 AND currency missing -> set currency = "GEL"
 *   users.servicePricing[] - any entry missing currency -> set "GEL"
 *
 * Client users are intentionally NOT touched - clients are global
 * (anyone can browse any marketplace) and don't carry a country tag.
 *
 * Idempotent: re-running is a no-op once everything is backfilled. Run
 * once after the deploy that adds these schema fields.
 *
 * Run:
 *   npx ts-node scripts/backfill-country-ge.ts
 */

import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/homi";

const DEFAULT_COUNTRY = "GE";
const DEFAULT_CURRENCY = "GEL";

async function backfill() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI);
  console.log("Connected.");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("No database connection");
    process.exit(1);
  }

  const users = db.collection("users");
  const jobs = db.collection("jobs");
  const bookings = db.collection("bookings");

  // 1. Pros without a country
  const prosToBackfill = await users.countDocuments({
    role: "pro",
    $or: [{ country: { $exists: false } }, { country: null }, { country: "" }],
  });
  if (prosToBackfill > 0) {
    const res = await users.updateMany(
      {
        role: "pro",
        $or: [
          { country: { $exists: false } },
          { country: null },
          { country: "" },
        ],
      },
      { $set: { country: DEFAULT_COUNTRY } },
    );
    console.log(`pros: set country=${DEFAULT_COUNTRY} on ${res.modifiedCount} (matched ${res.matchedCount})`);
  } else {
    console.log("pros: nothing to backfill");
  }

  // 2. Jobs without a country
  const jobsToBackfill = await jobs.countDocuments({
    $or: [{ country: { $exists: false } }, { country: null }, { country: "" }],
  });
  if (jobsToBackfill > 0) {
    const res = await jobs.updateMany(
      {
        $or: [
          { country: { $exists: false } },
          { country: null },
          { country: "" },
        ],
      },
      { $set: { country: DEFAULT_COUNTRY } },
    );
    console.log(`jobs: set country=${DEFAULT_COUNTRY} on ${res.modifiedCount} (matched ${res.matchedCount})`);
  } else {
    console.log("jobs: nothing to backfill");
  }

  // 3. Bookings without a country
  const bookingsToBackfill = await bookings.countDocuments({
    $or: [{ country: { $exists: false } }, { country: null }, { country: "" }],
  });
  if (bookingsToBackfill > 0) {
    const res = await bookings.updateMany(
      {
        $or: [
          { country: { $exists: false } },
          { country: null },
          { country: "" },
        ],
      },
      { $set: { country: DEFAULT_COUNTRY } },
    );
    console.log(`bookings: set country=${DEFAULT_COUNTRY} on ${res.modifiedCount} (matched ${res.matchedCount})`);
  } else {
    console.log("bookings: nothing to backfill");
  }

  // 4. Bookings with totalAmount but no currency
  const bookingsNeedCurrency = await bookings.countDocuments({
    totalAmount: { $gt: 0 },
    $or: [
      { currency: { $exists: false } },
      { currency: null },
      { currency: "" },
    ],
  });
  if (bookingsNeedCurrency > 0) {
    const res = await bookings.updateMany(
      {
        totalAmount: { $gt: 0 },
        $or: [
          { currency: { $exists: false } },
          { currency: null },
          { currency: "" },
        ],
      },
      { $set: { currency: DEFAULT_CURRENCY } },
    );
    console.log(`bookings: set currency=${DEFAULT_CURRENCY} on ${res.modifiedCount} (matched ${res.matchedCount})`);
  } else {
    console.log("bookings: currency already populated where needed");
  }

  // 5. servicePricing entries missing currency. Use the $[] positional
  // operator scoped to entries where currency doesn't yet exist.
  const pricingRes = await users.updateMany(
    { "servicePricing.0": { $exists: true } },
    { $set: { "servicePricing.$[elem].currency": DEFAULT_CURRENCY } },
    {
      arrayFilters: [
        {
          $or: [
            { "elem.currency": { $exists: false } },
            { "elem.currency": null },
            { "elem.currency": "" },
          ],
        },
      ],
    },
  );
  console.log(
    `servicePricing: ${pricingRes.modifiedCount} pro doc(s) had entries currency-tagged GEL`,
  );

  await mongoose.disconnect();
  console.log("Done.");
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
