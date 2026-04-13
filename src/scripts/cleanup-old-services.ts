/**
 * Cleanup script: removes old servicePricing and selectedServices entries
 * that reference catalog keys no longer in the service catalog.
 *
 * Run via: npx ts-node -r tsconfig-paths/register src/scripts/cleanup-old-services.ts
 * Or add to a NestJS CLI command / admin endpoint.
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';

async function cleanup() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const catalogModel = app.get(getModelToken('CatalogCategory'));
  const userModel = app.get(getModelToken('User'));

  // Build set of valid keys from current catalog
  const validKeys = new Set<string>();
  const categories = await catalogModel.find({ isActive: true }).lean().exec();
  for (const cat of categories) {
    validKeys.add((cat as Record<string, string>).key);
    for (const sub of ((cat as Record<string, unknown[]>).subcategories || [])) {
      const s = sub as Record<string, unknown>;
      validKeys.add(s.key as string);
      for (const svc of ((s.services as Record<string, string>[]) || [])) {
        validKeys.add(svc.key);
      }
    }
  }

  console.log(`Found ${validKeys.size} valid catalog keys`);

  // Find all pro users with servicePricing
  const pros = await userModel.find({
    role: 'pro',
    $or: [
      { 'servicePricing.0': { $exists: true } },
      { 'selectedServices.0': { $exists: true } },
    ],
  }).exec();

  console.log(`Found ${pros.length} pros to check`);

  let updatedCount = 0;
  for (const pro of pros) {
    const updates: Record<string, unknown> = {};

    // Filter servicePricing
    if (pro.servicePricing?.length > 0) {
      const filtered = pro.servicePricing.filter(
        (sp: Record<string, string>) => validKeys.has(sp.serviceKey) || validKeys.has(sp.subcategoryKey),
      );
      if (filtered.length !== pro.servicePricing.length) {
        updates.servicePricing = filtered;
        console.log(`  ${pro.name}: servicePricing ${pro.servicePricing.length} → ${filtered.length}`);
      }
    }

    // Filter selectedServices
    if (pro.selectedServices?.length > 0) {
      const filtered = pro.selectedServices.filter(
        (ss: Record<string, string>) => validKeys.has(ss.key) || validKeys.has(ss.categoryKey),
      );
      if (filtered.length !== pro.selectedServices.length) {
        updates.selectedServices = filtered;
        console.log(`  ${pro.name}: selectedServices ${pro.selectedServices.length} → ${filtered.length}`);
      }
    }

    // Filter selectedCategories
    if (pro.selectedCategories?.length > 0) {
      const filtered = pro.selectedCategories.filter((key: string) => validKeys.has(key));
      if (filtered.length !== pro.selectedCategories.length) {
        updates.selectedCategories = filtered;
      }
    }

    // Filter selectedSubcategories
    if (pro.selectedSubcategories?.length > 0) {
      const filtered = pro.selectedSubcategories.filter((key: string) => validKeys.has(key));
      if (filtered.length !== pro.selectedSubcategories.length) {
        updates.selectedSubcategories = filtered;
      }
    }

    if (Object.keys(updates).length > 0) {
      await userModel.updateOne({ _id: pro._id }, { $set: updates });
      updatedCount++;
    }
  }

  console.log(`\nDone! Updated ${updatedCount} pros.`);
  await app.close();
}

cleanup().catch(console.error);
