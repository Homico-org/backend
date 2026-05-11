/**
 * HVAC pros — category C08 (hvac).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const hvacCategory = cat(
  "C08",
  "hvac",
  "Thermometer",
  "#06B6D4",
  20,
  7,
  [
    sub("S034", "heating", "Flame", [
      svc("V118", "heat_radiator_svc", [U.unit(40, 150)]),
      svc("V119", "heat_system_svc", [U.sqm(15, 50)]),
      svc("V120", "heat_underfloor_svc", [U.sqm(20, 60)]),
      svc("V121", "heat_repair_svc", [U.job(40, 200), U.hour(30, 80)]),
      svc("V122", "heat_thermostat_svc", [U.unit(40, 150)]),
      // Towel warmer / drying radiator (added 2026-05). Separate fixture from
      // standard radiators - typically wall-mounted in bathrooms, plumbed
      // into the heating circuit. PDF 7.6 bills at 98 ₾.
      svc("V228", "heat_towel_warmer_svc", [U.unit(70, 130)]),
    ], 0),
    sub("S035", "ac_ventilation", "Wind", [
      svc("V123", "ac_install_svc", [U.unit(80, 300)]),
      svc("V124", "ac_repair_svc", [U.job(40, 200)]),
      svc("V125", "ac_service_svc", [U.unit(40, 120)]),
      svc("V126", "ventilation_svc", [U.system(200, 1500)]),
      svc("V127", "hood_svc", [U.unit(60, 200)]),
    ], 1),
  ],
);
