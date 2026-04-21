/**
 * One-off: sync homi_prod to V3 catalog + migrate legacy pro references.
 *
 *   node scripts/sync-homi-prod.js [--apply]
 *
 * Without --apply it just prints what would change. Pass --apply to execute.
 */

const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { buildSeedData } = require('../dist/src/service-catalog/seed-catalog-v3');

const DRY_RUN = !process.argv.includes('--apply');

// Legacy key → V3 key map. Only includes keys that were actually found on
// production pros (see sync-homi-prod survey output).
const SUB_KEY_MAP = {
  'residential-architecture': { categoryKey: 'architects', subKey: 'architecture' },
  'commercial-architecture':  { categoryKey: 'architects', subKey: 'architecture' },
  'industrial-architecture':  { categoryKey: 'architects', subKey: 'architecture' },
  'reconstruction':           { categoryKey: 'architects', subKey: 'permits' },
  'standard_cleaning':        { categoryKey: 'cleaning',   subKey: 'regular_clean' },
};

const SERVICE_KEY_MAP = {
  'std_apt_kitchen': { serviceKey: 'regular_standard_svc', subKey: 'regular_clean', categoryKey: 'cleaning' },
};

async function backup(db, name, docs) {
  const backupName = `${name}_backup_v3sync_${Date.now()}`;
  if (!docs.length) return null;
  await db.collection(backupName).insertMany(docs.map((d) => ({ ...d })));
  console.log(`  ✓ backed up ${docs.length} docs → ${backupName}`);
  return backupName;
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('homi_prod');

  console.log(DRY_RUN ? '─── DRY RUN (no writes) ───' : '─── APPLYING CHANGES ───');

  // 1) Back up pros that have any catalog refs.
  const affectedPros = await db.collection('users').find({
    role: 'pro',
    $or: [
      { selectedSubcategories: { $exists: true, $ne: [] } },
      { 'selectedServices.0': { $exists: true } },
      { 'servicePricing.0': { $exists: true } },
    ],
  }).toArray();

  console.log(`\n[1] Pros with catalog refs: ${affectedPros.length}`);
  if (!DRY_RUN) await backup(db, 'users', affectedPros);

  // 2) Back up + reseed catalog.
  const currentCats = await db.collection('servicecatalogcategories').find({}).toArray();
  console.log(`\n[2] Current catalog: ${currentCats.length} categories`);
  if (!DRY_RUN) await backup(db, 'servicecatalogcategories', currentCats);

  const newCats = buildSeedData();
  console.log(`    New V3 seed: ${newCats.length} categories`);
  if (!DRY_RUN) {
    await db.collection('servicecatalogcategories').deleteMany({});
    for (let i = 0; i < newCats.length; i++) {
      await db.collection('servicecatalogcategories').insertOne({
        ...newCats[i],
        sortOrder: i,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    console.log(`    ✓ catalog reseeded`);
  }

  // 3) Migrate each affected pro in place.
  console.log('\n[3] Migrating pro references:');
  let migratedCount = 0;
  for (const pro of affectedPros) {
    const updates = {};

    // selectedSubcategories
    if (Array.isArray(pro.selectedSubcategories) && pro.selectedSubcategories.length) {
      const mapped = pro.selectedSubcategories
        .map((k) => SUB_KEY_MAP[k]?.subKey ?? k)
        .filter((k, i, arr) => arr.indexOf(k) === i); // dedupe
      if (JSON.stringify(mapped) !== JSON.stringify(pro.selectedSubcategories)) {
        updates.selectedSubcategories = mapped;
      }
    }

    // selectedCategories — recompute from mapped subs
    if (updates.selectedSubcategories) {
      const cats = new Set();
      for (const k of updates.selectedSubcategories) {
        for (const [legacy, v] of Object.entries(SUB_KEY_MAP)) {
          if (v.subKey === k) cats.add(v.categoryKey);
        }
        // Also check new keys that already exist
        for (const c of newCats) {
          if (c.subcategories.some((s) => s.key === k)) cats.add(c.key);
        }
      }
      updates.selectedCategories = [...cats];
    }

    // selectedServices
    if (Array.isArray(pro.selectedServices) && pro.selectedServices.length) {
      const mapped = pro.selectedServices.map((svc) => {
        const m = SUB_KEY_MAP[svc.key];
        if (m) return { ...svc, key: m.subKey, categoryKey: m.categoryKey };
        return svc;
      });
      if (JSON.stringify(mapped) !== JSON.stringify(pro.selectedServices)) {
        updates.selectedServices = mapped;
      }
    }

    // servicePricing
    if (Array.isArray(pro.servicePricing) && pro.servicePricing.length) {
      const mapped = pro.servicePricing
        .map((sp) => {
          const serviceMapped = SERVICE_KEY_MAP[sp.serviceKey];
          const subMapped = SUB_KEY_MAP[sp.subcategoryKey];
          if (!serviceMapped && !subMapped) return sp;
          return {
            ...sp,
            serviceKey: serviceMapped?.serviceKey ?? sp.serviceKey,
            subcategoryKey: serviceMapped?.subKey ?? subMapped?.subKey ?? sp.subcategoryKey,
            categoryKey: serviceMapped?.categoryKey ?? subMapped?.categoryKey ?? sp.categoryKey,
          };
        });
      if (JSON.stringify(mapped) !== JSON.stringify(pro.servicePricing)) {
        updates.servicePricing = mapped;
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log(`    [${pro.name || pro.email || pro._id}]`);
      console.log(`      before subs: ${JSON.stringify(pro.selectedSubcategories ?? [])}`);
      console.log(`      after  subs: ${JSON.stringify(updates.selectedSubcategories ?? pro.selectedSubcategories ?? [])}`);
      if (!DRY_RUN) {
        await db.collection('users').updateOne({ _id: pro._id }, { $set: updates });
      }
      migratedCount++;
    }
  }
  console.log(`    ${DRY_RUN ? 'would migrate' : 'migrated'}: ${migratedCount} pros`);

  if (DRY_RUN) console.log('\n─── DRY RUN complete. Re-run with --apply ───');
  else console.log('\n─── DONE ───');

  await client.close();
})().catch((err) => { console.error(err); process.exit(1); });
