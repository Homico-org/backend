/**
 * Designers — category C15 (designers).
 *
 * Distinct from C10 architects: architects do structural/permitted work,
 * designers do interior finishes, layouts, color/material selection, and
 * 3D visualization. Pinterest-linkable, portfolio-heavy, often per-sqm or
 * flat-fee pricing.
 *
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const designersCategory = cat(
  "C15",
  "designers",
  "Palette",
  "#D946EF",
  40,
  14,
  [
    sub("S057", "interior_design", "Sofa", [
      // Full apartment is most common - per-project for small/medium jobs,
      // per-sqm scales for larger flats and houses.
      svc("V235", "design_apartment_svc", [U.project(1000, 8000), U.sqm(20, 80)]),
      svc("V236", "design_room_svc", [U.room(200, 1500), U.project(400, 2000)]),
      svc("V237", "design_kitchen_svc", [U.project(500, 2500)]),
      svc("V238", "design_bathroom_svc", [U.project(400, 2000)]),
    ], 0),
    sub("S058", "commercial_design", "Building2", [
      svc("V239", "design_office_svc", [U.project(1500, 10000), U.sqm(25, 100)]),
      svc("V240", "design_retail_svc", [U.project(2000, 15000), U.sqm(30, 120)]),
      svc("V241", "design_hospitality_svc", [U.project(3000, 20000), U.sqm(30, 150)]),
    ], 1),
    sub("S059", "visualization", "Box", [
      // 3D renders bill either per-project (a deliverable set) or per-unit
      // (each render is a separate camera angle / room).
      svc("V242", "design_3d_render_svc", [U.project(200, 1500), U.unit(100, 500)]),
      svc("V243", "design_walkthrough_svc", [U.project(500, 3000)]),
      svc("V244", "design_floorplan_svc", [U.project(150, 1000)]),
    ], 2),
    sub("S060", "consultation", "MessagesSquare", [
      svc("V245", "design_color_svc", [U.hour(40, 150), U.project(100, 500)]),
      svc("V246", "design_material_svc", [U.hour(40, 150), U.project(150, 800)]),
      svc("V247", "design_consult_svc", [U.hour(40, 150)]),
      // Designer supervision = author oversight during construction. Billed
      // per visit on-site, typical 1-2 visits/week during build.
      svc("V248", "design_supervision_svc", [U.unit(100, 300)]),
    ], 3),
    sub("S061", "staging_styling", "Lamp", [
      svc("V249", "design_staging_svc", [U.project(300, 2000)]),
      svc("V250", "design_furniture_svc", [U.project(200, 1500), U.hour(40, 120)]),
    ], 4),
  ],
);
