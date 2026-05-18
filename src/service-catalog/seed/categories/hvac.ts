/**
 * AC & Ventilation - category C08 (hvac).
 * Heating used to live here as S034 but moved into C05 (Plumbing &
 * Heating) in 2026-05 because in the Georgian market the same trade
 * handles water and heating systems. C08 is now cooling/airflow only.
 *
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const hvacCategory = cat(
  "C08",
  "hvac",
  "Wind",
  "#06B6D4",
  20,
  7,
  [
    sub("S035", "ac_ventilation", "Wind", [
      svc("V123", "ac_install_svc", [U.unit(80, 300)]),
      svc("V124", "ac_repair_svc", [U.job(40, 200)]),
      svc("V125", "ac_service_svc", [U.unit(40, 120)]),
      svc("V126", "ventilation_svc", [U.system(200, 1500)]),
      svc("V127", "hood_svc", [U.unit(60, 200)]),
    ], 0),
  ],
);
