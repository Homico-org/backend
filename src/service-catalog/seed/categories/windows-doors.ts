/**
 * Windows & doors — category C13 (windows_doors).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const windowsdoorsCategory = cat(
  "C13",
  "windows_doors",
  "DoorOpen",
  "#6366F1",
  50,
  12,
  [
    sub("S050", "windows", "Square", [
      svc("V183", "wd_pvc_svc", [U.window(100, 400)]),
      svc("V184", "wd_aluminum_svc", [U.window(120, 500)]),
      svc("V185", "wd_wood_svc", [U.window(150, 600)]),
      svc("V186", "wd_screen_svc", [U.window(20, 60)]),
    ], 0),
    sub("S051", "glazing", "Frame", [
      svc("V187", "wd_balcony_svc", [U.sqm(80, 250), U.meter(120, 400)]),
      svc("V188", "wd_glass_svc", [U.sqm(60, 200), U.unit(40, 200)]),
      svc("V189", "wd_partition_svc", [U.sqm(80, 250)]),
      svc("V190", "wd_window_fix_svc", [U.job(30, 150), U.window(20, 80)]),
    ], 1),
    sub("S052", "specialty_doors", "DoorClosed", [
      svc("V191", "wd_entry_svc", [U.door(200, 800)]),
      svc("V192", "wd_security_svc", [U.door(400, 2000)]),
      svc("V193", "wd_sliding_svc", [U.door(250, 1200)]),
      svc("V194", "wd_garage_svc", [U.unit(500, 3000)]),
    ], 2),
  ],
);
