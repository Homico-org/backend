/**
 * Landscapers — category C03 (landscaping).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const landscapingCategory = cat(
  "C03",
  "landscaping",
  "Trees",
  "#059669",
  15,
  2,
  [
    sub("S012", "landscape", "Map", [
      svc("V036", "landscape_plan_svc", [U.project(500, 5000)]),
      svc("V037", "landscape_consult_svc", [U.hour(30, 100)]),
      svc("V038", "landscape_3d_svc", [U.project(300, 2000)]),
    ], 0),
    sub("S013", "gardening", "Sprout", [
      svc("V039", "gardening_planting_svc", [U.sqm(10, 40), U.hour(20, 50)]),
      svc("V040", "gardening_weeding_svc", [U.sqm(3, 12), U.hour(15, 40)]),
      svc("V041", "gardening_mulch_svc", [U.sqm(5, 20)]),
      svc("V042", "gardening_care_svc", [U.hour(20, 50)]),
    ], 1),
    sub("S014", "lawn", "Trees", [
      svc("V043", "lawn_mowing_svc", [U.sqm(1, 5), U.hour(20, 50)]),
      svc("V044", "lawn_install_svc", [U.sqm(8, 25)]),
      svc("V045", "lawn_sprinkler_svc", [U.system(300, 2000)]),
      svc("V046", "lawn_sprink_rep_svc", [U.job(40, 200)]),
      svc("V047", "lawn_aeration_svc", [U.sqm(2, 8)]),
    ], 2),
    sub("S015", "tree_care", "TreeDeciduous", [
      svc("V048", "tree_prune_svc", [U.tree(50, 200)]),
      svc("V049", "tree_remove_svc", [U.tree(100, 500)]),
      svc("V050", "tree_stump_svc", [U.tree(60, 250)]),
      svc("V051", "tree_hedge_svc", [U.meter(8, 25)]),
      svc("V052", "tree_plant_svc", [U.tree(30, 150)]),
    ], 3),
    sub("S016", "fences", "Fence", [
      svc("V053", "fence_wood_svc", [U.meter(30, 100)]),
      svc("V054", "fence_metal_svc", [U.meter(40, 150)]),
      svc("V055", "fence_gate_svc", [U.unit(150, 800)]),
      svc("V056", "fence_repair_svc", [U.meter(15, 60), U.job(40, 200)]),
    ], 4),
  ],
);
