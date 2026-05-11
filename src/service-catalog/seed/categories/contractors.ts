/**
 * Contractors — category C09 (contractors).
 * Translations live in seed/translations.ts keyed by id.
 */

import { cat, sub, svc } from '../helpers';
import { U } from '../units';

export const contractorsCategory = cat(
  "C09",
  "contractors",
  "HardHat",
  "#C4735B",
  10,
  8,
  [
    sub("S036", "general_contracting", "HardHat", [
      svc("V128", "gc_full_svc", [U.sqm(100, 500), U.project(5000, 80000)]),
      svc("V129", "gc_kitchen_svc", [U.project(2000, 15000), U.sqm(150, 600)]),
      svc("V130", "gc_bathroom_svc", [U.project(1500, 10000), U.sqm(200, 800)]),
      // Drywall ceiling / cove (added 2026-05). Separate from `plaster_drywall_svc`
      // (which covers wall surfaces) because ceiling work uses a different
      // hanging system and the cove is per linear meter, not per sqm.
      svc("V213", "gc_drywall_ceiling_svc", [U.sqm(28, 40)]),
      svc("V214", "gc_drywall_cove_svc", [U.meter(30, 50)]),
      // Hidden / concealed door install (added 2026-05). Premium product -
      // frame integrated into the wall plane, requires drywall reinforcement
      // around the opening. XLSX bills 1475 ₾ material + 200 ₾ labor;
      // labor-only range here.
      svc("V229", "gc_hidden_door_install_svc", [U.unit(300, 500)]),
    ], 0),
    sub("S037", "tiler", "Grid3x3", [
      svc("V131", "tile_floor_svc", [U.sqm(10, 35)]),
      svc("V132", "tile_wall_svc", [U.sqm(12, 40)]),
      svc("V133", "tile_mosaic_svc", [U.sqm(25, 80)]),
      svc("V134", "tile_remove_svc", [U.sqm(5, 15)]),
      svc("V135", "tile_grout_svc", [U.sqm(5, 18)]),
      // Wet-area + premium tile details (added 2026-05). Tiler owns the
      // membrane through to the final grout - waterproofing is part of the
      // same mobilization on every bathroom job.
      svc("V207", "tile_waterproof_svc", [U.sqm(16, 40)]),
      svc("V208", "tile_shower_envelope_svc", [U.unit(250, 400)]),
      svc("V209", "tile_45deg_corner_svc", [U.meter(80, 110)]),
      svc("V210", "tile_epoxy_grout_svc", [U.meter(25, 50)]),
      // Silicone joint sealing - last finish step where tiles meet (interior
      // corners, fixture penetrations). PDF 12.4 bills 9.8 ₾/m.
      svc("V224", "tile_silicone_joint_svc", [U.meter(8, 15)]),
    ], 1),
    sub("S038", "flooring", "Footprints", [
      svc("V136", "floor_parquet_svc", [U.sqm(12, 40)]),
      svc("V137", "floor_laminate_svc", [U.sqm(8, 25)]),
      svc("V138", "floor_vinyl_svc", [U.sqm(8, 25)]),
      svc("V139", "floor_repair_svc", [U.sqm(6, 20)]),
      svc("V140", "floor_sand_svc", [U.sqm(8, 25)]),
      // Substrate prep (added 2026-05). Either floor screed (cement-sand,
      // 7-10cm) or self-leveling compound is a mandatory pre-step before
      // laminate / parquet / vinyl on most premium jobs - currently the
      // catalog had nowhere for pros to express this work.
      svc("V211", "floor_screed_svc", [U.sqm(20, 45)]),
      svc("V212", "floor_selfleveling_svc", [U.sqm(20, 40)]),
      // Transitions and underlayment - threshold profiles where flooring
      // meets vitrage/tile/other rooms (XLSX 6 = 38 ₾/unit), underlayment
      // film/DVD between subfloor and laminate (XLSX 4/5 = 4-8 ₾/sqm).
      svc("V225", "floor_threshold_svc", [U.unit(25, 50)]),
      svc("V226", "floor_underlayment_svc", [U.sqm(4, 10)]),
    ], 2),
    sub("S039", "built_in", "Archive", [
      svc("V141", "builtin_wardrobe_svc", [U.unit(300, 2000)]),
      svc("V142", "builtin_kitchen_svc", [U.project(1000, 8000)]),
      svc("V143", "builtin_shelving_svc", [U.unit(100, 600)]),
      svc("V144", "builtin_countertop_svc", [U.meter(80, 300), U.unit(200, 1500)]),
    ], 3),
    sub("S040", "facade", "LayoutPanelTop", [
      svc("V145", "facade_cladding_svc", [U.sqm(15, 50)]),
      svc("V146", "facade_insulation_svc", [U.sqm(12, 40)]),
      svc("V147", "facade_paint_svc", [U.sqm(8, 25)]),
      svc("V148", "facade_repair_svc", [U.sqm(10, 40), U.job(100, 800)]),
    ], 4),
    sub("S041", "demolition", "Hammer", [
      svc("V149", "demo_partial_svc", [U.sqm(10, 30)]),
      svc("V150", "demo_full_svc", [U.sqm(15, 50)]),
      svc("V151", "demo_debris_svc", [U.load(50, 200)]),
    ], 5),
    // New subcategory (2026-05). Real estimates explicitly bill materials
    // delivery, debris removal, and unloading per trip - work that today
    // gets buried inside other line items. Surfacing it lets pros bid more
    // accurately and customers see the true cost breakdown.
    sub("S056", "logistics", "Truck", [
      svc("V232", "logistics_materials_svc", [U.load(30, 180)]),
      svc("V233", "logistics_debris_svc", [U.load(70, 200)]),
      svc("V234", "logistics_haul_svc", [U.load(150, 400)]),
    ], 6),
  ],
);
