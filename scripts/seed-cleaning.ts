/**
 * Surgical seed: upsert ONLY the cleaning category into the DB pointed to by
 * MONGODB_URI (homi_dev locally). Does NOT touch other categories or run the
 * full reconcile/delete pass. Temporary helper for the cleaning revamp.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/seed-cleaning.ts
 */
import * as dotenv from 'dotenv';
import * as mongoose from 'mongoose';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

import { cleaningCategory } from '../src/service-catalog/seed/categories/cleaning';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI');
  const dbName = uri.match(/\/([^/?]+)\?/)?.[1] ?? '(unknown)';
  // eslint-disable-next-line no-console
  console.log(`Connecting to DB: ${dbName}`);
  const conn = await mongoose.connect(uri);
  const db = conn.connection.db;
  if (!db) throw new Error('No db handle after connect');
  const coll = db.collection('servicecatalogcategories');
  const res = await coll.updateOne(
    { key: 'cleaning' },
    { $set: { ...cleaningCategory }, $inc: { version: 1 } },
    { upsert: true },
  );
  // eslint-disable-next-line no-console
  console.log(
    `cleaning: matched=${res.matchedCount} modified=${res.modifiedCount} upserted=${res.upsertedCount}`,
  );
  const doc: any = await coll.findOne({ key: 'cleaning' });
  const s001 = (doc?.subcategories ?? []).find((s: any) => s.id === 'S001');
  // eslint-disable-next-line no-console
  console.log(
    `S001 label.ka="${s001?.label?.ka}" services=${s001?.services?.length} addons=${s001?.addons?.length} hasDesc=${!!s001?.description?.ka}`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
