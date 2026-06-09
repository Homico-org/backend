/**
 * One-off migration: fold non-canonical `job.category` values to their
 * canonical Service-Catalog keys (e.g. "plumber" -> "plumbing"), so jobs match
 * the pros listed under the canonical key and analytics stop fragmenting.
 *
 * Dry-run by default (prints what it would change). Set HOMI_CONFIRM=yes to
 * actually write:
 *   npx ts-node -r tsconfig-paths/register scripts/normalize-job-categories.ts            # preview
 *   HOMI_CONFIRM=yes npx ts-node -r tsconfig-paths/register scripts/normalize-job-categories.ts   # apply
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';
import { normalizeCategory } from '../src/jobs/category-normalize';

dotenv.config({ path: resolve(__dirname, '../.env') });

(async () => {
  const apply = process.env.HOMI_CONFIRM === 'yes';
  await mongoose.connect(process.env.MONGODB_URI as string);
  const jobs = mongoose.connection.db!.collection('jobs');

  const cats = await jobs
    .aggregate<{ _id: string | null; n: number }>([
      { $group: { _id: '$category', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  let changed = 0;
  for (const c of cats) {
    const raw = c._id;
    if (raw == null) continue;
    const canon = normalizeCategory(raw);
    if (canon && canon !== raw) {
      console.log(
        `${apply ? 'UPDATE' : 'WOULD UPDATE'}  "${raw}" -> "${canon}"  (${c.n} job${c.n === 1 ? '' : 's'})`,
      );
      changed += c.n;
      if (apply) {
        await jobs.updateMany({ category: raw }, { $set: { category: canon } });
      }
    }
  }

  console.log(
    `\n${apply ? 'Updated' : 'Would update'} ${changed} job(s).`,
  );
  if (!apply) console.log('Dry run - re-run with HOMI_CONFIRM=yes to apply.');

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
