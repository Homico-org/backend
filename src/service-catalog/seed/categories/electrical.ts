/**
 * Electrical pros — category C06 (electrical).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const electricalCategory = cat(
  "C06",
  "electrical",
  "Zap",
  "#F59E0B",
  15,
  5,
  [
    sub("S026", "wiring", "Cable", [
      svc("V089", "wiring_new_svc", [U.meter(5, 20), U.point(25, 60)]),
      svc("V090", "wiring_outlet_svc", [U.point(20, 50)]),
      svc("V091", "wiring_repair_svc", [U.job(30, 150)]),
      svc("V092", "wiring_ev_svc", [U.unit(200, 800)]),
    ], 0, {
      keywords: [
        { en: "electrical electrician wiring cable outlet socket", ka: "ელექტრობა ელექტრიკოსი გაყვანილობა როზეტი", ru: "электрика электрик проводка розетка" },
        { en: "eltechnik elektrika", ka: "ელექტრო", ru: "электро" },
      ],
    }),
    sub("S027", "lighting", "Lightbulb", [
      svc("V093", "light_ceiling_svc", [U.unit(25, 80)]),
      svc("V094", "light_spot_svc", [U.unit(15, 50)]),
      svc("V095", "light_led_svc", [U.meter(10, 30)]),
      svc("V096", "light_outdoor_svc", [U.unit(30, 120)]),
      svc("V097", "light_fan_svc", [U.unit(50, 180)]),
      // Premium lighting (added 2026-05). Track lighting is the recessed rail
      // system from PDF 9.3 - different install effort from a regular spot.
      // Directional spots are gimbal-mounted (PDF 24.3) so they upcharge over
      // generic point lights.
      svc("V230", "light_track_svc", [U.meter(60, 120)]),
      svc("V231", "light_directional_svc", [U.unit(15, 30)]),
    ], 1),
    sub("S028", "electrical_panel", "Plug", [
      svc("V098", "panel_install_svc", [U.unit(100, 400)]),
      svc("V099", "panel_breaker_svc", [U.unit(20, 60)]),
      svc("V100", "panel_upgrade_svc", [U.unit(80, 300)]),
    ], 2),
    sub("S029", "smart_home", "Smartphone", [
      svc("V101", "smart_switch_svc", [U.unit(30, 100)]),
      svc("V102", "smart_light_svc", [U.unit(30, 120)]),
      svc("V103", "smart_full_svc", [U.system(300, 3000)]),
    ], 3),
    sub("S030", "security", "Shield", [
      svc("V104", "security_cctv_svc", [U.unit(60, 200)]),
      svc("V105", "security_alarm_svc", [U.system(200, 1000)]),
      svc("V106", "security_intercom_svc", [U.unit(100, 300)]),
    ], 4),
  ],
);
