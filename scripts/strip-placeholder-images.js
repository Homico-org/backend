/**
 * Strip placeholder images (e.g. classica's bag.svg) from already-scraped
 * supplier products so the catalog stores real photos or nothing. The UI then
 * renders its own clean fallback instead of a random shopping-bag graphic.
 *
 *   node scripts/strip-placeholder-images.js            # dry run (counts only)
 *   HOMI_CONFIRM=yes node scripts/strip-placeholder-images.js   # apply
 *
 * Going forward the sync service (stripPlaceholderImages) keeps new data clean;
 * this is the one-off backfill for existing rows.
 */

const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PLACEHOLDER =
  '(/bag\\.svg)|placeholder|no[-_]?image|noimage|default[-_]?(product|image)';

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing in backend/.env');
    process.exit(1);
  }
  const apply = process.env.HOMI_CONFIRM === 'yes';
  const client = new MongoClient(uri);
  await client.connect();
  const db = process.env.MONGODB_DB ? client.db(process.env.MONGODB_DB) : client.db();
  const col = db.collection('supplier_products');

  const filter = {
    $or: [
      { imageUrl: { $regex: PLACEHOLDER, $options: 'i' } },
      { imageUrls: { $elemMatch: { $regex: PLACEHOLDER, $options: 'i' } } },
    ],
  };

  const matched = await col.countDocuments(filter);
  console.log(`DB: ${db.databaseName}`);
  console.log(`Products with placeholder images: ${matched}`);

  if (!apply) {
    console.log('\nDRY RUN - no changes written.');
    console.log('Re-run with HOMI_CONFIRM=yes to apply.');
    await client.close();
    return;
  }

  const res = await col.updateMany(filter, [
    {
      $set: {
        imageUrls: {
          $filter: {
            input: { $ifNull: ['$imageUrls', []] },
            as: 'u',
            cond: {
              $not: [
                { $regexMatch: { input: '$$u', regex: PLACEHOLDER, options: 'i' } },
              ],
            },
          },
        },
      },
    },
    { $set: { imageUrl: { $ifNull: [{ $arrayElemAt: ['$imageUrls', 0] }, null] } } },
  ]);

  console.log(`\nUpdated ${res.modifiedCount} products.`);
  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
