/**
 * Handymen — category C02 (handyman).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const handymanCategory = cat(
  "C02",
  "handyman",
  "Wrench",
  "#F97316",
  15,
  1,
  [
    sub("S007", "assembly", "Boxes", [
      svc("V018", "assembly_flatpack_svc", [U.unit(30, 100), U.hour(20, 50)]),
      svc("V019", "assembly_cabinet_svc", [U.unit(50, 200)]),
      svc("V020", "assembly_bed_svc", [U.unit(40, 150)]),
      svc("V021", "assembly_office_svc", [U.unit(40, 180), U.hour(20, 50)]),
    ], 0),
    sub("S008", "mounting", "Anchor", [
      svc("V022", "mount_tv_svc", [U.unit(40, 150)]),
      svc("V023", "mount_shelf_svc", [U.unit(25, 80)]),
      svc("V024", "mount_art_svc", [U.unit(15, 60)]),
      svc("V025", "mount_curtain_svc", [U.unit(20, 80), U.meter(8, 25)]),
    ], 1),
    sub("S009", "repairs", "Hammer", [
      svc("V026", "repair_drywall_svc", [U.job(40, 150)]),
      svc("V027", "repair_door_svc", [U.job(30, 120)]),
      svc("V028", "repair_furniture_svc", [U.unit(30, 150), U.hour(20, 50)]),
      svc("V029", "repair_odd_svc", [U.hour(20, 60)]),
    ], 2),
    sub("S010", "doors", "DoorOpen", [
      svc("V030", "door_interior_svc", [U.door(80, 200)]),
      svc("V031", "door_entry_svc", [U.door(150, 500)]),
      svc("V032", "door_hardware_svc", [U.unit(20, 80)]),
    ], 3),
    sub("S011", "trim", "Ruler", [
      svc("V033", "trim_baseboard_svc", [U.meter(5, 15)]),
      svc("V034", "trim_molding_svc", [U.meter(8, 25)]),
      svc("V035", "trim_paneling_svc", [U.sqm(15, 50)]),
    ], 4),
  ],
);
