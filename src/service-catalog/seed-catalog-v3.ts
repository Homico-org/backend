/**
 * Service Catalog V3 — Browse-optimized
 * 7 top-level categories for homeowners
 * Current professional types become subcategories
 */

import { translations } from './catalog-translations';

interface Label { en: string; ka: string; ru: string; }
interface UnitOptionData { key: string; unit: string; label: Label; defaultPrice: number; maxPrice?: number; }
interface ServiceData { key: string; label: Label; unitOptions: UnitOptionData[]; basePrice: number; maxPrice?: number; unit: string; unitLabel: Label; }
interface SubcategoryData { key: string; label: Label; iconName: string; priceRange: { min: number; max?: number }; sortOrder: number; isActive: boolean; services: ServiceData[]; variants: never[]; addons: never[]; additionalServices: never[]; }
interface CategoryData { key: string; label: Label; iconName: string; color: string; minPrice: number; sortOrder: number; isActive: boolean; subcategories: SubcategoryData[]; }

function t(en: string): Label {
  const tr = translations[en];
  return { en, ka: tr?.ka || en, ru: tr?.ru || en };
}

function u(key: string, unit: string, en: string, ka: string, ru: string, defaultPrice: number, maxPrice?: number): UnitOptionData {
  return { key, unit, label: { en, ka, ru }, defaultPrice, maxPrice };
}

function svc(key: string, en: string, unitOpts: UnitOptionData[]): ServiceData {
  const p = unitOpts[0];
  return { key, label: t(en), unitOptions: unitOpts, basePrice: p.defaultPrice, maxPrice: p.maxPrice, unit: p.unit, unitLabel: p.label };
}

function sub(key: string, en: string, services: ServiceData[], sortOrder: number): SubcategoryData {
  const prices = services.map(s => s.basePrice).filter(p => p > 0);
  return { key, label: t(en), iconName: key, priceRange: { min: Math.min(...prices, 0), max: Math.max(...prices, 0) }, sortOrder, isActive: true, services, variants: [] as never[], addons: [] as never[], additionalServices: [] as never[] };
}

const U = {
  unit: (p: number, mx?: number) => u("per_unit", "unit", "per unit", "ერთეულზე", "за штуку", p, mx),
  job: (p: number, mx?: number) => u("per_job", "job", "per job", "სამუშაოზე", "за работу", p, mx),
  hour: (p: number, mx?: number) => u("per_hour", "hour", "per hour", "საათში", "в час", p, mx),
  sqm: (p: number, mx?: number) => u("per_sqm", "sqm", "per m²", "მ²-ზე", "за м²", p, mx),
  meter: (p: number, mx?: number) => u("per_meter", "meter", "per meter", "მეტრზე", "за метр", p, mx),
  room: (p: number, mx?: number) => u("per_room", "room", "per room", "ოთახზე", "за комнату", p, mx),
  project: (p: number, mx?: number) => u("per_project", "project", "per project", "პროექტზე", "за проект", p, mx),
  point: (p: number, mx?: number) => u("per_point", "point", "per point", "წერტილზე", "за точку", p, mx),
  window: (p: number, mx?: number) => u("per_window", "window", "per window", "ფანჯარაზე", "за окно", p, mx),
  door: (p: number, mx?: number) => u("per_door", "door", "per door", "კარზე", "за дверь", p, mx),
  tree: (p: number, mx?: number) => u("per_tree", "tree", "per tree", "ხეზე", "за дерево", p, mx),
  system: (p: number, mx?: number) => u("per_system", "system", "per system", "სისტემაზე", "за систему", p, mx),
  load: (p: number, mx?: number) => u("per_load", "load", "per load", "რეისზე", "за рейс", p, mx),
};

export function buildSeedData(): CategoryData[] {
  return [
    // ═══ 1. სარემონტო სამუშაოები (Renovation) ═══
    {
      key: "renovation", label: t("Renovation"), iconName: "renovation", color: "#C4735B", minPrice: 5, sortOrder: 0, isActive: true,
      subcategories: [
        sub("painter", "Painter", [
          svc("painting_svc", "Painting & wallpapering", [U.sqm(5, 20), U.room(60, 300)]),
        ], 0),
        sub("tiler", "Tiler", [
          svc("tiling_svc", "Tiling (floor & wall)", [U.sqm(10, 40), U.room(100, 400)]),
        ], 1),
        sub("flooring", "Flooring", [
          svc("flooring_svc", "Flooring (parquet, laminate, vinyl)", [U.sqm(8, 40), U.room(80, 400)]),
        ], 2),
        sub("plasterer", "Plasterer & drywaller", [
          svc("plaster_svc", "Plastering, drywall & ceilings", [U.sqm(8, 35), U.room(100, 500)]),
        ], 3),
        sub("mason", "Mason & builder", [
          svc("masonry_svc", "Bricklaying, concrete & stonework", [U.sqm(15, 60), U.job(100, 2000)]),
        ], 4),
        sub("roofer", "Roofer", [
          svc("roofing_svc", "Roofing & waterproofing", [U.sqm(15, 50), U.job(50, 500)]),
        ], 5),
        sub("window_door", "Window & door installer", [
          svc("window_door_svc", "Windows, doors & glazing", [U.unit(80, 400)]),
        ], 6),
        sub("facade", "Facade specialist", [
          svc("facade_svc", "Cladding, insulation & facade", [U.sqm(15, 60)]),
        ], 7),
        sub("demolition", "Demolition", [
          svc("demolition_svc", "Demolition & debris removal", [U.sqm(15, 50), U.load(50, 200)]),
        ], 8),
      ],
    },
    // ═══ 2. ელექტრიკა (Electrical) ═══
    {
      key: "electrical", label: t("Electrical"), iconName: "electrician", color: "#F59E0B", minPrice: 20, sortOrder: 1, isActive: true,
      subcategories: [
        sub("wiring", "Wiring & power", [
          svc("wiring_svc", "Wiring & outlets", [U.point(25, 60), U.meter(5, 20)]),
        ], 0),
        sub("lighting", "Lighting", [
          svc("lighting_svc", "Lighting installation", [U.unit(20, 100), U.point(20, 60)]),
        ], 1),
        sub("electrical_panel", "Electrical panel", [
          svc("panel_svc", "Panel & breakers", [U.unit(50, 200)]),
        ], 2),
        sub("smart_home", "Smart home", [
          svc("smart_svc", "Smart home & automation", [U.unit(30, 200), U.system(100, 500)]),
        ], 3),
        sub("security", "Security systems", [
          svc("security_svc", "CCTV, alarm & intercom", [U.unit(50, 200), U.system(100, 500)]),
        ], 4),
      ],
    },
    // ═══ 3. სანტექნიკა (Plumbing) ═══
    {
      key: "plumbing", label: t("Plumbing"), iconName: "plumber", color: "#3B82F6", minPrice: 20, sortOrder: 2, isActive: true,
      subcategories: [
        sub("plumbing_install", "Plumbing installation", [
          svc("plumb_install_svc", "Plumbing installation", [U.unit(40, 200), U.job(50, 300)]),
        ], 0),
        sub("plumbing_repair", "Plumbing repair", [
          svc("plumb_repair_svc", "Plumbing repair", [U.job(30, 150), U.hour(25, 60)]),
        ], 1),
        sub("heating", "Heating", [
          svc("heating_svc", "Heating systems & radiators", [U.unit(50, 300), U.sqm(15, 45)]),
        ], 2),
        sub("drainage", "Drainage & sewage", [
          svc("drainage_svc", "Drainage & sewage", [U.job(40, 200), U.meter(10, 40)]),
        ], 3),
        sub("boiler", "Boiler & water heater", [
          svc("boiler_svc", "Boiler & water heater", [U.unit(60, 300)]),
        ], 4),
        sub("ac_ventilation", "AC & ventilation", [
          svc("ac_svc", "Air conditioning & ventilation", [U.unit(80, 300), U.system(200, 1000)]),
        ], 5),
        sub("gas", "Gas systems", [
          svc("gas_svc", "Gas boiler, pipes & connections", [U.unit(50, 300), U.job(50, 200)]),
        ], 6),
      ],
    },
    // ═══ 4. ავეჯი (Furniture) ═══
    {
      key: "furniture", label: t("Furniture"), iconName: "carpenter", color: "#6366F1", minPrice: 30, sortOrder: 3, isActive: true,
      subcategories: [
        sub("built_in", "Built-in furniture", [
          svc("builtin_svc", "Built-in furniture (wardrobe, kitchen, shelving)", [U.unit(200, 2000), U.project(500, 5000)]),
        ], 0),
        sub("doors", "Door installation", [
          svc("door_svc", "Door installation & repair", [U.door(80, 300)]),
        ], 1),
        sub("trim", "Trim & decor", [
          svc("trim_svc", "Skirting, molding, paneling", [U.meter(5, 20)]),
        ], 2),
        sub("assembly", "Furniture assembly", [
          svc("assembly_svc", "Furniture assembly & repair", [U.unit(40, 150), U.hour(20, 50)]),
        ], 3),
      ],
    },
    // ═══ 5. დიზაინი (Design) ═══
    {
      key: "design", label: t("Design"), iconName: "designer", color: "#A855F7", minPrice: 200, sortOrder: 4, isActive: true,
      subcategories: [
        sub("interior_design", "Interior design", [
          svc("interior_svc", "Interior design project", [U.project(300, 5000)]),
        ], 0),
        sub("exterior_design", "Exterior design", [
          svc("exterior_svc", "Exterior design project", [U.project(300, 5000)]),
        ], 1),
        sub("architecture", "Architecture", [
          svc("arch_svc", "Architectural project", [U.project(500, 10000)]),
        ], 2),
        sub("permits", "Permits & documentation", [
          svc("permits_svc", "Permits & documentation", [U.project(200, 3000)]),
        ], 3),
        sub("project_management", "Project management", [
          svc("pm_svc", "Supervision & cost estimation", [U.project(300, 10000)]),
        ], 4),
      ],
    },
    // ═══ 6. დასუფთავება (Cleaning) ═══
    {
      key: "cleaning", label: t("Cleaning"), iconName: "cleaner", color: "#10B981", minPrice: 5, sortOrder: 5, isActive: true,
      subcategories: [
        sub("post_renovation_clean", "Post-renovation cleaning", [
          svc("post_reno_svc", "Post-construction / post-renovation cleaning", [U.sqm(5, 15), U.room(50, 200)]),
        ], 0),
        sub("move_clean", "Move-in / move-out cleaning", [
          svc("move_svc", "Move-in / move-out cleaning", [U.sqm(4, 12), U.room(40, 150)]),
        ], 1),
        sub("window_clean", "Window & facade cleaning", [
          svc("window_clean_svc", "Window & facade cleaning", [U.window(10, 30), U.sqm(5, 15)]),
        ], 2),
        sub("carpet_clean", "Carpet & upholstery cleaning", [
          svc("carpet_svc", "Carpet & upholstery cleaning", [U.sqm(5, 20), U.unit(40, 150)]),
        ], 3),
      ],
    },
    // ═══ 7. ბაღი (Garden) ═══
    {
      key: "garden", label: t("Garden"), iconName: "landscaper_gardener", color: "#059669", minPrice: 15, sortOrder: 6, isActive: true,
      subcategories: [
        sub("landscape", "Landscape design", [
          svc("landscape_svc", "Landscape design & installation", [U.sqm(20, 80), U.project(300, 5000)]),
        ], 0),
        sub("gardening", "Gardening & planting", [
          svc("gardening_svc", "Gardening, planting & maintenance", [U.hour(25, 60), U.sqm(3, 15)]),
        ], 1),
        sub("lawn", "Lawn & irrigation", [
          svc("lawn_svc", "Lawn installation & irrigation", [U.sqm(5, 20), U.system(100, 500)]),
        ], 2),
        sub("tree_care", "Tree & hedge care", [
          svc("tree_svc", "Pruning, removal & trimming", [U.tree(50, 300), U.hour(30, 80)]),
        ], 3),
        sub("paving", "Driveways & paving", [
          svc("paving_svc", "Driveway, terrace & paving", [U.sqm(15, 60)]),
        ], 4),
        sub("fences", "Fences & walls", [
          svc("fence_svc", "Fences & outdoor walls", [U.meter(30, 150)]),
        ], 5),
        sub("pool", "Pool", [
          svc("pool_svc", "Pool installation & maintenance", [U.project(2000, 20000), U.job(50, 500)]),
        ], 6),
      ],
    },
  ];
}
