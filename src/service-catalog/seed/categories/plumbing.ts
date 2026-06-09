/**
 * Plumbing & Heating - category C05 (plumbing).
 * Combined in 2026-05 because in the Georgian market the same trade
 * handles water pipes, boilers, radiators and underfloor heating.
 * Cooling/AC stays separate in C08.
 *
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const plumbingCategory = cat(
  "C05",
  "plumbing",
  "Droplets",
  "#3B82F6",
  20,
  4,
  [
    sub("S021", "plumbing_install", "Droplets", [
      svc("V068", "plumb_faucet_svc", [U.unit(30, 100)]),
      svc("V069", "plumb_toilet_svc", [U.unit(60, 200)]),
      svc("V070", "plumb_sink_svc", [U.unit(80, 300)]),
      svc("V071", "plumb_shower_svc", [U.unit(100, 400)]),
      svc("V072", "plumb_dishwasher_svc", [U.unit(50, 150)]),
      svc("V073", "plumb_washer_svc", [U.unit(50, 150)]),
      // Built-in fixtures (added 2026-05). Two-stage install workflow:
      // rough-in valve in the wall (stage I) + finish trim assembly (stage II).
      // Per-fixture pricing is bundled here as one combined service since most
      // pros bill the full job - estimates show 200-450 ₾ total per fixture
      // depending on type. Cistern install is the parallel for toilets.
      svc("V217", "plumb_builtin_basin_svc", [U.unit(200, 450)]),
      svc("V218", "plumb_builtin_shower_svc", [U.unit(250, 500)]),
      svc("V219", "plumb_builtin_hygiene_svc", [U.unit(200, 400)]),
      svc("V220", "plumb_builtin_bath_svc", [U.unit(220, 450)]),
      svc("V221", "plumb_builtin_toilet_svc", [U.unit(200, 380)]),
    ], 0, {
      keywords: [
        { en: "plumbing plumber install faucet sink toilet shower", ka: "სანტექნიკა სანტექნიკოსი ონკანი ნიჟარა უნიტაზი შხაპი", ru: "сантехник сантехника установка кран раковина унитаз душ" },
        // Latin transliteration users type on Tbilisi sites
        { en: "santech santechnika", ka: "სანტექ", ru: "сантех" },
      ],
    }),
    sub("S022", "plumbing_repair", "Wrench", [
      svc("V074", "plumb_leak_svc", [U.job(30, 120)]),
      svc("V075", "plumb_clog_svc", [U.job(40, 150)]),
      svc("V076", "plumb_pipe_svc", [U.job(40, 200)]),
      svc("V077", "plumb_pressure_svc", [U.job(40, 150)]),
      svc("V078", "plumb_emergency_svc", [U.hour(30, 80)]),
    ], 1, {
      keywords: [
        { en: "leak fix burst pipe clog drain emergency", ka: "გაჟონვა გასკდომა მილი ჩაკეტვა გადაუდებელი", ru: "протечка прорыв труба засор аварийный" },
      ],
    }),
    sub("S023", "drainage", "ArrowDownToLine", [
      svc("V079", "drainage_install_svc", [U.meter(10, 40)]),
      svc("V080", "drainage_sewage_svc", [U.job(100, 500)]),
      svc("V081", "drainage_outdoor_svc", [U.meter(15, 50)]),
      // Shower trap install (added 2026-05). Two depth/length variants in
      // real estimates (small 126 ₾, long 154 ₾) - exposed here as one
      // service with a range covering both.
      svc("V222", "plumb_shower_drain_svc", [U.unit(100, 160)]),
    ], 2),
    sub("S024", "boiler", "Flame", [
      svc("V082", "boiler_gas_svc", [U.unit(100, 400)]),
      svc("V083", "boiler_electric_svc", [U.unit(80, 300)]),
      svc("V084", "boiler_repair_svc", [U.job(40, 200)]),
      svc("V085", "boiler_service_svc", [U.unit(40, 150)]),
      // Distribution collector / manifold (added 2026-05). Separate work from
      // the boiler itself - PDF 7.2 bills 280 ₾ as its own line. Common on
      // multi-radiator systems where each zone needs its own valve.
      svc("V227", "boiler_collector_svc", [U.unit(200, 350)]),
    ], 3),
    sub("S025", "gas", "Flame", [
      svc("V086", "gas_line_svc", [U.meter(15, 50), U.job(100, 500)]),
      svc("V087", "gas_stove_svc", [U.unit(40, 150)]),
      svc("V088", "gas_leak_svc", [U.job(40, 150)]),
    ], 4),
    // Heating moved here from C08 in 2026-05. Boilers and water heaters
    // (S024) above already sit under plumbing, so radiator + underfloor +
    // system work belongs in the same trade.
    sub("S034", "heating", "Flame", [
      svc("V118", "heat_radiator_svc", [U.unit(40, 150)]),
      svc("V119", "heat_system_svc", [U.sqm(15, 50)]),
      svc("V120", "heat_underfloor_svc", [U.sqm(20, 60)]),
      svc("V121", "heat_repair_svc", [U.job(40, 200), U.hour(30, 80)]),
      svc("V122", "heat_thermostat_svc", [U.unit(40, 150)]),
      svc("V228", "heat_towel_warmer_svc", [U.unit(70, 130)]),
    ], 5),
  ],
);
