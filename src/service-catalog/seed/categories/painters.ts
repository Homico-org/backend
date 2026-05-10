/**
 * Painters — category C07 (painters).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const paintersCategory = cat(
  "C07",
  "painters",
  "Paintbrush",
  "#EC4899",
  5,
  6,
  [
    sub("S031", "painter", "Paintbrush", [
      svc("V107", "paint_interior_svc", [U.sqm(5, 15), U.room(60, 250)]),
      svc("V108", "paint_ceiling_svc", [U.sqm(6, 18), U.room(50, 200)]),
      svc("V109", "paint_wallpaper_svc", [U.sqm(5, 20), U.room(70, 300)]),
      svc("V110", "paint_trim_svc", [U.meter(4, 12), U.unit(30, 120)]),
    ], 0),
    sub("S032", "exterior_paint", "PaintRoller", [
      svc("V111", "paint_exterior_svc", [U.sqm(8, 25)]),
      svc("V112", "paint_fence_svc", [U.meter(8, 25), U.sqm(6, 18)]),
      svc("V113", "paint_metal_svc", [U.sqm(10, 30)]),
    ], 1),
    sub("S033", "plasterer", "Layers", [
      svc("V114", "plaster_walls_svc", [U.sqm(8, 25)]),
      svc("V115", "plaster_drywall_svc", [U.sqm(12, 35)]),
      svc("V116", "plaster_ceiling_svc", [U.sqm(10, 30)]),
      svc("V117", "plaster_decorative_svc", [U.sqm(20, 60)]),
    ], 2),
  ],
);
