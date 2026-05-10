/**
 * Helpers used by per-category seed files.
 *
 * The translation lookup is by stable id only — never by English label —
 * so renaming a label in any locale never silently desyncs the others.
 */

import { translations } from './translations';
import type { SeedCategory, SeedService, SeedSubcategory, SeedUnitOption } from './types';

function lookup(id: string): { en: string; ka: string; ru: string } {
  const tr = translations[id];
  if (!tr) {
    throw new Error(
      `Missing translation for catalog id "${id}". Add it to seed/translations.ts.`,
    );
  }
  return tr;
}

export function svc(id: string, key: string, unitOpts: SeedUnitOption[]): SeedService {
  if (unitOpts.length === 0) {
    throw new Error(`Service "${id}" must have at least one unit option.`);
  }
  const primary = unitOpts[0];
  return {
    id,
    key,
    label: lookup(id),
    unitOptions: unitOpts,
    basePrice: primary.defaultPrice,
    maxPrice: primary.maxPrice,
    unit: primary.unit,
    unitLabel: primary.label,
  };
}

export function sub(
  id: string,
  key: string,
  iconName: string,
  services: SeedService[],
  sortOrder: number,
): SeedSubcategory {
  // NOTE: matches legacy seed-catalog-v3 behavior — `min` was always 0 because
  // `Math.min(..., 0)` floors the result. Kept as-is for parity; revisit when
  // we actually surface priceRange in the UI.
  const prices = services.map((s) => s.basePrice).filter((p) => p > 0);
  return {
    id,
    key,
    label: lookup(id),
    iconName,
    priceRange: {
      min: Math.min(...prices, 0),
      max: Math.max(...prices, 0),
    },
    sortOrder,
    isActive: true,
    services,
    addons: [],
    additionalServices: [],
  };
}

export function cat(
  id: string,
  key: string,
  iconName: string,
  color: string,
  minPrice: number,
  sortOrder: number,
  subcategories: SeedSubcategory[],
): SeedCategory {
  return {
    id,
    key,
    label: lookup(id),
    iconName,
    color,
    minPrice,
    sortOrder,
    isActive: true,
    subcategories,
  };
}
