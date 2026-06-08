/**
 * Canonical job/service category keys - these mirror the `key` field of the
 * `servicecatalogcategories` collection (the Service Catalog single source of
 * truth). Jobs, pro services, and matching all key off these, so a job stored
 * under a variant ("plumber" instead of "plumbing") silently fails to match
 * the pros listed under the canonical key.
 */
export const CANONICAL_CATEGORIES = new Set([
  'handyman',
  'hvac',
  'cleaning',
  'landscaping',
  'movers',
  'plumbing',
  'electrical',
  'painters',
  'contractors',
  'architects',
  'pool_spa',
  'roofing',
  'windows_doors',
  'concrete_masonry',
  'designers',
]);

/**
 * Common trade-name / singular-plural variants -> canonical key. Only the
 * unambiguous ones; parent-taxonomy words (renovation, design, services) are
 * deliberately left out so we never collapse a real category by guessing.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  plumber: 'plumbing',
  plumbers: 'plumbing',
  electrician: 'electrical',
  electricians: 'electrical',
  painter: 'painters',
  architect: 'architects',
  cleaner: 'cleaning',
  cleaners: 'cleaning',
  mover: 'movers',
  handymen: 'handyman',
  designer: 'designers',
  contractor: 'contractors',
  landscaper: 'landscaping',
  landscapers: 'landscaping',
  roofer: 'roofing',
  mason: 'concrete_masonry',
};

/**
 * Map a raw category string to its canonical key. Known variants are folded
 * in; an already-canonical key passes through; an unrecognised value is left
 * as-is (lowercased + trimmed) so we never invent or drop a category.
 */
export function normalizeCategory(
  raw: string | null | undefined,
): string | undefined {
  if (raw == null) return undefined;
  const key = raw.trim().toLowerCase();
  if (!key) return undefined;
  if (CANONICAL_CATEGORIES.has(key)) return key;
  return CATEGORY_ALIASES[key] ?? key;
}
