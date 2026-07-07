/**
 * Upsert ALL service-catalog categories from buildSeedData() into the DB
 * pointed to by MONGODB_URI (homi_dev locally). Upsert-by-key; does not delete
 * other collections. Temporary helper for the catalog revamp.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/seed-catalog-dev.ts
 */
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

import { buildSeedData } from '../src/service-catalog/seed';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');
  const dbName = uri.match(/\/([^/?]+)\?/)?.[1] ?? '(unknown)';
  // eslint-disable-next-line no-console
  console.log(`DB: ${dbName}`);
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db;
  if (!db) throw new Error('No db handle');
  const coll = db.collection('servicecatalogcategories');
  const cats = buildSeedData();
  let i = 0;
  for (const c of cats) {
    await coll.updateOne(
      { key: c.key },
      { $set: { ...c, sortOrder: i }, $inc: { version: 1 } },
      { upsert: true },
    );
    i++;
  }
  // eslint-disable-next-line no-console
  console.log(`upserted ${cats.length} categories`);
  const pl: any = await coll.findOne({ key: 'plumbing' });
  // eslint-disable-next-line no-console
  console.log(
    `plumbing: subs=${(pl?.subcategories || []).length} services=${(pl?.subcategories || []).reduce((s: number, x: any) => s + (x.services || []).length, 0)}`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
