/**
 * Migration: backfill `isHomicoPartner / isFeatured / isPremium: false` on
 * pro documents that pre-date these schema fields.
 *
 * The browse listing sorts on these three flags first (partners, then
 * featured, then premium). New registrations get an explicit `false` from
 * the schema defaults, but legacy pros carry no field at all - and Mongo's
 * descending sort places `false` ABOVE a missing field. Net effect: every
 * brand-new empty profile outranked every legacy pro (badges, portfolio,
 * ratings included) before the rest of the sort keys were ever compared.
 *
 * The listing query also coalesces these flags at query time ($ifNull in
 * users.service.ts), so this backfill is not strictly required for correct
 * ordering - it makes the data itself consistent so the existing indexes
 * on these fields stay usable and future queries don't need the same
 * workaround.
 *
 * Client users are intentionally NOT touched - the flags only mean
 * something on pro profiles, which is all the listing ranks.
 *
 * Idempotent: re-running is a no-op once everything is backfilled.
 *
 * Run:
 *   npx ts-node scripts/backfill-ranking-flags.ts
 */

import mongoose from "mongoose";
import * as dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/homi";

const FLAGS = ["isHomicoPartner", "isFeatured", "isPremium"] as const;

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

  for (const flag of FLAGS) {
    const missing = await users.countDocuments({
      role: "pro",
      $or: [{ [flag]: { $exists: false } }, { [flag]: null }],
    });
    if (missing > 0) {
      const res = await users.updateMany(
        {
          role: "pro",
          $or: [{ [flag]: { $exists: false } }, { [flag]: null }],
        },
        { $set: { [flag]: false } },
      );
      console.log(
        `pros: set ${flag}=false on ${res.modifiedCount} (matched ${res.matchedCount})`,
      );
    } else {
      console.log(`pros: ${flag} already populated everywhere`);
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
