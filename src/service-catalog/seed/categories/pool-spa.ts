/**
 * Pool & spa — category C11 (pool_spa).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const poolspaCategory = cat(
  "C11",
  "pool_spa",
  "Waves",
  "#0EA5E9",
  30,
  10,
  [
    sub("S045", "pool", "Waves", [
      svc("V164", "pool_build_svc", [U.project(2000, 20000), U.sqm(200, 800)]),
      svc("V165", "pool_spa_svc", [U.unit(500, 5000)]),
      svc("V166", "pool_sauna_svc", [U.unit(800, 4000)]),
      svc("V167", "pool_heater_svc", [U.unit(400, 2500)]),
    ], 0),
    sub("S046", "pool_service", "Droplet", [
      svc("V168", "pool_clean_svc", [U.job(40, 150), U.hour(25, 60)]),
      svc("V169", "pool_water_svc", [U.job(30, 150)]),
      svc("V170", "pool_equip_svc", [U.job(40, 200)]),
      svc("V171", "pool_repair_svc", [U.job(80, 500)]),
    ], 1),
  ],
);
