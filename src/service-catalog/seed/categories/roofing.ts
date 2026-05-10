/**
 * Roofing — category C12 (roofing).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const roofingCategory = cat(
  "C12",
  "roofing",
  "Triangle",
  "#78716C",
  10,
  11,
  [
    sub("S047", "roofer", "Triangle", [
      svc("V172", "roof_metal_svc", [U.sqm(20, 50)]),
      svc("V173", "roof_tile_svc", [U.sqm(25, 60)]),
      svc("V174", "roof_flat_svc", [U.sqm(18, 45)]),
      svc("V175", "roof_bitumen_svc", [U.sqm(15, 40)]),
    ], 0),
    sub("S048", "roof_repair", "Wrench", [
      svc("V176", "roof_repair_svc", [U.job(50, 500), U.sqm(10, 40)]),
      svc("V177", "roof_leak_svc", [U.job(40, 300)]),
      svc("V178", "roof_waterproof_svc", [U.sqm(10, 30)]),
      svc("V179", "roof_inspect_svc", [U.job(40, 150)]),
    ], 1),
    sub("S049", "roof_gutters", "CloudRain", [
      svc("V180", "roof_gutter_install_svc", [U.meter(20, 60)]),
      svc("V181", "roof_gutter_clean_svc", [U.meter(3, 10), U.job(40, 150)]),
      svc("V182", "roof_insulation_svc", [U.sqm(12, 35)]),
    ], 2),
  ],
);
