/**
 * Cleaners — category C01 (cleaning).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const cleaningCategory = cat(
  "C01",
  "cleaning",
  "Sparkles",
  "#10B981",
  3,
  0,
  [
    sub("S001", "regular_clean", "Sparkles", [
      svc("V001", "regular_standard_svc", [U.sqm(3, 10), U.hour(15, 40), U.studio(40, 120), U.oneBr(60, 180), U.twoBr(90, 250), U.threeBr(130, 350)]),
      svc("V002", "regular_recurring_svc", [U.sqm(2, 8), U.hour(15, 35), U.studio(35, 100), U.oneBr(50, 140), U.twoBr(70, 200)]),
    ], 0),
    sub("S002", "deep_clean", "SprayCan", [
      svc("V003", "deep_full_svc", [U.sqm(6, 18), U.hour(25, 60), U.studio(80, 250), U.oneBr(120, 350), U.twoBr(180, 500), U.threeBr(250, 700)]),
      svc("V004", "deep_kitchen_svc", [U.job(50, 200)]),
      svc("V005", "deep_bathroom_svc", [U.job(40, 150)]),
    ], 1),
    sub("S003", "post_renovation_clean", "Construction", [
      svc("V006", "post_reno_full_svc", [U.sqm(5, 15), U.room(60, 200), U.studio(100, 300), U.oneBr(150, 450), U.twoBr(220, 650), U.threeBr(300, 900)]),
      svc("V007", "post_reno_dust_svc", [U.sqm(3, 10)]),
      svc("V008", "post_reno_floor_svc", [U.sqm(4, 12)]),
    ], 2),
    sub("S004", "move_clean", "Truck", [
      svc("V009", "move_full_svc", [U.sqm(4, 12), U.room(50, 150), U.studio(70, 200), U.oneBr(100, 280), U.twoBr(150, 400), U.threeBr(200, 550)]),
      svc("V010", "move_empty_svc", [U.sqm(3, 10), U.studio(50, 150), U.oneBr(70, 200), U.twoBr(110, 300)]),
      svc("V011", "move_cabinet_svc", [U.job(40, 150)]),
    ], 3),
    sub("S005", "window_clean", "PanelTop", [
      svc("V012", "window_interior_svc", [U.window(8, 20)]),
      svc("V013", "window_exterior_svc", [U.window(12, 30)]),
      svc("V014", "window_facade_svc", [U.sqm(5, 15)]),
    ], 4),
    sub("S006", "carpet_clean", "Sofa", [
      svc("V015", "carpet_rug_svc", [U.sqm(5, 20)]),
      svc("V016", "carpet_sofa_svc", [U.unit(40, 150)]),
      svc("V017", "carpet_mattress_svc", [U.unit(30, 120)]),
    ], 5),
  ],
);
