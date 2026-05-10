/**
 * Concrete & masonry — category C14 (concrete_masonry).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const concretemasonryCategory = cat(
  "C14",
  "concrete_masonry",
  "Layers",
  "#64748B",
  15,
  13,
  [
    sub("S053", "mason", "Layers", [
      svc("V195", "mason_brick_svc", [U.sqm(20, 60)]),
      svc("V196", "mason_stone_svc", [U.sqm(30, 80)]),
      svc("V197", "mason_retaining_svc", [U.sqm(40, 120), U.meter(60, 200)]),
      svc("V198", "mason_repair_svc", [U.sqm(20, 60), U.job(80, 400)]),
    ], 0),
    sub("S054", "concrete", "Box", [
      svc("V199", "concrete_foundation_svc", [U.project(500, 5000), U.sqm(40, 120)]),
      svc("V200", "concrete_pouring_svc", [U.sqm(15, 50)]),
      svc("V201", "concrete_stairs_svc", [U.unit(200, 1500)]),
      svc("V202", "concrete_repair_svc", [U.sqm(15, 50), U.job(50, 300)]),
    ], 1),
    sub("S055", "paving", "Grid2x2", [
      svc("V203", "paving_driveway_svc", [U.sqm(25, 70)]),
      svc("V204", "paving_pathway_svc", [U.sqm(15, 50)]),
      svc("V205", "paving_patio_svc", [U.sqm(20, 60)]),
      svc("V206", "paving_stones_svc", [U.sqm(20, 60)]),
    ], 2),
  ],
);
