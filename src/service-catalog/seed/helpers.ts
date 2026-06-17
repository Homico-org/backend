/**
 * Helpers used by per-category seed files.
 *
 * The translation lookup is by stable id only — never by English label —
 * so renaming a label in any locale never silently desyncs the others.
 */

import { translations } from './translations';
import type { SeedAddon, SeedCategory, SeedLocalizedText, SeedService, SeedSubcategory, SeedUnitOption } from './types';

/**
 * Optional extras a `sub()` / `svc()` call can carry on top of the
 * required positional args. Kept as a trailing options bag rather than
 * extra positional params so the common single-line `sub("Sxx", ...)`
 * call sites stay readable. Today only `keywords` + `tags` flow
 * through; add more fields here as the seed schema grows.
 */
export interface SeedExtras {
  /**
   * Localized search synonyms. Each entry is a single concept spelled
   * in each locale we care about - e.g. drywall as
   * `{ en: "gipso drywall gypsum plasterboard",
   *    ka: "გიფსოკარტონი გიფსო",
   *    ru: "гипсокартон штукатурка" }`.
   * The API flattens these into a single `string[]` for the frontend.
   */
  keywords?: SeedLocalizedText[];
  /**
   * Flat free-form tags (locale-agnostic). Use for `urgent`, `eco`,
   * `licensed`, `weekend`, etc. - not for translations.
   */
  tags?: string[];
  /**
   * Inline label override. When set, `svc()` uses it instead of looking the id
   * up in translations.ts — handy for many one-off items (e.g. cleaning rooms)
   * that don't warrant a global translation id each.
   */
  label?: SeedLocalizedText;
  /**
   * Rich, multi-line description (e.g. "what the service includes").
   * Applies to `svc()` and `sub()`.
   */
  description?: SeedLocalizedText;
  /**
   * Priced add-ons / yes-no options. Only meaningful on `sub()`.
   */
  addons?: SeedAddon[];
}

function lookup(id: string): { en: string; ka: string; ru: string } {
  const tr = translations[id];
  if (!tr) {
    throw new Error(
      `Missing translation for catalog id "${id}". Add it to seed/translations.ts.`,
    );
  }
  return tr;
}

export function svc(
  id: string,
  key: string,
  unitOpts: SeedUnitOption[],
  extras?: SeedExtras,
): SeedService {
  if (unitOpts.length === 0) {
    throw new Error(`Service "${id}" must have at least one unit option.`);
  }
  const primary = unitOpts[0];
  return {
    id,
    key,
    label: extras?.label ?? lookup(id),
    unitOptions: unitOpts,
    basePrice: primary.defaultPrice,
    maxPrice: primary.maxPrice,
    unit: primary.unit,
    unitLabel: primary.label,
    description: extras?.description,
    keywords: extras?.keywords,
    tags: extras?.tags,
  };
}

/**
 * Build a priced add-on / yes-no option for a subcategory. Inline labels
 * (not translation ids) since add-ons are local to a subcategory.
 */
export function addon(
  key: string,
  label: SeedLocalizedText,
  promptLabel: SeedLocalizedText,
  basePrice: number,
  unitOpt: SeedUnitOption,
  iconName?: string,
): SeedAddon {
  return {
    key,
    label,
    promptLabel,
    basePrice,
    unit: unitOpt.unit,
    unitLabel: unitOpt.label,
    iconName,
  };
}

export function sub(
  id: string,
  key: string,
  iconName: string,
  services: SeedService[],
  sortOrder: number,
  extras?: SeedExtras,
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
    addons: extras?.addons ?? [],
    additionalServices: [],
    description: extras?.description,
    keywords: extras?.keywords,
    tags: extras?.tags,
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
