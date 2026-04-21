/**
 * Service Catalog V3 — Browse-optimized
 * 14 top-level pro-type categories, nested subcategories
 */

import { translations } from './catalog-translations';

interface Label { en: string; ka: string; ru: string; }
interface UnitOptionData { id: string; key: string; unit: string; label: Label; defaultPrice: number; maxPrice?: number; }
interface ServiceData { id: string; key: string; label: Label; unitOptions: UnitOptionData[]; basePrice: number; maxPrice?: number; unit: string; unitLabel: Label; }
interface SubcategoryData { id: string; key: string; label: Label; iconName: string; priceRange: { min: number; max?: number }; sortOrder: number; isActive: boolean; services: ServiceData[]; variants: never[]; addons: never[]; additionalServices: never[]; }
interface CategoryData { id: string; key: string; label: Label; iconName: string; color: string; minPrice: number; sortOrder: number; isActive: boolean; subcategories: SubcategoryData[]; }

function t(en: string): Label {
  const tr = translations[en];
  return { en, ka: tr?.ka || en, ru: tr?.ru || en };
}

function u(id: string, key: string, unit: string, en: string, ka: string, ru: string, defaultPrice: number, maxPrice?: number): UnitOptionData {
  return { id, key, unit, label: { en, ka, ru }, defaultPrice, maxPrice };
}

function svc(id: string, key: string, en: string, unitOpts: UnitOptionData[]): ServiceData {
  const p = unitOpts[0];
  return { id, key, label: t(en), unitOptions: unitOpts, basePrice: p.defaultPrice, maxPrice: p.maxPrice, unit: p.unit, unitLabel: p.label };
}

function sub(id: string, key: string, en: string, services: ServiceData[], sortOrder: number): SubcategoryData {
  const prices = services.map(s => s.basePrice).filter(p => p > 0);
  return { id, key, label: t(en), iconName: key, priceRange: { min: Math.min(...prices, 0), max: Math.max(...prices, 0) }, sortOrder, isActive: true, services, variants: [] as never[], addons: [] as never[], additionalServices: [] as never[] };
}

const U = {
  unit:    (p: number, mx?: number) => u("U01", "per_unit",    "unit",    "per unit",       "ერთეულზე",     "за штуку",        p, mx),
  job:     (p: number, mx?: number) => u("U02", "per_job",     "job",     "per job",        "სამუშაოზე",    "за работу",       p, mx),
  hour:    (p: number, mx?: number) => u("U03", "per_hour",    "hour",    "per hour",       "საათში",       "в час",           p, mx),
  sqm:     (p: number, mx?: number) => u("U04", "per_sqm",     "sqm",     "per m²",         "მ²-ზე",        "за м²",           p, mx),
  meter:   (p: number, mx?: number) => u("U05", "per_meter",   "meter",   "per meter",      "მეტრზე",       "за метр",         p, mx),
  room:    (p: number, mx?: number) => u("U06", "per_room",    "room",    "per room",       "ოთახზე",       "за комнату",      p, mx),
  project: (p: number, mx?: number) => u("U07", "per_project", "project", "per project",    "პროექტზე",     "за проект",       p, mx),
  point:   (p: number, mx?: number) => u("U08", "per_point",   "point",   "per point",      "წერტილზე",     "за точку",        p, mx),
  window:  (p: number, mx?: number) => u("U09", "per_window",  "window",  "per window",     "ფანჯარაზე",    "за окно",         p, mx),
  door:    (p: number, mx?: number) => u("U10", "per_door",    "door",    "per door",       "კარზე",        "за дверь",        p, mx),
  tree:    (p: number, mx?: number) => u("U11", "per_tree",    "tree",    "per tree",       "ხეზე",         "за дерево",       p, mx),
  system:  (p: number, mx?: number) => u("U12", "per_system",  "system",  "per system",     "სისტემაზე",    "за систему",      p, mx),
  load:    (p: number, mx?: number) => u("U13", "per_load",    "load",    "per load",       "რეისზე",       "за рейс",         p, mx),
  studio:  (p: number, mx?: number) => u("U14", "per_studio",  "studio",  "per studio",     "სტუდიოზე",     "за студию",       p, mx),
  oneBr:   (p: number, mx?: number) => u("U15", "per_1br",     "1br",     "per 1-bedroom",  "1-ოთახიანზე",  "за 1-комнатную",  p, mx),
  twoBr:   (p: number, mx?: number) => u("U16", "per_2br",     "2br",     "per 2-bedroom",  "2-ოთახიანზე",  "за 2-комнатную",  p, mx),
  threeBr: (p: number, mx?: number) => u("U17", "per_3br",     "3br",     "per 3+ bedroom", "3+ ოთახიანზე", "за 3+ комнатную", p, mx),
};

export function buildSeedData(): CategoryData[] {
  return [
    // ═══ 1. Cleaners ═══
    {
      id: "C01", key: "cleaning", label: t("Cleaners"), iconName: "cleaner", color: "#10B981", minPrice: 3, sortOrder: 0, isActive: true,
      subcategories: [
        sub("S001", "regular_clean", "Regular home cleaning", [
          svc("V001", "regular_standard_svc", "Standard home cleaning", [
            U.sqm(3, 10), U.hour(15, 40),
            U.studio(40, 120), U.oneBr(60, 180), U.twoBr(90, 250), U.threeBr(130, 350),
          ]),
          svc("V002", "regular_recurring_svc", "Weekly / biweekly cleaning", [
            U.sqm(2, 8), U.hour(15, 35),
            U.studio(35, 100), U.oneBr(50, 140), U.twoBr(70, 200),
          ]),
        ], 0),
        sub("S002", "deep_clean", "Deep cleaning", [
          svc("V003", "deep_full_svc", "Full deep cleaning", [
            U.sqm(6, 18), U.hour(25, 60),
            U.studio(80, 250), U.oneBr(120, 350), U.twoBr(180, 500), U.threeBr(250, 700),
          ]),
          svc("V004", "deep_kitchen_svc",  "Kitchen deep clean",  [U.job(50, 200)]),
          svc("V005", "deep_bathroom_svc", "Bathroom deep clean", [U.job(40, 150)]),
        ], 1),
        sub("S003", "post_renovation_clean", "Post-renovation cleaning", [
          svc("V006", "post_reno_full_svc", "Full post-renovation cleaning", [
            U.sqm(5, 15), U.room(60, 200),
            U.studio(100, 300), U.oneBr(150, 450), U.twoBr(220, 650), U.threeBr(300, 900),
          ]),
          svc("V007", "post_reno_dust_svc",  "Construction dust removal", [U.sqm(3, 10)]),
          svc("V008", "post_reno_floor_svc", "Floor & tile deep clean",   [U.sqm(4, 12)]),
        ], 2),
        sub("S004", "move_clean", "Move-in / move-out cleaning", [
          svc("V009", "move_full_svc", "Full move-out cleaning", [
            U.sqm(4, 12), U.room(50, 150),
            U.studio(70, 200), U.oneBr(100, 280), U.twoBr(150, 400), U.threeBr(200, 550),
          ]),
          svc("V010", "move_empty_svc", "Empty apartment cleaning", [
            U.sqm(3, 10), U.studio(50, 150), U.oneBr(70, 200), U.twoBr(110, 300),
          ]),
          svc("V011", "move_cabinet_svc", "Cabinet & surface cleaning", [U.job(40, 150)]),
        ], 3),
        sub("S005", "window_clean", "Window & facade cleaning", [
          svc("V012", "window_interior_svc", "Interior windows", [U.window(8, 20)]),
          svc("V013", "window_exterior_svc", "Exterior windows", [U.window(12, 30)]),
          svc("V014", "window_facade_svc",   "Facade washing",   [U.sqm(5, 15)]),
        ], 4),
        sub("S006", "carpet_clean", "Carpet & upholstery cleaning", [
          svc("V015", "carpet_rug_svc",      "Rug & carpet cleaning",      [U.sqm(5, 20)]),
          svc("V016", "carpet_sofa_svc",     "Sofa & upholstery cleaning", [U.unit(40, 150)]),
          svc("V017", "carpet_mattress_svc", "Mattress cleaning",          [U.unit(30, 120)]),
        ], 5),
      ],
    },
    // ═══ 2. Handymen ═══
    {
      id: "C02", key: "handyman", label: t("Handymen"), iconName: "handyman", color: "#F97316", minPrice: 15, sortOrder: 1, isActive: true,
      subcategories: [
        sub("S007", "assembly", "Furniture assembly", [
          svc("V018", "assembly_flatpack_svc", "Flat-pack furniture assembly",   [U.unit(30, 100), U.hour(20, 50)]),
          svc("V019", "assembly_cabinet_svc",  "Cabinet & wardrobe assembly",    [U.unit(50, 200)]),
          svc("V020", "assembly_bed_svc",      "Bed & desk assembly",            [U.unit(40, 150)]),
          svc("V021", "assembly_office_svc",   "Office furniture assembly",      [U.unit(40, 180), U.hour(20, 50)]),
        ], 0),
        sub("S008", "mounting", "Mounting & hanging", [
          svc("V022", "mount_tv_svc",       "TV wall-mounting",               [U.unit(40, 150)]),
          svc("V023", "mount_shelf_svc",    "Shelves & wall storage",         [U.unit(25, 80)]),
          svc("V024", "mount_art_svc",      "Pictures, mirrors & art",        [U.unit(15, 60)]),
          svc("V025", "mount_curtain_svc",  "Curtain rods & blinds",          [U.unit(20, 80), U.meter(8, 25)]),
        ], 1),
        sub("S009", "repairs", "Minor home repairs", [
          svc("V026", "repair_drywall_svc",    "Drywall patching",             [U.job(40, 150)]),
          svc("V027", "repair_door_svc",       "Door & window repair",         [U.job(30, 120)]),
          svc("V028", "repair_furniture_svc",  "Furniture repair",             [U.unit(30, 150), U.hour(20, 50)]),
          svc("V029", "repair_odd_svc",        "Handyman by the hour",         [U.hour(20, 60)]),
        ], 2),
        sub("S010", "doors", "Door installation", [
          svc("V030", "door_interior_svc", "Interior door install",   [U.door(80, 200)]),
          svc("V031", "door_entry_svc",    "Entry door install",      [U.door(150, 500)]),
          svc("V032", "door_hardware_svc", "Door hardware & locks",   [U.unit(20, 80)]),
        ], 3),
        sub("S011", "trim", "Trim & decor", [
          svc("V033", "trim_baseboard_svc", "Baseboards",      [U.meter(5, 15)]),
          svc("V034", "trim_molding_svc",   "Crown moldings",  [U.meter(8, 25)]),
          svc("V035", "trim_paneling_svc",  "Wall paneling",   [U.sqm(15, 50)]),
        ], 4),
      ],
    },
    // ═══ 3. Landscapers ═══
    {
      id: "C03", key: "landscaping", label: t("Landscapers"), iconName: "landscaper_gardener", color: "#059669", minPrice: 15, sortOrder: 2, isActive: true,
      subcategories: [
        sub("S012", "landscape", "Landscape design", [
          svc("V036", "landscape_plan_svc",    "Full landscape plan",      [U.project(500, 5000)]),
          svc("V037", "landscape_consult_svc", "Design consultation",      [U.hour(30, 100)]),
          svc("V038", "landscape_3d_svc",      "3D visualization",         [U.project(300, 2000)]),
        ], 0),
        sub("S013", "gardening", "Gardening & planting", [
          svc("V039", "gardening_planting_svc", "Planting & flower beds",  [U.sqm(10, 40), U.hour(20, 50)]),
          svc("V040", "gardening_weeding_svc",  "Weeding & cleanup",       [U.sqm(3, 12), U.hour(15, 40)]),
          svc("V041", "gardening_mulch_svc",    "Mulching & fertilizing",  [U.sqm(5, 20)]),
          svc("V042", "gardening_care_svc",     "Seasonal garden care",    [U.hour(20, 50)]),
        ], 1),
        sub("S014", "lawn", "Lawn & irrigation", [
          svc("V043", "lawn_mowing_svc",    "Lawn mowing & care",          [U.sqm(1, 5), U.hour(20, 50)]),
          svc("V044", "lawn_install_svc",   "Lawn installation & sodding", [U.sqm(8, 25)]),
          svc("V045", "lawn_sprinkler_svc", "Sprinkler system install",    [U.system(300, 2000)]),
          svc("V046", "lawn_sprink_rep_svc","Sprinkler system repair",     [U.job(40, 200)]),
          svc("V047", "lawn_aeration_svc",  "Aeration & overseeding",      [U.sqm(2, 8)]),
        ], 2),
        sub("S015", "tree_care", "Tree & hedge care", [
          svc("V048", "tree_prune_svc",  "Tree pruning",           [U.tree(50, 200)]),
          svc("V049", "tree_remove_svc", "Tree removal",           [U.tree(100, 500)]),
          svc("V050", "tree_stump_svc",  "Stump removal",          [U.tree(60, 250)]),
          svc("V051", "tree_hedge_svc",  "Hedge trimming",         [U.meter(8, 25)]),
          svc("V052", "tree_plant_svc",  "Tree & shrub planting",  [U.tree(30, 150)]),
        ], 3),
        sub("S016", "fences", "Fences & gates", [
          svc("V053", "fence_wood_svc",   "Wooden fence",       [U.meter(30, 100)]),
          svc("V054", "fence_metal_svc",  "Metal fence",        [U.meter(40, 150)]),
          svc("V055", "fence_gate_svc",   "Gate installation",  [U.unit(150, 800)]),
          svc("V056", "fence_repair_svc", "Fence repair",       [U.meter(15, 60), U.job(40, 200)]),
        ], 4),
      ],
    },
    // ═══ 4. Movers ═══
    {
      id: "C04", key: "movers", label: t("Movers"), iconName: "movers", color: "#8B5CF6", minPrice: 15, sortOrder: 3, isActive: true,
      subcategories: [
        sub("S017", "home_moving", "Home moving", [
          svc("V057", "move_local_svc", "Local home moving", [
            U.hour(25, 80), U.job(100, 500),
            U.studio(80, 250), U.oneBr(120, 400), U.twoBr(200, 600), U.threeBr(300, 900),
          ]),
          svc("V058", "move_distance_svc", "Long-distance moving", [
            U.job(200, 2000), U.hour(30, 100),
          ]),
        ], 0),
        sub("S018", "office_moving", "Office moving", [
          svc("V059", "office_relocation_svc",    "Office relocation",            [U.hour(30, 100), U.job(300, 3000)]),
          svc("V060", "office_furniture_svc",     "Office furniture & equipment", [U.unit(30, 150), U.hour(25, 80)]),
        ], 1),
        sub("S019", "packing", "Packing & unpacking", [
          svc("V061", "packing_full_svc",     "Full packing service",        [U.hour(20, 50), U.room(50, 200)]),
          svc("V062", "packing_fragile_svc",  "Fragile items packing",       [U.hour(25, 60)]),
          svc("V063", "packing_unpack_svc",   "Unpacking service",           [U.hour(20, 50)]),
        ], 2),
        sub("S020", "labor", "Labor help", [
          svc("V064", "labor_loading_svc",    "Loading & unloading",         [U.hour(20, 50)]),
          svc("V065", "labor_heavy_svc",      "Heavy appliance moving",      [U.unit(40, 150)]),
          svc("V066", "labor_rearrange_svc",  "Furniture rearranging",       [U.hour(20, 50)]),
          svc("V067", "labor_specialty_svc",  "Piano & specialty items",     [U.unit(100, 500), U.job(200, 1000)]),
        ], 3),
      ],
    },
    // ═══ 5. Plumbers ═══
    {
      id: "C05", key: "plumbing", label: t("Plumbers"), iconName: "plumber", color: "#3B82F6", minPrice: 20, sortOrder: 4, isActive: true,
      subcategories: [
        sub("S021", "plumbing_install", "Plumbing installation", [
          svc("V068", "plumb_faucet_svc",     "Faucet installation",       [U.unit(30, 100)]),
          svc("V069", "plumb_toilet_svc",     "Toilet installation",       [U.unit(60, 200)]),
          svc("V070", "plumb_sink_svc",       "Sink or bathtub install",   [U.unit(80, 300)]),
          svc("V071", "plumb_shower_svc",     "Shower cabin install",      [U.unit(100, 400)]),
          svc("V072", "plumb_dishwasher_svc", "Dishwasher hookup",         [U.unit(50, 150)]),
          svc("V073", "plumb_washer_svc",     "Washing machine hookup",    [U.unit(50, 150)]),
        ], 0),
        sub("S022", "plumbing_repair", "Plumbing repair", [
          svc("V074", "plumb_leak_svc",      "Leak repair",                 [U.job(30, 120)]),
          svc("V075", "plumb_clog_svc",      "Drain unclogging",            [U.job(40, 150)]),
          svc("V076", "plumb_pipe_svc",      "Pipe repair",                 [U.job(40, 200)]),
          svc("V077", "plumb_pressure_svc",  "Low water pressure fix",      [U.job(40, 150)]),
          svc("V078", "plumb_emergency_svc", "Emergency call",              [U.hour(30, 80)]),
        ], 1),
        sub("S023", "drainage", "Drainage & sewage", [
          svc("V079", "drainage_install_svc", "Drainage installation",       [U.meter(10, 40)]),
          svc("V080", "drainage_sewage_svc",  "Sewage line connection",      [U.job(100, 500)]),
          svc("V081", "drainage_outdoor_svc", "Outdoor/yard drainage",       [U.meter(15, 50)]),
        ], 2),
        sub("S024", "boiler", "Boiler & water heater", [
          svc("V082", "boiler_gas_svc",      "Gas boiler install",           [U.unit(100, 400)]),
          svc("V083", "boiler_electric_svc", "Electric boiler install",      [U.unit(80, 300)]),
          svc("V084", "boiler_repair_svc",   "Boiler repair",                [U.job(40, 200)]),
          svc("V085", "boiler_service_svc",  "Boiler annual service",        [U.unit(40, 150)]),
        ], 3),
        sub("S025", "gas", "Gas systems", [
          svc("V086", "gas_line_svc",    "Gas line installation",            [U.meter(15, 50), U.job(100, 500)]),
          svc("V087", "gas_stove_svc",   "Gas stove installation",           [U.unit(40, 150)]),
          svc("V088", "gas_leak_svc",    "Gas leak detection",               [U.job(40, 150)]),
        ], 4),
      ],
    },
    // ═══ 6. Electrical pros ═══
    {
      id: "C06", key: "electrical", label: t("Electrical pros"), iconName: "electrician", color: "#F59E0B", minPrice: 15, sortOrder: 5, isActive: true,
      subcategories: [
        sub("S026", "wiring", "Wiring & power", [
          svc("V089", "wiring_new_svc",    "New wiring",                 [U.meter(5, 20), U.point(25, 60)]),
          svc("V090", "wiring_outlet_svc", "Outlet & switch install",    [U.point(20, 50)]),
          svc("V091", "wiring_repair_svc", "Wiring repair",              [U.job(30, 150)]),
          svc("V092", "wiring_ev_svc",     "EV charger install",         [U.unit(200, 800)]),
        ], 0),
        sub("S027", "lighting", "Lighting", [
          svc("V093", "light_ceiling_svc", "Ceiling light install",      [U.unit(25, 80)]),
          svc("V094", "light_spot_svc",    "Spotlight install",          [U.unit(15, 50)]),
          svc("V095", "light_led_svc",     "LED strip install",          [U.meter(10, 30)]),
          svc("V096", "light_outdoor_svc", "Outdoor lighting",           [U.unit(30, 120)]),
          svc("V097", "light_fan_svc",     "Ceiling fan install",        [U.unit(50, 180)]),
        ], 1),
        sub("S028", "electrical_panel", "Electrical panel", [
          svc("V098", "panel_install_svc", "New panel install",          [U.unit(100, 400)]),
          svc("V099", "panel_breaker_svc", "Breaker replacement",        [U.unit(20, 60)]),
          svc("V100", "panel_upgrade_svc", "Panel upgrade & expansion",  [U.unit(80, 300)]),
        ], 2),
        sub("S029", "smart_home", "Smart home", [
          svc("V101", "smart_switch_svc", "Smart switches & outlets",    [U.unit(30, 100)]),
          svc("V102", "smart_light_svc",  "Smart lighting",              [U.unit(30, 120)]),
          svc("V103", "smart_full_svc",   "Full smart home setup",       [U.system(300, 3000)]),
        ], 3),
        sub("S030", "security", "Security systems", [
          svc("V104", "security_cctv_svc",     "CCTV installation",      [U.unit(60, 200)]),
          svc("V105", "security_alarm_svc",    "Alarm system install",   [U.system(200, 1000)]),
          svc("V106", "security_intercom_svc", "Intercom install",       [U.unit(100, 300)]),
        ], 4),
      ],
    },
    // ═══ 7. Painters ═══
    {
      id: "C07", key: "painters", label: t("Painters"), iconName: "painter", color: "#EC4899", minPrice: 5, sortOrder: 6, isActive: true,
      subcategories: [
        sub("S031", "painter", "Interior painting", [
          svc("V107", "paint_interior_svc",  "Wall painting",               [U.sqm(5, 15), U.room(60, 250)]),
          svc("V108", "paint_ceiling_svc",   "Ceiling painting",            [U.sqm(6, 18), U.room(50, 200)]),
          svc("V109", "paint_wallpaper_svc", "Wallpaper hanging",           [U.sqm(5, 20), U.room(70, 300)]),
          svc("V110", "paint_trim_svc",      "Trim, doors & windows",       [U.meter(4, 12), U.unit(30, 120)]),
        ], 0),
        sub("S032", "exterior_paint", "Exterior painting", [
          svc("V111", "paint_exterior_svc",  "Exterior wall painting",      [U.sqm(8, 25)]),
          svc("V112", "paint_fence_svc",     "Fence & railing painting",    [U.meter(8, 25), U.sqm(6, 18)]),
          svc("V113", "paint_metal_svc",     "Metal surface painting",      [U.sqm(10, 30)]),
        ], 1),
        sub("S033", "plasterer", "Plasterer & drywaller", [
          svc("V114", "plaster_walls_svc",     "Plastering",                [U.sqm(8, 25)]),
          svc("V115", "plaster_drywall_svc",   "Drywall install",           [U.sqm(12, 35)]),
          svc("V116", "plaster_ceiling_svc",   "Ceiling plaster",           [U.sqm(10, 30)]),
          svc("V117", "plaster_decorative_svc","Decorative plaster",        [U.sqm(20, 60)]),
        ], 2),
      ],
    },
    // ═══ 8. HVAC pros ═══
    {
      id: "C08", key: "hvac", label: t("HVAC pros"), iconName: "hvac", color: "#06B6D4", minPrice: 20, sortOrder: 7, isActive: true,
      subcategories: [
        sub("S034", "heating", "Heating", [
          svc("V118", "heat_radiator_svc",   "Radiator installation",        [U.unit(40, 150)]),
          svc("V119", "heat_system_svc",     "Heating system install",        [U.sqm(15, 50)]),
          svc("V120", "heat_underfloor_svc", "Underfloor heating",            [U.sqm(20, 60)]),
          svc("V121", "heat_repair_svc",     "Heating repair & service",      [U.job(40, 200), U.hour(30, 80)]),
          svc("V122", "heat_thermostat_svc", "Thermostat install",            [U.unit(40, 150)]),
        ], 0),
        sub("S035", "ac_ventilation", "AC & ventilation", [
          svc("V123", "ac_install_svc",      "AC installation",               [U.unit(80, 300)]),
          svc("V124", "ac_repair_svc",       "AC repair",                     [U.job(40, 200)]),
          svc("V125", "ac_service_svc",      "AC maintenance & cleaning",     [U.unit(40, 120)]),
          svc("V126", "ventilation_svc",     "Ventilation install",           [U.system(200, 1500)]),
          svc("V127", "hood_svc",            "Range hood install",            [U.unit(60, 200)]),
        ], 1),
      ],
    },
    // ═══ 9. Contractors ═══
    {
      id: "C09", key: "contractors", label: t("Contractors"), iconName: "contractor", color: "#C4735B", minPrice: 10, sortOrder: 8, isActive: true,
      subcategories: [
        sub("S036", "general_contracting", "General contracting", [
          svc("V128", "gc_full_svc",      "Full home renovation",          [U.sqm(100, 500), U.project(5000, 80000)]),
          svc("V129", "gc_kitchen_svc",   "Kitchen renovation",            [U.project(2000, 15000), U.sqm(150, 600)]),
          svc("V130", "gc_bathroom_svc",  "Bathroom renovation",           [U.project(1500, 10000), U.sqm(200, 800)]),
        ], 0),
        sub("S037", "tiler", "Tile work", [
          svc("V131", "tile_floor_svc",   "Floor tiling",                  [U.sqm(10, 35)]),
          svc("V132", "tile_wall_svc",    "Wall tiling",                   [U.sqm(12, 40)]),
          svc("V133", "tile_mosaic_svc",  "Mosaic",                        [U.sqm(25, 80)]),
          svc("V134", "tile_remove_svc",  "Tile removal",                  [U.sqm(5, 15)]),
          svc("V135", "tile_grout_svc",   "Grout cleaning & regrouting",   [U.sqm(5, 18)]),
        ], 1),
        sub("S038", "flooring", "Flooring", [
          svc("V136", "floor_parquet_svc",  "Parquet",                      [U.sqm(12, 40)]),
          svc("V137", "floor_laminate_svc", "Laminate",                     [U.sqm(8, 25)]),
          svc("V138", "floor_vinyl_svc",    "Vinyl flooring",               [U.sqm(8, 25)]),
          svc("V139", "floor_repair_svc",   "Floor repair",                 [U.sqm(6, 20)]),
          svc("V140", "floor_sand_svc",     "Floor sanding & refinishing",  [U.sqm(8, 25)]),
        ], 2),
        sub("S039", "built_in", "Built-in furniture", [
          svc("V141", "builtin_wardrobe_svc",    "Wardrobe",                [U.unit(300, 2000)]),
          svc("V142", "builtin_kitchen_svc",     "Kitchen cabinetry",       [U.project(1000, 8000)]),
          svc("V143", "builtin_shelving_svc",    "Shelving",                [U.unit(100, 600)]),
          svc("V144", "builtin_countertop_svc",  "Countertops",             [U.meter(80, 300), U.unit(200, 1500)]),
        ], 3),
        sub("S040", "facade", "Facade & insulation", [
          svc("V145", "facade_cladding_svc",   "Cladding",                  [U.sqm(15, 50)]),
          svc("V146", "facade_insulation_svc", "Thermal insulation",        [U.sqm(12, 40)]),
          svc("V147", "facade_paint_svc",      "Facade painting",           [U.sqm(8, 25)]),
          svc("V148", "facade_repair_svc",     "Facade repair",             [U.sqm(10, 40), U.job(100, 800)]),
        ], 4),
        sub("S041", "demolition", "Demolition", [
          svc("V149", "demo_partial_svc", "Partial demolition",             [U.sqm(10, 30)]),
          svc("V150", "demo_full_svc",    "Full demolition",                [U.sqm(15, 50)]),
          svc("V151", "demo_debris_svc",  "Debris removal",                 [U.load(50, 200)]),
        ], 5),
      ],
    },
    // ═══ 10. Architects ═══
    {
      id: "C10", key: "architects", label: t("Architects"), iconName: "architect", color: "#7C3AED", minPrice: 200, sortOrder: 9, isActive: true,
      subcategories: [
        sub("S042", "architecture", "Architectural design", [
          svc("V152", "arch_residential_svc", "Residential project",  [U.project(500, 5000), U.sqm(10, 40)]),
          svc("V153", "arch_commercial_svc",  "Commercial project",   [U.project(1000, 10000), U.sqm(15, 50)]),
          svc("V154", "arch_renovation_svc",  "Renovation plan",      [U.project(300, 3000)]),
          svc("V155", "arch_3d_svc",          "3D visualization",     [U.project(200, 2000)]),
        ], 0),
        sub("S043", "permits", "Permits & documentation", [
          svc("V156", "permits_construction_svc", "Construction permit",  [U.project(200, 2000)]),
          svc("V157", "permits_expertise_svc",    "Building expertise",   [U.project(150, 1500)]),
          svc("V158", "permits_asbuilt_svc",      "As-built drawings",    [U.project(150, 1500)]),
          svc("V159", "permits_legal_svc",        "Legal documentation",  [U.project(100, 1000)]),
        ], 1),
        sub("S044", "project_management", "Supervision & estimation", [
          svc("V160", "pm_site_svc",       "Site supervision",        [U.project(300, 3000), U.hour(40, 120)]),
          svc("V161", "pm_estimate_svc",   "Cost estimation",         [U.project(200, 2000)]),
          svc("V162", "pm_manage_svc",     "Construction management", [U.project(500, 5000)]),
          svc("V163", "pm_consulting_svc", "Technical consulting",    [U.hour(40, 150)]),
        ], 2),
      ],
    },
    // ═══ 11. Pool & spa ═══
    {
      id: "C11", key: "pool_spa", label: t("Pool & spa"), iconName: "pool", color: "#0EA5E9", minPrice: 30, sortOrder: 10, isActive: true,
      subcategories: [
        sub("S045", "pool", "Pool & spa install", [
          svc("V164", "pool_build_svc",   "Pool construction",            [U.project(2000, 20000), U.sqm(200, 800)]),
          svc("V165", "pool_spa_svc",     "Spa / jacuzzi install",        [U.unit(500, 5000)]),
          svc("V166", "pool_sauna_svc",   "Sauna install",                [U.unit(800, 4000)]),
          svc("V167", "pool_heater_svc",  "Pool heater install",          [U.unit(400, 2500)]),
        ], 0),
        sub("S046", "pool_service", "Pool maintenance", [
          svc("V168", "pool_clean_svc",   "Regular pool cleaning",        [U.job(40, 150), U.hour(25, 60)]),
          svc("V169", "pool_water_svc",   "Water treatment",              [U.job(30, 150)]),
          svc("V170", "pool_equip_svc",   "Pump & filter service",        [U.job(40, 200)]),
          svc("V171", "pool_repair_svc",  "Pool repair",                  [U.job(80, 500)]),
        ], 1),
      ],
    },
    // ═══ 12. Roofing ═══
    {
      id: "C12", key: "roofing", label: t("Roofing"), iconName: "roofer", color: "#78716C", minPrice: 10, sortOrder: 11, isActive: true,
      subcategories: [
        sub("S047", "roofer", "Roof installation", [
          svc("V172", "roof_metal_svc",    "Metal roof install",             [U.sqm(20, 50)]),
          svc("V173", "roof_tile_svc",     "Tile roof install",              [U.sqm(25, 60)]),
          svc("V174", "roof_flat_svc",     "Flat roof install",              [U.sqm(18, 45)]),
          svc("V175", "roof_bitumen_svc",  "Bitumen shingle roof",           [U.sqm(15, 40)]),
        ], 0),
        sub("S048", "roof_repair", "Repair & waterproofing", [
          svc("V176", "roof_repair_svc",     "Roof repair",                  [U.job(50, 500), U.sqm(10, 40)]),
          svc("V177", "roof_leak_svc",       "Roof leak repair",             [U.job(40, 300)]),
          svc("V178", "roof_waterproof_svc", "Roof waterproofing",           [U.sqm(10, 30)]),
          svc("V179", "roof_inspect_svc",    "Roof inspection",              [U.job(40, 150)]),
        ], 1),
        sub("S049", "roof_gutters", "Gutters & insulation", [
          svc("V180", "roof_gutter_install_svc", "Gutter install",            [U.meter(20, 60)]),
          svc("V181", "roof_gutter_clean_svc",   "Gutter cleaning",           [U.meter(3, 10), U.job(40, 150)]),
          svc("V182", "roof_insulation_svc",     "Attic & roof insulation",   [U.sqm(12, 35)]),
        ], 2),
      ],
    },
    // ═══ 13. Windows & doors ═══
    {
      id: "C13", key: "windows_doors", label: t("Windows & doors"), iconName: "window_door", color: "#6366F1", minPrice: 50, sortOrder: 12, isActive: true,
      subcategories: [
        sub("S050", "windows", "Windows", [
          svc("V183", "wd_pvc_svc",       "PVC windows",              [U.window(100, 400)]),
          svc("V184", "wd_aluminum_svc",  "Aluminum windows",         [U.window(120, 500)]),
          svc("V185", "wd_wood_svc",      "Wood windows",             [U.window(150, 600)]),
          svc("V186", "wd_screen_svc",    "Window screens & mesh",    [U.window(20, 60)]),
        ], 0),
        sub("S051", "glazing", "Glazing & glass", [
          svc("V187", "wd_balcony_svc",   "Balcony glazing",          [U.sqm(80, 250), U.meter(120, 400)]),
          svc("V188", "wd_glass_svc",     "Glass replacement",        [U.sqm(60, 200), U.unit(40, 200)]),
          svc("V189", "wd_partition_svc", "Glass partitions",         [U.sqm(80, 250)]),
          svc("V190", "wd_window_fix_svc","Window repair & sealing",  [U.job(30, 150), U.window(20, 80)]),
        ], 1),
        sub("S052", "specialty_doors", "Specialty doors", [
          svc("V191", "wd_entry_svc",     "Entry door",               [U.door(200, 800)]),
          svc("V192", "wd_security_svc",  "Security / armored door",  [U.door(400, 2000)]),
          svc("V193", "wd_sliding_svc",   "Sliding & French doors",   [U.door(250, 1200)]),
          svc("V194", "wd_garage_svc",    "Garage door",              [U.unit(500, 3000)]),
        ], 2),
      ],
    },
    // ═══ 14. Concrete & masonry ═══
    {
      id: "C14", key: "concrete_masonry", label: t("Concrete & masonry"), iconName: "mason", color: "#64748B", minPrice: 15, sortOrder: 13, isActive: true,
      subcategories: [
        sub("S053", "mason", "Masonry & stonework", [
          svc("V195", "mason_brick_svc",     "Brick laying",                  [U.sqm(20, 60)]),
          svc("V196", "mason_stone_svc",     "Stone walls",                   [U.sqm(30, 80)]),
          svc("V197", "mason_retaining_svc", "Retaining walls",               [U.sqm(40, 120), U.meter(60, 200)]),
          svc("V198", "mason_repair_svc",    "Masonry repair",                [U.sqm(20, 60), U.job(80, 400)]),
        ], 0),
        sub("S054", "concrete", "Concrete work", [
          svc("V199", "concrete_foundation_svc", "Foundation work",             [U.project(500, 5000), U.sqm(40, 120)]),
          svc("V200", "concrete_pouring_svc",    "Concrete pouring",            [U.sqm(15, 50)]),
          svc("V201", "concrete_stairs_svc",     "Concrete stairs",             [U.unit(200, 1500)]),
          svc("V202", "concrete_repair_svc",     "Concrete repair",             [U.sqm(15, 50), U.job(50, 300)]),
        ], 1),
        sub("S055", "paving", "Paving", [
          svc("V203", "paving_driveway_svc", "Driveway paving",               [U.sqm(25, 70)]),
          svc("V204", "paving_pathway_svc",  "Walkways & garden paths",       [U.sqm(15, 50)]),
          svc("V205", "paving_patio_svc",    "Patio & terrace",               [U.sqm(20, 60)]),
          svc("V206", "paving_stones_svc",   "Paving stones",                 [U.sqm(20, 60)]),
        ], 2),
      ],
    },
  ];
}
