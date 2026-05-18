/**
 * Migration: move Heating (S034 + variants V117-V122, V228) from C08 (HVAC)
 * into C05 (Plumbing & Heating).
 *
 * In 2026-05 we collapsed plumbing and heating into one trade category
 * because in the Georgian market the same pro does both. Cooling/AC stays
 * in C08 (renamed AC & Ventilation). Existing pros who had heating tagged
 * under C08 need their tags rewritten so they keep showing up in heating
 * searches.
 *
 * What this does for every user document:
 *   1. `selectedServices`: any entry with categoryId C08 + heating
 *      subcategory id S034 -> rewrite categoryId to C05, categoryKey
 *      to "plumbing".
 *   2. `servicePricing`: any entry with categoryId C08 + subcategoryId S034
 *      or a heating serviceId (V117-V122, V228) -> rewrite categoryId to
 *      C05, categoryKey to "plumbing".
 *   3. `selectedCategories`: if any rewritten entry above pushed the user
 *      into plumbing, ensure "C05" is in the array. If the user no longer
 *      has any C08 service after the rewrite, drop "C08" from the array.
 *
 * Idempotent - re-running is a no-op once everyone is migrated.
 *
 * Run: npx ts-node scripts/migrate-heating-to-plumbing.ts
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/homi';

const HEATING_SUB_ID = 'S034';
const HEATING_VARIANT_IDS = new Set(['V117', 'V118', 'V119', 'V120', 'V121', 'V122', 'V228']);
const OLD_CATEGORY_ID = 'C08';
const NEW_CATEGORY_ID = 'C05';
const NEW_CATEGORY_KEY = 'plumbing';

interface SelectedService {
  id?: string;
  categoryId?: string;
  key?: string;
  categoryKey?: string;
  name?: string;
  nameKa?: string;
  experience?: string;
}

interface ServicePricing {
  serviceId?: string;
  categoryId?: string;
  subcategoryId?: string;
  unitId?: string;
  serviceKey?: string;
  categoryKey?: string;
  subcategoryKey?: string;
  variantKey?: string;
  unitKey?: string;
  price?: number;
  isActive?: boolean;
  [extra: string]: unknown;
}

interface UserDoc {
  _id: unknown;
  selectedCategories?: string[];
  selectedServices?: SelectedService[];
  servicePricing?: ServicePricing[];
}

function isHeatingService(svc: SelectedService): boolean {
  return svc.categoryId === OLD_CATEGORY_ID && svc.id === HEATING_SUB_ID;
}

function isHeatingPricing(p: ServicePricing): boolean {
  if (p.categoryId !== OLD_CATEGORY_ID) return false;
  if (p.subcategoryId === HEATING_SUB_ID) return true;
  if (p.serviceId && HEATING_VARIANT_IDS.has(p.serviceId)) return true;
  return false;
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database connection');
    process.exit(1);
  }

  const users = db.collection<UserDoc>('users');

  // Anyone with a C08 heating tag anywhere - selectedServices or pricing
  const filter = {
    $or: [
      { 'selectedServices': { $elemMatch: { categoryId: OLD_CATEGORY_ID, id: HEATING_SUB_ID } } },
      { 'servicePricing': { $elemMatch: { categoryId: OLD_CATEGORY_ID, subcategoryId: HEATING_SUB_ID } } },
      { 'servicePricing': { $elemMatch: { categoryId: OLD_CATEGORY_ID, serviceId: { $in: Array.from(HEATING_VARIANT_IDS) } } } },
    ],
  };

  const candidates = await users.find(filter).toArray();
  console.log(`Found ${candidates.length} users with heating tags under C08.`);

  if (candidates.length === 0) {
    console.log('Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  let touched = 0;
  let stillHaveC08 = 0;
  let droppedC08 = 0;
  let addedC05 = 0;

  for (const user of candidates) {
    const selectedServices = user.selectedServices ?? [];
    const servicePricing = user.servicePricing ?? [];
    const selectedCategories = new Set(user.selectedCategories ?? []);

    // Rewrite selectedServices in place
    const nextServices = selectedServices.map((svc) =>
      isHeatingService(svc)
        ? { ...svc, categoryId: NEW_CATEGORY_ID, categoryKey: NEW_CATEGORY_KEY }
        : svc,
    );

    // Rewrite servicePricing in place
    const nextPricing = servicePricing.map((p) =>
      isHeatingPricing(p)
        ? { ...p, categoryId: NEW_CATEGORY_ID, categoryKey: NEW_CATEGORY_KEY }
        : p,
    );

    // Decide selectedCategories changes
    const hadC08 = selectedCategories.has(OLD_CATEGORY_ID);
    const hadC05 = selectedCategories.has(NEW_CATEGORY_ID);

    selectedCategories.add(NEW_CATEGORY_ID);
    if (!hadC05) addedC05++;

    // Drop C08 only if no remaining service or pricing entry references it
    const stillHasC08Service = nextServices.some((s) => s.categoryId === OLD_CATEGORY_ID);
    const stillHasC08Pricing = nextPricing.some((p) => p.categoryId === OLD_CATEGORY_ID);
    if (hadC08 && !stillHasC08Service && !stillHasC08Pricing) {
      selectedCategories.delete(OLD_CATEGORY_ID);
      droppedC08++;
    } else if (hadC08) {
      stillHaveC08++;
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          selectedServices: nextServices,
          servicePricing: nextPricing,
          selectedCategories: Array.from(selectedCategories),
        },
      },
    );

    touched++;
  }

  console.log(`Migrated ${touched} users.`);
  console.log(`  Added C05 (Plumbing & Heating) tag to ${addedC05} pros.`);
  console.log(`  Dropped C08 tag from ${droppedC08} pros (had heating only).`);
  console.log(`  ${stillHaveC08} pros kept C08 because they also offer AC/ventilation.`);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
