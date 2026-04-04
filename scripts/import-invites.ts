/**
 * Import scraped providers as invite tokens
 *
 * Usage:
 *   npx ts-node scripts/import-invites.ts [prod|dev]
 *
 * Reads JSON files from scrape-output/ and creates InviteToken documents.
 * Safe to re-run — uses upsert on phone to avoid duplicates.
 */

import * as crypto from "crypto";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const targetEnv = args[0] || "prod";

const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI?.replace("/homi?", "/homi_prod?") || "",
  dev: process.env.MONGODB_URI?.replace("/homi?", "/homi_dev?") || "",
};

const MONGODB_URI = DB_URIS[targetEnv] || DB_URIS.prod;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
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
    servisebiId: { type: Number, unique: true, sparse: true },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    status: { type: String, default: "pending", index: true },
    smsSentAt: { type: Date },
    activatedAt: { type: Date },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const InviteToken = mongoose.model("InviteToken", inviteTokenSchema);

interface ScrapedProvider {
  servisebiId: number;
  type: string;
  name: string;
  phone: string;
  city: string | null;
  cityKey: string | null;
  category: string;
  subcategory: string;
  categoryKa: string;
  subcategoryKa: string;
  rating: number;
  reviewCount: number;
}

async function main() {
  console.log(`\nImporting invites to ${targetEnv} database...\n`);

  await mongoose.connect(MONGODB_URI);

  const outputDir = resolve(__dirname, "../scrape-output");
  const files = ["professionals.json", "services.json", "tool-rentals.json"];

  // Load and deduplicate by phone (keep highest rated)
  const phoneMap = new Map<string, ScrapedProvider>();

  for (const file of files) {
    const path = resolve(outputDir, file);
    if (!fs.existsSync(path)) {
      console.log(`  Skipping ${file} (not found)`);
      continue;
    }

    const data: ScrapedProvider[] = JSON.parse(
      fs.readFileSync(path, "utf-8"),
    );
    console.log(`  Loaded ${data.length} from ${file}`);

    for (const p of data) {
      if (!p.phone) continue;
      const existing = phoneMap.get(p.phone);
      if (!existing || p.rating > existing.rating) {
        phoneMap.set(p.phone, p);
      }
    }
  }

  console.log(`\n  Total unique phones: ${phoneMap.size}\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const provider of phoneMap.values()) {
    try {
      const existing = await InviteToken.findOne({ phone: provider.phone });
      if (existing) {
        skipped++;
        continue;
      }

      const token = crypto.randomBytes(16).toString("hex");

      await InviteToken.create({
        token,
        phone: provider.phone,
        name: provider.name,
        city: provider.city,
        cityKey: provider.cityKey,
        category: provider.category,
        subcategory: provider.subcategory,
        categoryKa: provider.categoryKa,
        subcategoryKa: provider.subcategoryKa,
        type: provider.type,
        servisebiId: provider.servisebiId,
        rating: provider.rating,
        reviewCount: provider.reviewCount,
        status: "pending",
      });

      created++;
    } catch (err: any) {
      if (err.code === 11000) {
        skipped++;
      } else {
        errors++;
        console.error(`  Error for ${provider.phone}: ${err.message}`);
      }
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (existing): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
