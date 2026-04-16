/**
 * Service Catalog V2 — Trade-based professional categories
 * 21 professional types with ~100 services, multi-unit pricing support
 *
 * Usage: import { buildSeedDataV2 } from './seed-catalog-v2';
 */

interface Label {
  en: string;
  ka: string;
  ru: string;
}

interface UnitOptionData {
  key: string;
  unit: string;
  label: Label;
  defaultPrice: number;
  maxPrice?: number;
}

interface Service {
  key: string;
  label: Label;
  unitOptions: UnitOptionData[];
  basePrice: number;
  maxPrice?: number;
  unit: string;
  unitLabel: Label;
}

interface Subcategory {
  key: string;
  label: Label;
  iconName: string;
  priceRange: { min: number; max?: number };
  sortOrder: number;
  isActive: boolean;
  services: Service[];
  variants: never[];
  addons: never[];
  additionalServices: never[];
}

interface Category {
  key: string;
  label: Label;
  iconName: string;
  color: string;
  minPrice: number;
  sortOrder: number;
  isActive: boolean;
  subcategories: Subcategory[];
}

// ─── Unit label helpers ────────────────────────────────────────
function u(
  key: string,
  unit: string,
  en: string,
  ka: string,
  ru: string,
  defaultPrice: number,
  maxPrice?: number,
): UnitOptionData {
  return { key, unit, label: { en, ka, ru }, defaultPrice, maxPrice };
}

const U = {
  job: (p: number, mx?: number) =>
    u("per_job", "job", "per job", "სამუშაოზე", "за работу", p, mx),
  hour: (p: number, mx?: number) =>
    u("per_hour", "hour", "per hour", "საათში", "в час", p, mx),
  day: (p: number, mx?: number) =>
    u("per_day", "day", "per day", "დღეში", "в день", p, mx),
  unit: (p: number, mx?: number) =>
    u("per_unit", "unit", "per unit", "ერთეულზე", "за штуку", p, mx),
  piece: (p: number, mx?: number) =>
    u("per_piece", "piece", "per piece", "ცალზე", "за штуку", p, mx),
  sqm: (p: number, mx?: number) =>
    u("per_sqm", "sqm", "per m²", "მ²-ზე", "за м²", p, mx),
  meter: (p: number, mx?: number) =>
    u("per_meter", "meter", "per meter", "მეტრზე", "за метр", p, mx),
  linmeter: (p: number, mx?: number) =>
    u(
      "per_linear_meter",
      "linear_meter",
      "per linear meter",
      "გრძ. მეტრზე",
      "за пог. метр",
      p,
      mx,
    ),
  room: (p: number, mx?: number) =>
    u("per_room", "room", "per room", "ოთახზე", "за комнату", p, mx),
  point: (p: number, mx?: number) =>
    u("per_point", "point", "per point", "წერტილზე", "за точку", p, mx),
  door: (p: number, mx?: number) =>
    u("per_door", "door", "per door", "კარზე", "за дверь", p, mx),
  frame: (p: number, mx?: number) =>
    u("per_frame", "frame", "per frame", "ჩარჩოზე", "за коробку", p, mx),
  window: (p: number, mx?: number) =>
    u("per_window", "window", "per window", "ფანჯარაზე", "за окно", p, mx),
  tree: (p: number, mx?: number) =>
    u("per_tree", "tree", "per tree", "ხეზე", "за дерево", p, mx),
  project: (p: number, mx?: number) =>
    u("per_project", "project", "per project", "პროექტზე", "за проект", p, mx),
  move: (p: number, mx?: number) =>
    u("per_move", "move", "per move", "გადაზიდვაზე", "за переезд", p, mx),
  load: (p: number, mx?: number) =>
    u("per_load", "load", "per load", "ტვირთზე", "за груз", p, mx),
  system: (p: number, mx?: number) =>
    u("per_system", "system", "per system", "სისტემაზე", "за систему", p, mx),
  camera: (p: number, mx?: number) =>
    u("per_camera", "camera", "per camera", "კამერაზე", "за камеру", p, mx),
  lock: (p: number, mx?: number) =>
    u("per_lock", "lock", "per lock", "საკეტზე", "за замок", p, mx),
  kitchen: (p: number, mx?: number) =>
    u(
      "per_kitchen",
      "kitchen",
      "per kitchen",
      "სამზარეულოზე",
      "за кухню",
      p,
      mx,
    ),
  staircase: (p: number, mx?: number) =>
    u(
      "per_staircase",
      "staircase",
      "per staircase",
      "კიბეზე",
      "за лестницу",
      p,
      mx,
    ),
  visit: (p: number, mx?: number) =>
    u("per_visit", "visit", "per visit", "ვიზიტზე", "за визит", p, mx),
  patch: (p: number, mx?: number) =>
    u("per_patch", "patch", "per patch", "ადგილზე", "за место", p, mx),
  item: (p: number, mx?: number) =>
    u("per_item", "item", "per item", "ერთეულზე", "за штуку", p, mx),
};

function svc(
  key: string,
  en: string,
  ka: string,
  ru: string,
  unitOptions: UnitOptionData[],
): Service {
  const primary = unitOptions[0];
  return {
    key,
    label: { en, ka, ru },
    unitOptions,
    basePrice: primary.defaultPrice,
    maxPrice: primary.maxPrice,
    unit: primary.unit,
    unitLabel: primary.label,
  };
}

function sub(
  key: string,
  en: string,
  ka: string,
  ru: string,
  icon: string,
  priceMin: number,
  priceMax: number,
  order: number,
  services: Service[],
): Subcategory {
  return {
    key,
    label: { en, ka, ru },
    iconName: icon,
    priceRange: { min: priceMin, max: priceMax },
    sortOrder: order,
    isActive: true,
    services,
    variants: [],
    addons: [],
    additionalServices: [],
  };
}

const CATALOG: Category[] = [
  // ─── 1. Plumber ──────────────────────────────────────────────
  {
    key: "plumber",
    label: { en: "Plumber", ka: "სანტექნიკოსი", ru: "Сантехник" },
    iconName: "Wrench",
    color: "#0EA5E9",
    minPrice: 30,
    sortOrder: 0,
    isActive: true,
    subcategories: [
      sub(
        "pipes",
        "Pipes & Leaks",
        "მილები და გაჟონვა",
        "Трубы и течи",
        "Wrench",
        30,
        200,
        0,
        [
          svc("pipe_repair", "Pipe Repair", "მილის შეკეთება", "Ремонт трубы", [
            U.job(30, 100),
            U.hour(25, 60),
          ]),
          svc(
            "pipe_replacement",
            "Pipe Replacement",
            "მილის შეცვლა",
            "Замена трубы",
            [U.meter(50, 200), U.job(80, 300)],
          ),
          svc("leak_fix", "Leak Fix", "გაჟონვის აღმოფხვრა", "Устранение течи", [
            U.job(30, 80),
            U.hour(25, 60),
          ]),
          svc(
            "drain_cleaning",
            "Drain Cleaning",
            "კანალიზაციის გაწმენდა",
            "Прочистка канализации",
            [U.job(40, 120)],
          ),
        ],
      ),
      sub(
        "bathroom_plumbing",
        "Bathroom",
        "სააბაზანო",
        "Ванная",
        "Bath",
        40,
        250,
        1,
        [
          svc(
            "toilet_install",
            "Toilet Install",
            "უნიტაზის მონტაჟი",
            "Установка унитаза",
            [U.unit(50, 120)],
          ),
          svc(
            "sink_install",
            "Sink Install",
            "ნიჟარის მონტაჟი",
            "Установка раковины",
            [U.unit(40, 100)],
          ),
          svc(
            "shower_install",
            "Shower/Bathtub Install",
            "შხაპის/აბაზანის მონტაჟი",
            "Установка душа/ванны",
            [U.unit(80, 250)],
          ),
          svc(
            "faucet_install",
            "Faucet Install/Replace",
            "ონკანის მონტაჟი/შეცვლა",
            "Установка/замена смесителя",
            [U.unit(30, 80)],
          ),
        ],
      ),
      sub(
        "water_heater",
        "Water Heater",
        "ბოილერი",
        "Водонагреватель",
        "Flame",
        60,
        300,
        2,
        [
          svc(
            "boiler_install",
            "Boiler Install",
            "ბოილერის მონტაჟი",
            "Установка бойлера",
            [U.unit(80, 200), U.job(100, 250)],
          ),
          svc(
            "boiler_repair",
            "Boiler Repair",
            "ბოილერის შეკეთება",
            "Ремонт бойлера",
            [U.unit(60, 150), U.job(60, 150)],
          ),
        ],
      ),
      sub(
        "kitchen_plumbing",
        "Kitchen Plumbing",
        "სამზარეულოს სანტექნიკა",
        "Кухонная сантехника",
        "UtensilsCrossed",
        40,
        150,
        3,
        [
          svc(
            "kitchen_sink_install",
            "Kitchen Sink Install",
            "სამზარეულოს ნიჟარის მონტაჟი",
            "Установка кухонной мойки",
            [U.unit(40, 120)],
          ),
          svc(
            "dishwasher_connect",
            "Dishwasher Connect",
            "ჭურჭლის სარეცხის შეერთება",
            "Подключение посудомойки",
            [U.unit(40, 80)],
          ),
        ],
      ),
    ],
  },

  // ─── 2. Electrician ──────────────────────────────────────────
  {
    key: "electrician",
    label: { en: "Electrician", ka: "ელექტრიკოსი", ru: "Электрик" },
    iconName: "Zap",
    color: "#F59E0B",
    minPrice: 25,
    sortOrder: 1,
    isActive: true,
    subcategories: [
      sub(
        "wiring",
        "Wiring & Outlets",
        "გაყვანილობა",
        "Проводка",
        "Zap",
        25,
        200,
        0,
        [
          svc(
            "outlet_install",
            "Outlet Install",
            "როზეტის მონტაჟი",
            "Установка розетки",
            [U.point(25, 60)],
          ),
          svc(
            "switch_install",
            "Switch Install",
            "გამრთველის მონტაჟი",
            "Установка выключателя",
            [U.point(25, 50)],
          ),
          svc(
            "rewiring",
            "Rewiring",
            "გაყვანილობის შეცვლა",
            "Замена проводки",
            [U.room(80, 200), U.meter(5, 15)],
          ),
          svc(
            "breaker_install",
            "Panel/Breaker Install",
            "ავტომატის/ფარის მონტაჟი",
            "Установка щитка/автомата",
            [U.unit(50, 150)],
          ),
        ],
      ),
      sub(
        "lighting",
        "Lighting",
        "განათება",
        "Освещение",
        "Lightbulb",
        30,
        150,
        1,
        [
          svc(
            "chandelier_install",
            "Chandelier Install",
            "ჭაღის მონტაჟი",
            "Установка люстры",
            [U.unit(30, 80), U.point(30, 80)],
          ),
          svc(
            "spot_light_install",
            "Spot Light Install",
            "ჩაშვებული განათება",
            "Установка точечного света",
            [U.unit(20, 40), U.point(20, 40)],
          ),
          svc(
            "led_strip",
            "LED Strip Install",
            "LED ლენტის მონტაჟი",
            "Установка LED ленты",
            [U.meter(30, 100)],
          ),
        ],
      ),
      sub(
        "electrical_diagnostics",
        "Diagnostics",
        "დიაგნოსტიკა",
        "Диагностика",
        "Search",
        30,
        80,
        2,
        [
          svc(
            "electrical_diagnosis",
            "Electrical Diagnostics",
            "ელ. დიაგნოსტიკა",
            "Электродиагностика",
            [U.job(30, 80), U.hour(25, 50)],
          ),
          svc("grounding", "Grounding", "მიწოდება", "Заземление", [
            U.job(50, 150),
          ]),
        ],
      ),
    ],
  },

  // ─── 3. Carpenter ────────────────────────────────────────────
  {
    key: "carpenter",
    label: { en: "Carpenter", ka: "ხურო / დურგალი", ru: "Плотник" },
    iconName: "Hammer",
    color: "#92400E",
    minPrice: 40,
    sortOrder: 2,
    isActive: true,
    subcategories: [
      sub("door_work", "Doors", "კარები", "Двери", "DoorOpen", 40, 300, 0, [
        svc(
          "door_install",
          "Door Install",
          "კარის მონტაჟი",
          "Установка двери",
          [U.door(80, 250)],
        ),
        svc("door_repair", "Door Repair", "კარის შეკეთება", "Ремонт двери", [
          U.job(40, 100),
          U.hour(25, 50),
        ]),
        svc(
          "door_frame",
          "Door Frame Install",
          "კარის ჩარჩოს მონტაჟი",
          "Установка дверной коробки",
          [U.frame(60, 150)],
        ),
      ]),
      sub(
        "furniture_work",
        "Furniture",
        "ავეჯი",
        "Мебель",
        "Sofa",
        50,
        500,
        1,
        [
          svc(
            "custom_furniture",
            "Custom Furniture",
            "ავეჯის დამზადება",
            "Мебель на заказ",
            [U.piece(200, 2000), U.project(500, 5000)],
          ),
          svc(
            "furniture_repair",
            "Furniture Repair",
            "ავეჯის შეკეთება",
            "Ремонт мебели",
            [U.job(50, 200), U.hour(25, 60)],
          ),
          svc(
            "furniture_assembly",
            "Furniture Assembly",
            "ავეჯის აწყობა",
            "Сборка мебели",
            [U.piece(40, 150), U.hour(20, 40)],
          ),
          svc(
            "kitchen_cabinet_install",
            "Kitchen Cabinet Install",
            "სამზარეულოს კარადა",
            "Установка кухонных шкафов",
            [U.kitchen(100, 500), U.meter(40, 120)],
          ),
        ],
      ),
      sub(
        "wood_flooring",
        "Wood Flooring",
        "ხის იატაკი",
        "Деревянный пол",
        "TreeDeciduous",
        60,
        300,
        2,
        [
          svc(
            "parquet_install",
            "Parquet Install",
            "პარკეტის დაგება",
            "Укладка паркета",
            [U.sqm(15, 40)],
          ),
          svc(
            "parquet_sanding",
            "Sanding & Varnishing",
            "ციკლი/ლაქირება",
            "Циклевка/лакировка",
            [U.sqm(10, 25)],
          ),
        ],
      ),
      sub("locks", "Locks", "საკეტები", "Замки", "Lock", 30, 150, 3, [
        svc(
          "lock_install",
          "Lock Install",
          "საკეტის მონტაჟი",
          "Установка замка",
          [U.lock(30, 80), U.job(30, 80)],
        ),
        svc("lock_replace", "Lock Replace", "საკეტის შეცვლა", "Замена замка", [
          U.lock(40, 120),
          U.job(40, 120),
        ]),
        svc("lock_repair", "Lock Repair", "საკეტის შეკეთება", "Ремонт замка", [
          U.lock(30, 80),
          U.job(30, 80),
        ]),
      ]),
    ],
  },

  // ─── 4. Handyman ─────────────────────────────────────────────
  {
    key: "handyman",
    label: { en: "Handyman", ka: "ხელოსანი", ru: "Мастер на все руки" },
    iconName: "Wrench",
    color: "#C4735B",
    minPrice: 20,
    sortOrder: 3,
    isActive: true,
    subcategories: [
      sub("mounting", "Mounting", "მონტაჟი", "Монтаж", "Hammer", 20, 80, 0, [
        svc(
          "tv_mount",
          "TV Mounting",
          "ტელევიზორის მიმაგრება",
          "Монтаж телевизора",
          [U.unit(30, 60)],
        ),
        svc(
          "shelf_mount",
          "Shelf Mounting",
          "თაროების მონტაჟი",
          "Монтаж полок",
          [U.unit(20, 50)],
        ),
        svc(
          "curtain_rod",
          "Curtain Rod Install",
          "ფარდის კარნიზი",
          "Установка карниза",
          [U.unit(25, 60)],
        ),
        svc(
          "mirror_mount",
          "Mirror Mounting",
          "სარკის მიმაგრება",
          "Монтаж зеркала",
          [U.unit(25, 60)],
        ),
      ]),
      sub(
        "minor_repairs",
        "Minor Repairs",
        "მცირე შეკეთება",
        "Мелкий ремонт",
        "Wrench",
        20,
        80,
        1,
        [
          svc(
            "drywall_patch",
            "Drywall Patch",
            "კედლის შეკეთება",
            "Заделка стены",
            [U.patch(20, 60), U.sqm(10, 30)],
          ),
          svc(
            "paint_touchup",
            "Paint Touch-up",
            "შეღებვის კორექცია",
            "Подкраска",
            [U.sqm(5, 15), U.job(20, 50)],
          ),
          svc("caulking", "Caulking/Sealing", "ჰერმეტიზაცია", "Герметизация", [
            U.meter(20, 50),
          ]),
          svc("tile_repair", "Tile Repair", "ფილის შეკეთება", "Ремонт плитки", [
            U.piece(25, 60),
            U.sqm(15, 40),
          ]),
        ],
      ),
    ],
  },

  // ─── 5. Builder ──────────────────────────────────────────────
  {
    key: "builder",
    label: { en: "Builder", ka: "მშენებელი", ru: "Строитель" },
    iconName: "HardHat",
    color: "#DC2626",
    minPrice: 50,
    sortOrder: 4,
    isActive: true,
    subcategories: [
      sub("walls", "Walls", "კედლები", "Стены", "Brick", 50, 300, 0, [
        svc("plastering", "Plastering", "კედლის მოხვნა", "Штукатурка", [
          U.sqm(8, 20),
          U.room(100, 300),
        ]),
        svc("drywall_work", "Drywall Work", "თაბაშირმუყაო", "Гипсокартон", [
          U.sqm(10, 25),
          U.room(120, 350),
        ]),
        svc("demolition", "Demolition", "დემონტაჟი", "Демонтаж", [
          U.sqm(15, 40),
          U.day(100, 250),
        ]),
      ]),
      sub(
        "waterproofing",
        "Waterproofing",
        "ჰიდროიზოლაცია",
        "Гидроизоляция",
        "Droplets",
        10,
        30,
        1,
        [
          svc(
            "bathroom_waterproof",
            "Bathroom Waterproofing",
            "სააბაზანოს ჰიდროიზოლაცია",
            "Гидроизоляция ванной",
            [U.sqm(10, 25)],
          ),
          svc(
            "balcony_waterproof",
            "Balcony Waterproofing",
            "აივნის ჰიდროიზოლაცია",
            "Гидроизоляция балкона",
            [U.sqm(10, 30)],
          ),
        ],
      ),
      sub(
        "full_renovation",
        "Full Renovation",
        "სრული რემონტი",
        "Полный ремонт",
        "Home",
        200,
        1000,
        2,
        [
          svc(
            "renovation_consultation",
            "Renovation Consultation",
            "რემონტის კონსულტაცია",
            "Консультация по ремонту",
            [U.visit(50, 150), U.hour(40, 80)],
          ),
          svc(
            "full_apartment_reno",
            "Full Apartment Renovation",
            "ბინის სრული რემონტი",
            "Полный ремонт квартиры",
            [U.sqm(150, 500)],
          ),
        ],
      ),
    ],
  },

  // ─── 6. Painter ──────────────────────────────────────────────
  {
    key: "painter",
    label: { en: "Painter", ka: "მხატვარი / მალიარი", ru: "Маляр" },
    iconName: "Paintbrush",
    color: "#8B5CF6",
    minPrice: 5,
    sortOrder: 5,
    isActive: true,
    subcategories: [
      sub(
        "painting",
        "Painting",
        "შეღებვა",
        "Покраска",
        "Paintbrush",
        5,
        20,
        0,
        [
          svc(
            "wall_painting",
            "Wall Painting",
            "კედლების შეღებვა",
            "Покраска стен",
            [U.sqm(5, 15), U.room(60, 200)],
          ),
          svc(
            "ceiling_painting",
            "Ceiling Painting",
            "ჭერის შეღებვა",
            "Покраска потолка",
            [U.sqm(5, 15), U.room(50, 180)],
          ),
          svc(
            "decorative_painting",
            "Decorative Painting",
            "დეკორატიული შეღებვა",
            "Декоративная покраска",
            [U.sqm(10, 30)],
          ),
          svc(
            "facade_painting",
            "Facade Painting",
            "ფასადის შეღებვა",
            "Покраска фасада",
            [U.sqm(8, 20), U.room(80, 250)],
          ),
        ],
      ),
      sub("wallpaper", "Wallpaper", "შპალერი", "Обои", "Layers", 5, 20, 1, [
        svc(
          "wallpaper_install",
          "Wallpaper Install",
          "შპალერის დაკვრა",
          "Поклейка обоев",
          [U.sqm(5, 15), U.room(60, 200)],
        ),
        svc(
          "wallpaper_removal",
          "Wallpaper Removal",
          "შპალერის მოხსნა",
          "Снятие обоев",
          [U.sqm(3, 8), U.room(30, 100)],
        ),
      ]),
      sub(
        "varnishing",
        "Varnishing",
        "ლაქირება",
        "Лакировка",
        "Sparkles",
        8,
        20,
        2,
        [
          svc(
            "wood_varnishing",
            "Wood Varnishing",
            "ხის ლაქირება",
            "Лакировка дерева",
            [U.sqm(8, 20)],
          ),
        ],
      ),
    ],
  },

  // ─── 7. Tiler ────────────────────────────────────────────────
  {
    key: "tiler",
    label: { en: "Tiler", ka: "მოპირკეთებელი", ru: "Плиточник" },
    iconName: "LayoutGrid",
    color: "#0891B2",
    minPrice: 10,
    sortOrder: 6,
    isActive: true,
    subcategories: [
      sub(
        "tiling",
        "Tiling",
        "ფილის დაგება",
        "Укладка плитки",
        "LayoutGrid",
        10,
        35,
        0,
        [
          svc(
            "floor_tiling",
            "Floor Tiling",
            "იატაკის ფილა",
            "Напольная плитка",
            [U.sqm(12, 30), U.linmeter(10, 25), U.piece(5, 20)],
          ),
          svc("wall_tiling", "Wall Tiling", "კედლის ფილა", "Настенная плитка", [
            U.sqm(12, 30),
            U.linmeter(10, 25),
            U.piece(5, 20),
          ]),
          svc(
            "bathroom_tiling",
            "Bathroom Tiling",
            "სააბაზანოს ფილა",
            "Плитка в ванной",
            [U.sqm(15, 35), U.linmeter(12, 28), U.piece(8, 25)],
          ),
          svc(
            "kitchen_backsplash",
            "Kitchen Backsplash",
            "სამზარეულოს ფილა",
            "Кухонный фартук",
            [U.sqm(15, 35), U.linmeter(12, 28), U.piece(8, 25)],
          ),
          svc("grouting", "Grouting", "ფუგა", "Затирка швов", [U.sqm(5, 12)]),
          svc(
            "tile_removal",
            "Tile Removal",
            "ფილის დემონტაჟი",
            "Демонтаж плитки",
            [U.sqm(5, 15)],
          ),
        ],
      ),
    ],
  },

  // ─── 8. Flooring ─────────────────────────────────────────────
  {
    key: "flooring",
    label: {
      en: "Flooring Specialist",
      ka: "იატაკის ხელოსანი",
      ru: "Специалист по полам",
    },
    iconName: "Layers",
    color: "#A16207",
    minPrice: 8,
    sortOrder: 7,
    isActive: true,
    subcategories: [
      sub(
        "floor_install",
        "Floor Install",
        "იატაკის მოწყობა",
        "Укладка полов",
        "Layers",
        8,
        40,
        0,
        [
          svc(
            "laminate_install",
            "Laminate Install",
            "ლამინატის დაგება",
            "Укладка ламината",
            [U.sqm(8, 20), U.room(80, 250)],
          ),
          svc(
            "vinyl_install",
            "Vinyl/LVT Install",
            "ვინილის დაგება",
            "Укладка винила",
            [U.sqm(10, 25), U.room(100, 300)],
          ),
          svc(
            "floor_leveling",
            "Floor Leveling/Screed",
            "იატაკის მოსწორება/სტიაჟკა",
            "Выравнивание/стяжка пола",
            [U.sqm(10, 25)],
          ),
        ],
      ),
    ],
  },

  // ─── 9. Ceiling ──────────────────────────────────────────────
  {
    key: "ceiling",
    label: {
      en: "Ceiling Specialist",
      ka: "ჭერის ხელოსანი",
      ru: "Специалист по потолкам",
    },
    iconName: "ArrowUpFromLine",
    color: "#6366F1",
    minPrice: 10,
    sortOrder: 8,
    isActive: true,
    subcategories: [
      sub(
        "ceiling_work",
        "Ceiling Work",
        "ჭერის სამუშაო",
        "Работа с потолком",
        "ArrowUpFromLine",
        10,
        40,
        0,
        [
          svc(
            "stretch_ceiling",
            "Stretch Ceiling",
            "ნატიური ჭერი",
            "Натяжной потолок",
            [U.sqm(15, 35), U.room(150, 400)],
          ),
          svc(
            "drywall_ceiling",
            "Drywall Ceiling",
            "თაბაშირმუყაოს ჭერი",
            "Потолок из гипсокартона",
            [U.sqm(15, 35), U.room(150, 400)],
          ),
          svc(
            "ceiling_molding",
            "Ceiling Molding/Trim",
            "ჭერის ბაგეტი/დეკორი",
            "Потолочный плинтус/декор",
            [U.meter(5, 15)],
          ),
        ],
      ),
    ],
  },

  // ─── 10. Metalworker ─────────────────────────────────────────
  {
    key: "metalworker",
    label: { en: "Metalworker/Welder", ka: "მჭედელი", ru: "Сварщик/Металлист" },
    iconName: "Anvil",
    color: "#57534E",
    minPrice: 50,
    sortOrder: 9,
    isActive: true,
    subcategories: [
      sub(
        "metal_work",
        "Metal Work",
        "ლითონის სამუშაო",
        "Металлоработы",
        "Anvil",
        50,
        1000,
        0,
        [
          svc(
            "metal_door",
            "Metal Door Fabrication",
            "ლითონის კარის დამზადება",
            "Изготовление металлической двери",
            [U.door(200, 800)],
          ),
          svc(
            "railing_install",
            "Railing Install",
            "მოაჯირის დამზადება/მონტაჟი",
            "Изготовление/монтаж перил",
            [U.meter(80, 300)],
          ),
          svc(
            "metal_stairs",
            "Metal Stairs",
            "ლითონის კიბე",
            "Металлическая лестница",
            [U.staircase(300, 2000)],
          ),
          svc(
            "fence_gate",
            "Fence/Gate Fabrication",
            "ღობის/ჭიშკრის დამზადება",
            "Изготовление забора/ворот",
            [U.meter(100, 1000)],
          ),
          svc("welding", "Welding", "შედუღება", "Сварка", [
            U.hour(50, 200),
            U.job(80, 300),
          ]),
        ],
      ),
    ],
  },

  // ─── 11. Roofer ──────────────────────────────────────────────
  {
    key: "roofer",
    label: { en: "Roofer", ka: "სახურავის ხელოსანი", ru: "Кровельщик" },
    iconName: "Home",
    color: "#B45309",
    minPrice: 15,
    sortOrder: 10,
    isActive: true,
    subcategories: [
      sub("roofing", "Roofing", "სახურავი", "Кровля", "Home", 15, 50, 0, [
        svc(
          "roof_install",
          "Roof Install",
          "სახურავის მონტაჟი",
          "Монтаж кровли",
          [U.sqm(20, 50)],
        ),
        svc(
          "roof_repair",
          "Roof Repair",
          "სახურავის შეკეთება",
          "Ремонт кровли",
          [U.sqm(15, 40)],
        ),
        svc(
          "gutter_install",
          "Gutter Install",
          "ღარების მონტაჟი",
          "Установка водостоков",
          [U.meter(15, 30)],
        ),
        svc(
          "roof_waterproof",
          "Roof Waterproofing",
          "სახურავის ჰიდროიზოლაცია",
          "Гидроизоляция кровли",
          [U.sqm(15, 35)],
        ),
      ]),
    ],
  },

  // ─── 12. Glass & Mirror ──────────────────────────────────────
  {
    key: "glass_mirror",
    label: {
      en: "Glass & Mirror",
      ka: "მინა და სარკე",
      ru: "Стекло и зеркала",
    },
    iconName: "SquareStack",
    color: "#06B6D4",
    minPrice: 40,
    sortOrder: 11,
    isActive: true,
    subcategories: [
      sub(
        "glass_work",
        "Glass & Mirror Work",
        "მინისა და სარკის სამუშაო",
        "Стекольные и зеркальные работы",
        "SquareStack",
        40,
        500,
        0,
        [
          svc(
            "pvc_window",
            "PVC Window Install",
            "მეტალოპლასტმასის ფანჯარა",
            "Установка ПВХ окна",
            [U.window(80, 300)],
          ),
          svc(
            "window_repair",
            "Window Repair",
            "ფანჯრის შეკეთება",
            "Ремонт окна",
            [U.window(40, 120), U.job(40, 120)],
          ),
          svc("glass_door", "Glass Door", "შუშის კარი", "Стеклянная дверь", [
            U.door(150, 500),
          ]),
          svc(
            "shower_cabin",
            "Shower Cabin Install",
            "შხაპის კაბინა",
            "Установка душевой кабины",
            [U.unit(100, 300)],
          ),
          svc(
            "custom_mirror",
            "Custom Mirror Install",
            "სარკის დამზადება/მონტაჟი",
            "Изготовление/монтаж зеркала",
            [U.unit(60, 300), U.sqm(40, 200)],
          ),
        ],
      ),
    ],
  },

  // ─── 13. HVAC ────────────────────────────────────────────────
  {
    key: "hvac",
    label: {
      en: "HVAC Specialist",
      ka: "კონდიციონერის სპეციალისტი",
      ru: "Специалист по кондиционерам",
    },
    iconName: "Snowflake",
    color: "#2563EB",
    minPrice: 50,
    sortOrder: 12,
    isActive: true,
    subcategories: [
      sub(
        "ac_services",
        "Air Conditioning",
        "კონდიციონერი",
        "Кондиционер",
        "Snowflake",
        50,
        300,
        0,
        [
          svc(
            "ac_install",
            "AC Install",
            "კონდიციონერის მონტაჟი",
            "Установка кондиционера",
            [U.unit(100, 250)],
          ),
          svc(
            "ac_repair",
            "AC Repair",
            "კონდიციონერის შეკეთება",
            "Ремонт кондиционера",
            [U.unit(50, 150)],
          ),
          svc(
            "ac_maintenance",
            "AC Maintenance/Cleaning",
            "კონდიციონერის მოვლა/წმენდა",
            "Обслуживание/чистка кондиционера",
            [U.unit(50, 100)],
          ),
        ],
      ),
      sub("heating", "Heating", "გათბობა", "Отопление", "Flame", 80, 500, 1, [
        svc(
          "radiator_install",
          "Radiator Install",
          "რადიატორის მონტაჟი",
          "Установка радиатора",
          [U.unit(60, 150)],
        ),
        svc(
          "underfloor_heating",
          "Underfloor Heating",
          "იატაკის გათბობა",
          "Теплый пол",
          [U.sqm(20, 45)],
        ),
        svc(
          "heating_boiler",
          "Heating Boiler Install",
          "გათბობის ქვაბის მონტაჟი",
          "Установка котла отопления",
          [U.unit(150, 500)],
        ),
      ]),
      sub(
        "ventilation",
        "Ventilation",
        "ვენტილაცია",
        "Вентиляция",
        "Wind",
        60,
        200,
        2,
        [
          svc(
            "vent_install",
            "Ventilation Install",
            "ვენტილაციის მონტაჟი",
            "Установка вентиляции",
            [U.unit(60, 200)],
          ),
          svc(
            "hood_install",
            "Range Hood Install",
            "გამწოვის მონტაჟი",
            "Установка вытяжки",
            [U.unit(40, 100)],
          ),
        ],
      ),
    ],
  },

  // ─── 14. Security/Systems ────────────────────────────────────
  {
    key: "systems",
    label: {
      en: "Security & Systems",
      ka: "სისტემების სპეციალისტი",
      ru: "Системы безопасности",
    },
    iconName: "Shield",
    color: "#059669",
    minPrice: 40,
    sortOrder: 13,
    isActive: true,
    subcategories: [
      sub(
        "security_systems",
        "Security & Tech",
        "უსაფრთხოება და ტექნიკა",
        "Безопасность и техника",
        "Shield",
        40,
        300,
        0,
        [
          svc(
            "camera_install",
            "Security Camera Install",
            "კამერების მონტაჟი",
            "Установка камер",
            [U.camera(50, 200)],
          ),
          svc(
            "intercom_install",
            "Intercom Install",
            "დომოფონის მონტაჟი",
            "Установка домофона",
            [U.unit(50, 150)],
          ),
          svc(
            "alarm_install",
            "Alarm System Install",
            "სიგნალიზაციის მონტაჟი",
            "Установка сигнализации",
            [U.system(80, 300)],
          ),
          svc(
            "satellite_antenna",
            "Satellite/Antenna Install",
            "ანტენის მონტაჟი",
            "Установка антенны",
            [U.unit(40, 100)],
          ),
        ],
      ),
    ],
  },

  // ─── 15. Cleaner ─────────────────────────────────────────────
  {
    key: "cleaner",
    label: { en: "Cleaner", ka: "დამლაგებელი", ru: "Уборщик" },
    iconName: "SprayCan",
    color: "#3B82F6",
    minPrice: 30,
    sortOrder: 14,
    isActive: true,
    subcategories: [
      sub(
        "home_cleaning",
        "Home Cleaning",
        "სახლის დალაგება",
        "Уборка дома",
        "SprayCan",
        30,
        200,
        0,
        [
          svc(
            "standard_cleaning",
            "Standard Cleaning",
            "სტანდარტული დალაგება",
            "Стандартная уборка",
            [U.room(30, 80), U.sqm(3, 8), U.hour(20, 40)],
          ),
          svc(
            "deep_cleaning",
            "Deep Cleaning",
            "გენერალური დალაგება",
            "Генеральная уборка",
            [U.room(50, 200), U.sqm(5, 15), U.hour(25, 50)],
          ),
          svc(
            "post_reno_cleaning",
            "Post-Renovation Cleaning",
            "სარემონტო დალაგება",
            "Уборка после ремонта",
            [U.room(80, 300), U.sqm(8, 20), U.hour(30, 60)],
          ),
          svc(
            "window_cleaning",
            "Window Cleaning",
            "ფანჯრების წმენდა",
            "Мытье окон",
            [U.window(10, 25)],
          ),
        ],
      ),
      sub(
        "special_cleaning",
        "Special Cleaning",
        "სპეციალური წმენდა",
        "Специальная чистка",
        "Sparkles",
        40,
        150,
        1,
        [
          svc(
            "upholstery_cleaning",
            "Upholstery Cleaning",
            "ავეჯის ქიმწმენდა",
            "Химчистка мебели",
            [U.piece(40, 120)],
          ),
          svc(
            "carpet_cleaning",
            "Carpet Cleaning",
            "ხალიჩის წმენდა",
            "Чистка ковров",
            [U.sqm(5, 15)],
          ),
          svc(
            "rental_cleaning",
            "Rental/Airbnb Cleaning",
            "საიჯარო დალაგება",
            "Уборка для аренды",
            [U.room(40, 100)],
          ),
        ],
      ),
    ],
  },

  // ─── 16. Gardener ────────────────────────────────────────────
  {
    key: "gardener",
    label: { en: "Gardener", ka: "მებაღე", ru: "Садовник" },
    iconName: "TreeDeciduous",
    color: "#16A34A",
    minPrice: 30,
    sortOrder: 15,
    isActive: true,
    subcategories: [
      sub(
        "garden_work",
        "Garden Work",
        "ბაღის სამუშაო",
        "Садовые работы",
        "TreeDeciduous",
        30,
        300,
        0,
        [
          svc(
            "garden_maintenance",
            "Garden Maintenance",
            "ბაღის მოვლა",
            "Обслуживание сада",
            [U.hour(30, 100), U.sqm(3, 10)],
          ),
          svc(
            "tree_trimming",
            "Tree Trimming/Cutting",
            "ხეების გასხვლა/ჭრა",
            "Обрезка/спил деревьев",
            [U.tree(50, 300), U.hour(30, 80)],
          ),
          svc(
            "landscaping",
            "Landscaping",
            "გამწვანება/ლანდშაფტი",
            "Ландшафтный дизайн",
            [U.sqm(50, 200)],
          ),
          svc(
            "irrigation",
            "Irrigation System",
            "სარწყავი სისტემა",
            "Система полива",
            [U.system(80, 300)],
          ),
          svc("lawn_care", "Lawn Care", "გაზონის მოვლა", "Уход за газоном", [
            U.hour(30, 80),
            U.sqm(2, 8),
          ]),
        ],
      ),
    ],
  },

  // ─── 17. Stone/Marble ────────────────────────────────────────
  {
    key: "stone_worker",
    label: {
      en: "Stone/Marble Worker",
      ka: "ქვის ხელოსანი",
      ru: "Каменщик/Мраморщик",
    },
    iconName: "Mountain",
    color: "#78716C",
    minPrice: 30,
    sortOrder: 16,
    isActive: true,
    subcategories: [
      sub(
        "stone_work",
        "Stone & Marble Work",
        "ქვის სამუშაო",
        "Работа с камнем",
        "Mountain",
        30,
        500,
        0,
        [
          svc(
            "marble_install",
            "Marble Install",
            "მარმარილოს დაგება",
            "Укладка мрамора",
            [U.sqm(30, 80)],
          ),
          svc(
            "granite_countertop",
            "Granite Countertop",
            "გრანიტის ზედაპირი",
            "Гранитная столешница",
            [U.linmeter(100, 400)],
          ),
          svc("stone_facade", "Stone Facade", "ქვის ფასადი", "Каменный фасад", [
            U.sqm(40, 120),
          ]),
          svc(
            "stone_restoration",
            "Stone Restoration",
            "ქვის რესტავრაცია",
            "Реставрация камня",
            [U.sqm(50, 200)],
          ),
        ],
      ),
    ],
  },

  // ─── 18. IT Specialist ───────────────────────────────────────
  {
    key: "it_specialist",
    label: { en: "IT Specialist", ka: "IT სპეციალისტი", ru: "IT специалист" },
    iconName: "Monitor",
    color: "#2563EB",
    minPrice: 30,
    sortOrder: 17,
    isActive: true,
    subcategories: [
      sub(
        "computer_services",
        "Computer Services",
        "კომპიუტერის სერვისი",
        "Компьютерный сервис",
        "Monitor",
        30,
        150,
        0,
        [
          svc("pc_setup", "PC Setup", "კომპიუტერის აწყობა", "Настройка ПК", [
            U.job(40, 100),
            U.hour(25, 50),
          ]),
          svc("pc_repair", "PC Repair", "კომპიუტერის შეკეთება", "Ремонт ПК", [
            U.job(30, 120),
            U.hour(25, 50),
          ]),
          svc("os_install", "OS Install", "სისტემის დაყენება", "Установка ОС", [
            U.job(30, 60),
            U.hour(25, 40),
          ]),
          svc(
            "data_recovery",
            "Data Recovery",
            "მონაცემების აღდგენა",
            "Восстановление данных",
            [U.job(50, 200)],
          ),
        ],
      ),
      sub(
        "network_services",
        "Network & Internet",
        "ქსელი და ინტერნეტი",
        "Сеть и интернет",
        "Wifi",
        30,
        100,
        1,
        [
          svc(
            "wifi_setup",
            "WiFi Setup",
            "WiFi-ის დაყენება",
            "Настройка WiFi",
            [U.job(30, 60), U.hour(25, 40)],
          ),
          svc(
            "network_wiring",
            "Network Wiring",
            "ქსელის გაყვანა",
            "Прокладка сети",
            [U.job(40, 100), U.hour(25, 50)],
          ),
          svc(
            "printer_setup",
            "Printer Setup",
            "პრინტერის დაყენება",
            "Настройка принтера",
            [U.job(30, 50), U.hour(25, 40)],
          ),
        ],
      ),
    ],
  },

  // ─── 19. Architect ───────────────────────────────────────────
  {
    key: "architect",
    label: { en: "Architect", ka: "არქიტექტორი", ru: "Архитектор" },
    iconName: "Building",
    color: "#1E3A5F",
    minPrice: 200,
    sortOrder: 18,
    isActive: true,
    subcategories: [
      sub(
        "architecture",
        "Architecture",
        "არქიტექტურა",
        "Архитектура",
        "Building",
        200,
        5000,
        0,
        [
          svc(
            "residential_project",
            "Residential Project",
            "საცხოვრებელი პროექტი",
            "Жилой проект",
            [U.project(500, 5000)],
          ),
          svc(
            "commercial_project",
            "Commercial Project",
            "კომერციული პროექტი",
            "Коммерческий проект",
            [U.project(1000, 10000)],
          ),
          svc(
            "permit_docs",
            "Permit Documentation",
            "ნებართვის დოკუმენტაცია",
            "Документация на разрешение",
            [U.project(200, 1000)],
          ),
          svc(
            "technical_supervision",
            "Technical Supervision",
            "ტექნიკური ზედამხედველობა",
            "Технический надзор",
            [U.project(300, 2000)],
          ),
          svc(
            "arch_3d_viz",
            "3D Visualization",
            "3D ვიზუალიზაცია",
            "3D визуализация",
            [U.project(200, 1000)],
          ),
        ],
      ),
    ],
  },

  // ─── 20. Interior Designer ───────────────────────────────────
  {
    key: "designer",
    label: {
      en: "Interior Designer",
      ka: "დიზაინერი",
      ru: "Дизайнер интерьера",
    },
    iconName: "Palette",
    color: "#DB2777",
    minPrice: 150,
    sortOrder: 19,
    isActive: true,
    subcategories: [
      sub(
        "interior_design",
        "Interior Design",
        "ინტერიერის დიზაინი",
        "Дизайн интерьера",
        "Palette",
        150,
        5000,
        0,
        [
          svc(
            "apartment_design",
            "Apartment Design",
            "ბინის დიზაინი",
            "Дизайн квартиры",
            [U.project(500, 5000)],
          ),
          svc(
            "office_design",
            "Office Design",
            "ოფისის დიზაინი",
            "Дизайн офиса",
            [U.project(500, 5000)],
          ),
          svc(
            "kitchen_design",
            "Kitchen Design",
            "სამზარეულოს დიზაინი",
            "Дизайн кухни",
            [U.project(200, 1500)],
          ),
          svc(
            "bathroom_design",
            "Bathroom Design",
            "სააბაზანოს დიზაინი",
            "Дизайн ванной",
            [U.project(150, 1000)],
          ),
          svc(
            "furniture_selection",
            "Furniture Selection",
            "ავეჯის შერჩევა",
            "Подбор мебели",
            [U.project(150, 500)],
          ),
          svc(
            "design_3d_viz",
            "3D Rendering",
            "3D ვიზუალიზაცია",
            "3D визуализация",
            [U.project(200, 1000)],
          ),
          svc(
            "design_supervision",
            "Design Supervision",
            "ავტორის ზედამხედველობა",
            "Авторский надзор",
            [U.project(300, 2000)],
          ),
        ],
      ),
    ],
  },

  // ─── 21. Mover ───────────────────────────────────────────────
  {
    key: "mover",
    label: { en: "Mover", ka: "გადამზიდავი", ru: "Грузчик/Перевозчик" },
    iconName: "Truck",
    color: "#D97706",
    minPrice: 50,
    sortOrder: 20,
    isActive: true,
    subcategories: [
      sub(
        "moving",
        "Moving & Delivery",
        "გადაზიდვა და მიტანა",
        "Переезд и доставка",
        "Truck",
        50,
        500,
        0,
        [
          svc(
            "apartment_moving",
            "Apartment Moving",
            "ბინის გადაზიდვა",
            "Переезд квартиры",
            [U.move(100, 500), U.hour(30, 80)],
          ),
          svc(
            "furniture_delivery",
            "Furniture Delivery",
            "ავეჯის გადაზიდვა",
            "Доставка мебели",
            [U.item(50, 200), U.hour(25, 60)],
          ),
          svc(
            "material_delivery",
            "Construction Material Delivery",
            "მასალის მიტანა",
            "Доставка стройматериалов",
            [U.load(50, 200)],
          ),
          svc(
            "debris_removal",
            "Debris/Waste Removal",
            "ნაგვის გატანა",
            "Вывоз мусора",
            [U.load(50, 150)],
          ),
          svc("packing_service", "Packing Service", "შეფუთვა", "Упаковка", [
            U.move(50, 150),
            U.hour(20, 50),
          ]),
        ],
      ),
    ],
  },
];

export function buildSeedDataV2(): Category[] {
  return CATALOG;
}

export { buildSeedDataV2 as buildSeedData };
