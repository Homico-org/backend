/**
 * Contractors — category C09 (contractors).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const contractorsCategory = cat(
  "C09",
  "contractors",
  "HardHat",
  "#C4735B",
  10,
  8,
  [
    sub("S036", "general_contracting", "HardHat", [
      svc("V128", "gc_full_svc", [U.sqm(100, 500), U.project(5000, 80000)]),
      svc("V129", "gc_kitchen_svc", [U.project(2000, 15000), U.sqm(150, 600)]),
      svc("V130", "gc_bathroom_svc", [U.project(1500, 10000), U.sqm(200, 800)]),
    ], 0),
    sub("S037", "tiler", "Grid3x3", [
      svc("V131", "tile_floor_svc", [U.sqm(10, 35)]),
      svc("V132", "tile_wall_svc", [U.sqm(12, 40)]),
      svc("V133", "tile_mosaic_svc", [U.sqm(25, 80)]),
      svc("V134", "tile_remove_svc", [U.sqm(5, 15)]),
      svc("V135", "tile_grout_svc", [U.sqm(5, 18)]),
    ], 1),
    sub("S038", "flooring", "Footprints", [
      svc("V136", "floor_parquet_svc", [U.sqm(12, 40)]),
      svc("V137", "floor_laminate_svc", [U.sqm(8, 25)]),
      svc("V138", "floor_vinyl_svc", [U.sqm(8, 25)]),
      svc("V139", "floor_repair_svc", [U.sqm(6, 20)]),
      svc("V140", "floor_sand_svc", [U.sqm(8, 25)]),
    ], 2),
    sub("S039", "built_in", "Archive", [
      svc("V141", "builtin_wardrobe_svc", [U.unit(300, 2000)]),
      svc("V142", "builtin_kitchen_svc", [U.project(1000, 8000)]),
      svc("V143", "builtin_shelving_svc", [U.unit(100, 600)]),
      svc("V144", "builtin_countertop_svc", [U.meter(80, 300), U.unit(200, 1500)]),
    ], 3),
    sub("S040", "facade", "LayoutPanelTop", [
      svc("V145", "facade_cladding_svc", [U.sqm(15, 50)]),
      svc("V146", "facade_insulation_svc", [U.sqm(12, 40)]),
      svc("V147", "facade_paint_svc", [U.sqm(8, 25)]),
      svc("V148", "facade_repair_svc", [U.sqm(10, 40), U.job(100, 800)]),
    ], 4),
    sub("S041", "demolition", "Hammer", [
      svc("V149", "demo_partial_svc", [U.sqm(10, 30)]),
      svc("V150", "demo_full_svc", [U.sqm(15, 50)]),
      svc("V151", "demo_debris_svc", [U.load(50, 200)]),
    ], 5),
  ],
);
