/**
 * Unit-option helpers. Every unit has a stable id (U01..) that survives
 * label edits and rewrites — pros and jobs may reference it.
 *
 * Add a new unit by:
 *   1. Adding the enum value to ../schemas/service-catalog.schema.ts (ServiceUnit)
 *   2. Adding a helper here with the next free Uxx id
 *   3. Adding the matching id entry to translations.ts
 *
 * The `id` lives here (single source of truth); labels live in translations.ts
 * so a typo fix in any locale doesn't require touching this file.
 */

import { translations } from './translations';
import type { SeedUnitOption } from './types';

function uo(id: string, key: string, unit: string, defaultPrice: number, maxPrice?: number): SeedUnitOption {
  const tr = translations[id];
  if (!tr) {
    throw new Error(`Missing translation for unit option "${id}". Add it to translations.ts.`);
  }
  return { id, key, unit, label: tr, defaultPrice, maxPrice };
}

export const U = {
  unit:    (p: number, mx?: number) => uo('U01', 'per_unit',    'unit',    p, mx),
  job:     (p: number, mx?: number) => uo('U02', 'per_job',     'job',     p, mx),
  hour:    (p: number, mx?: number) => uo('U03', 'per_hour',    'hour',    p, mx),
  sqm:     (p: number, mx?: number) => uo('U04', 'per_sqm',     'sqm',     p, mx),
  meter:   (p: number, mx?: number) => uo('U05', 'per_meter',   'meter',   p, mx),
  room:    (p: number, mx?: number) => uo('U06', 'per_room',    'room',    p, mx),
  project: (p: number, mx?: number) => uo('U07', 'per_project', 'project', p, mx),
  point:   (p: number, mx?: number) => uo('U08', 'per_point',   'point',   p, mx),
  window:  (p: number, mx?: number) => uo('U09', 'per_window',  'window',  p, mx),
  door:    (p: number, mx?: number) => uo('U10', 'per_door',    'door',    p, mx),
  tree:    (p: number, mx?: number) => uo('U11', 'per_tree',    'tree',    p, mx),
  system:  (p: number, mx?: number) => uo('U12', 'per_system',  'system',  p, mx),
  load:    (p: number, mx?: number) => uo('U13', 'per_load',    'load',    p, mx),
  // Apartment-tier units use literal strings (`studio`/`1br`/`2br`/`3br`) that
  // are NOT in the ServiceUnit enum. Seed writes via $set bypass validation.
  // TODO(catalog): add these to the ServiceUnit enum, or normalize to `unit`.
  studio:  (p: number, mx?: number) => uo('U14', 'per_studio',  'studio',  p, mx),
  oneBr:   (p: number, mx?: number) => uo('U15', 'per_1br',     '1br',     p, mx),
  twoBr:   (p: number, mx?: number) => uo('U16', 'per_2br',     '2br',     p, mx),
  threeBr: (p: number, mx?: number) => uo('U17', 'per_3br',     '3br',     p, mx),
};
