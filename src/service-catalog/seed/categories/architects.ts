/**
 * Architects — category C10 (architects).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const architectsCategory = cat(
  "C10",
  "architects",
  "Compass",
  "#7C3AED",
  200,
  9,
  [
    sub("S042", "architecture", "Compass", [
      svc("V152", "arch_residential_svc", [U.project(500, 5000), U.sqm(10, 40)]),
      svc("V153", "arch_commercial_svc", [U.project(1000, 10000), U.sqm(15, 50)]),
      svc("V154", "arch_renovation_svc", [U.project(300, 3000)]),
      svc("V155", "arch_3d_svc", [U.project(200, 2000)]),
    ], 0),
    sub("S043", "permits", "FileText", [
      svc("V156", "permits_construction_svc", [U.project(200, 2000)]),
      svc("V157", "permits_expertise_svc", [U.project(150, 1500)]),
      svc("V158", "permits_asbuilt_svc", [U.project(150, 1500)]),
      svc("V159", "permits_legal_svc", [U.project(100, 1000)]),
    ], 1),
    sub("S044", "project_management", "ClipboardList", [
      svc("V160", "pm_site_svc", [U.project(300, 3000), U.hour(40, 120)]),
      svc("V161", "pm_estimate_svc", [U.project(200, 2000)]),
      svc("V162", "pm_manage_svc", [U.project(500, 5000)]),
      svc("V163", "pm_consulting_svc", [U.hour(40, 150)]),
    ], 2),
  ],
);
