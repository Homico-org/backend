/**
 * Movers — category C04 (movers).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const moversCategory = cat(
  "C04",
  "movers",
  "Truck",
  "#8B5CF6",
  15,
  3,
  [
    sub("S017", "home_moving", "House", [
      svc("V057", "move_local_svc", [U.hour(25, 80), U.job(100, 500), U.studio(80, 250), U.oneBr(120, 400), U.twoBr(200, 600), U.threeBr(300, 900)]),
      svc("V058", "move_distance_svc", [U.job(200, 2000), U.hour(30, 100)]),
    ], 0),
    sub("S018", "office_moving", "Building2", [
      svc("V059", "office_relocation_svc", [U.hour(30, 100), U.job(300, 3000)]),
      svc("V060", "office_furniture_svc", [U.unit(30, 150), U.hour(25, 80)]),
    ], 1),
    sub("S019", "packing", "Package", [
      svc("V061", "packing_full_svc", [U.hour(20, 50), U.room(50, 200)]),
      svc("V062", "packing_fragile_svc", [U.hour(25, 60)]),
      svc("V063", "packing_unpack_svc", [U.hour(20, 50)]),
    ], 2),
    sub("S020", "labor", "Users", [
      svc("V064", "labor_loading_svc", [U.hour(20, 50)]),
      svc("V065", "labor_heavy_svc", [U.unit(40, 150)]),
      svc("V066", "labor_rearrange_svc", [U.hour(20, 50)]),
      svc("V067", "labor_specialty_svc", [U.unit(100, 500), U.job(200, 1000)]),
    ], 3),
  ],
);
