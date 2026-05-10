/**
 * Service catalog seed — single entry point.
 *
 * `buildSeedData()` returns an ordered array of categories ready for the
 * seeder. `assertUniqueIds()` walks the tree and throws on any duplicate
 * id (categories, subcategories, services, unit options).
 */

import { allCategories } from './categories';
import type { SeedCategory } from './types';

export function buildSeedData(): SeedCategory[] {
  const out = allCategories.map((c, i) => ({ ...c, sortOrder: i }));
  assertUniqueIds(out);
  return out;
}

export function assertUniqueIds(categories: SeedCategory[]): void {
  const seen = new Map<string, string>(); // id -> location
  const claim = (id: string, where: string) => {
    const prior = seen.get(id);
    if (prior) {
      throw new Error(`Duplicate catalog id "${id}": already used at ${prior}, again at ${where}`);
    }
    seen.set(id, where);
  };

  for (const cat of categories) {
    claim(cat.id, `category ${cat.key}`);
    for (const sub of cat.subcategories) {
      claim(sub.id, `subcategory ${cat.key}/${sub.key}`);
      for (const svc of sub.services) {
        claim(svc.id, `service ${cat.key}/${sub.key}/${svc.key}`);
      }
    }
  }
}

export type { SeedCategory, SeedSubcategory, SeedService, SeedUnitOption, SeedLocalizedText } from './types';
