/**
 * Plumbers — category C05 (plumbing).
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
    ], 0),
    sub("S022", "plumbing_repair", "Wrench", [
      svc("V074", "plumb_leak_svc", [U.job(30, 120)]),
      svc("V075", "plumb_clog_svc", [U.job(40, 150)]),
      svc("V076", "plumb_pipe_svc", [U.job(40, 200)]),
      svc("V077", "plumb_pressure_svc", [U.job(40, 150)]),
      svc("V078", "plumb_emergency_svc", [U.hour(30, 80)]),
    ], 1),
    sub("S023", "drainage", "ArrowDownToLine", [
      svc("V079", "drainage_install_svc", [U.meter(10, 40)]),
      svc("V080", "drainage_sewage_svc", [U.job(100, 500)]),
      svc("V081", "drainage_outdoor_svc", [U.meter(15, 50)]),
    ], 2),
    sub("S024", "boiler", "Flame", [
      svc("V082", "boiler_gas_svc", [U.unit(100, 400)]),
      svc("V083", "boiler_electric_svc", [U.unit(80, 300)]),
      svc("V084", "boiler_repair_svc", [U.job(40, 200)]),
      svc("V085", "boiler_service_svc", [U.unit(40, 150)]),
    ], 3),
    sub("S025", "gas", "Flame", [
      svc("V086", "gas_line_svc", [U.meter(15, 50), U.job(100, 500)]),
      svc("V087", "gas_stove_svc", [U.unit(40, 150)]),
      svc("V088", "gas_leak_svc", [U.job(40, 150)]),
    ], 4),
  ],
);
