/**
 * Service Catalog V2 — Trade-based professional categories
 * 21 professional types with ~100 services
 *
 * Usage: import { buildSeedDataV2 } from './seed-catalog-v2';
 */

interface Label { en: string; ka: string; ru: string }
interface Service {
  key: string;
  label: Label;
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

function svc(key: string, en: string, ka: string, ru: string, basePrice: number, maxPrice: number, unit: string, unitEn: string, unitKa: string, unitRu: string): Service {
  return {
    key,
    label: { en, ka, ru },
    basePrice,
    maxPrice,
    unit,
    unitLabel: { en: unitEn, ka: unitKa, ru: unitRu },
  };
}

function sub(key: string, en: string, ka: string, ru: string, icon: string, priceMin: number, priceMax: number, order: number, services: Service[]): Subcategory {
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
    key: 'plumber', label: { en: 'Plumber', ka: 'სანტექნიკოსი', ru: 'Сантехник' },
    iconName: 'Wrench', color: '#0EA5E9', minPrice: 30, sortOrder: 0, isActive: true,
    subcategories: [
      sub('pipes', 'Pipes & Leaks', 'მილები და გაჟონვა', 'Трубы и течи', 'Wrench', 30, 200, 0, [
        svc('pipe_repair', 'Pipe Repair', 'მილის შეკეთება', 'Ремонт трубы', 30, 100, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('pipe_replacement', 'Pipe Replacement', 'მილის შეცვლა', 'Замена трубы', 50, 200, 'meter', 'per meter', 'მეტრი', 'за метр'),
        svc('leak_fix', 'Leak Fix', 'გაჟონვის აღმოფხვრა', 'Устранение течи', 30, 80, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('drain_cleaning', 'Drain Cleaning', 'კანალიზაციის გაწმენდა', 'Прочистка канализации', 40, 120, 'piece', 'per job', 'სამუშაო', 'за работу'),
      ]),
      sub('bathroom_plumbing', 'Bathroom', 'სააბაზანო', 'Ванная', 'Bath', 40, 250, 1, [
        svc('toilet_install', 'Toilet Install', 'უნიტაზის მონტაჟი', 'Установка унитаза', 50, 120, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('sink_install', 'Sink Install', 'ნიჟარის მონტაჟი', 'Установка раковины', 40, 100, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('shower_install', 'Shower/Bathtub Install', 'შხაპის/აბაზანის მონტაჟი', 'Установка душа/ванны', 80, 250, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('faucet_install', 'Faucet Install/Replace', 'ონკანის მონტაჟი/შეცვლა', 'Установка/замена смесителя', 30, 80, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
      sub('water_heater', 'Water Heater', 'ბოილერი', 'Водонагреватель', 'Flame', 60, 300, 2, [
        svc('boiler_install', 'Boiler Install', 'ბოილერის მონტაჟი', 'Установка бойлера', 80, 200, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('boiler_repair', 'Boiler Repair', 'ბოილერის შეკეთება', 'Ремонт бойлера', 60, 150, 'piece', 'per job', 'სამუშაო', 'за работу'),
      ]),
      sub('kitchen_plumbing', 'Kitchen Plumbing', 'სამზარეულოს სანტექნიკა', 'Кухонная сантехника', 'UtensilsCrossed', 40, 150, 3, [
        svc('kitchen_sink_install', 'Kitchen Sink Install', 'სამზარეულოს ნიჟარის მონტაჟი', 'Установка кухонной мойки', 40, 120, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('dishwasher_connect', 'Dishwasher Connect', 'ჭურჭლის სარეცხის შეერთება', 'Подключение посудомойки', 40, 80, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
    ],
  },

  // ─── 2. Electrician ──────────────────────────────────────────
  {
    key: 'electrician', label: { en: 'Electrician', ka: 'ელექტრიკოსი', ru: 'Электрик' },
    iconName: 'Zap', color: '#F59E0B', minPrice: 25, sortOrder: 1, isActive: true,
    subcategories: [
      sub('wiring', 'Wiring & Outlets', 'გაყვანილობა', 'Проводка', 'Zap', 25, 200, 0, [
        svc('outlet_install', 'Outlet Install', 'როზეტის მონტაჟი', 'Установка розетки', 25, 60, 'point', 'per point', 'წერტილი', 'за точку'),
        svc('switch_install', 'Switch Install', 'გამრთველის მონტაჟი', 'Установка выключателя', 25, 50, 'point', 'per point', 'წერტილი', 'за точку'),
        svc('rewiring', 'Rewiring', 'გაყვანილობის შეცვლა', 'Замена проводки', 80, 200, 'room', 'per room', 'ოთახი', 'за комнату'),
        svc('breaker_install', 'Panel/Breaker Install', 'ავტომატის/ფარის მონტაჟი', 'Установка щитка/автомата', 50, 150, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
      sub('lighting', 'Lighting', 'განათება', 'Освещение', 'Lightbulb', 30, 150, 1, [
        svc('chandelier_install', 'Chandelier Install', 'ჭაღის მონტაჟი', 'Установка люстры', 30, 80, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('spot_light_install', 'Spot Light Install', 'ჩაშვებული განათება', 'Установка точечного света', 20, 40, 'point', 'per point', 'წერტილი', 'за точку'),
        svc('led_strip', 'LED Strip Install', 'LED ლენტის მონტაჟი', 'Установка LED ленты', 30, 100, 'meter', 'per meter', 'მეტრი', 'за метр'),
      ]),
      sub('electrical_diagnostics', 'Diagnostics', 'დიაგნოსტიკა', 'Диагностика', 'Search', 30, 80, 2, [
        svc('electrical_diagnosis', 'Electrical Diagnostics', 'ელ. დიაგნოსტიკა', 'Электродиагностика', 30, 80, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('grounding', 'Grounding', 'მიწოდება', 'Заземление', 50, 150, 'piece', 'per job', 'სამუშაო', 'за работу'),
      ]),
    ],
  },

  // ─── 3. Carpenter ────────────────────────────────────────────
  {
    key: 'carpenter', label: { en: 'Carpenter', ka: 'ხურო / დურგალი', ru: 'Плотник' },
    iconName: 'Hammer', color: '#92400E', minPrice: 40, sortOrder: 2, isActive: true,
    subcategories: [
      sub('door_work', 'Doors', 'კარები', 'Двери', 'DoorOpen', 40, 300, 0, [
        svc('door_install', 'Door Install', 'კარის მონტაჟი', 'Установка двери', 80, 250, 'piece', 'per door', 'კარი', 'за дверь'),
        svc('door_repair', 'Door Repair', 'კარის შეკეთება', 'Ремонт двери', 40, 100, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('door_frame', 'Door Frame Install', 'კარის ჩარჩოს მონტაჟი', 'Установка дверной коробки', 60, 150, 'piece', 'per frame', 'ჩარჩო', 'за коробку'),
      ]),
      sub('furniture_work', 'Furniture', 'ავეჯი', 'Мебель', 'Sofa', 50, 500, 1, [
        svc('custom_furniture', 'Custom Furniture', 'ავეჯის დამზადება', 'Мебель на заказ', 200, 2000, 'piece', 'per item', 'ერთეული', 'за штуку'),
        svc('furniture_repair', 'Furniture Repair', 'ავეჯის შეკეთება', 'Ремонт мебели', 50, 200, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('furniture_assembly', 'Furniture Assembly', 'ავეჯის აწყობა', 'Сборка мебели', 40, 150, 'piece', 'per item', 'ერთეული', 'за штуку'),
        svc('kitchen_cabinet_install', 'Kitchen Cabinet Install', 'სამზარეულოს კარადა', 'Установка кухонных шкафов', 100, 500, 'piece', 'per kitchen', 'სამზარეულო', 'за кухню'),
      ]),
      sub('wood_flooring', 'Wood Flooring', 'ხის იატაკი', 'Деревянный пол', 'TreeDeciduous', 60, 300, 2, [
        svc('parquet_install', 'Parquet Install', 'პარკეტის დაგება', 'Укладка паркета', 15, 40, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('parquet_sanding', 'Sanding & Varnishing', 'ციკლი/ლაქირება', 'Циклевка/лакировка', 10, 25, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
      sub('locks', 'Locks', 'საკეტები', 'Замки', 'Lock', 30, 150, 3, [
        svc('lock_install', 'Lock Install', 'საკეტის მონტაჟი', 'Установка замка', 30, 80, 'piece', 'per lock', 'საკეტი', 'за замок'),
        svc('lock_replace', 'Lock Replace', 'საკეტის შეცვლა', 'Замена замка', 40, 120, 'piece', 'per lock', 'საკეტი', 'за замок'),
        svc('lock_repair', 'Lock Repair', 'საკეტის შეკეთება', 'Ремонт замка', 30, 80, 'piece', 'per job', 'სამუშაო', 'за работу'),
      ]),
    ],
  },

  // ─── 4. Handyman ─────────────────────────────────────────────
  {
    key: 'handyman', label: { en: 'Handyman', ka: 'ხელოსანი', ru: 'Мастер на все руки' },
    iconName: 'Wrench', color: '#C4735B', minPrice: 20, sortOrder: 3, isActive: true,
    subcategories: [
      sub('mounting', 'Mounting', 'მონტაჟი', 'Монтаж', 'Hammer', 20, 80, 0, [
        svc('tv_mount', 'TV Mounting', 'ტელევიზორის მიმაგრება', 'Монтаж телевизора', 30, 60, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('shelf_mount', 'Shelf Mounting', 'თაროების მონტაჟი', 'Монтаж полок', 20, 50, 'piece', 'per shelf', 'თარო', 'за полку'),
        svc('curtain_rod', 'Curtain Rod Install', 'ფარდის კარნიზი', 'Установка карниза', 25, 60, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('mirror_mount', 'Mirror Mounting', 'სარკის მიმაგრება', 'Монтаж зеркала', 25, 60, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
      sub('minor_repairs', 'Minor Repairs', 'მცირე შეკეთება', 'Мелкий ремонт', 'Wrench', 20, 80, 1, [
        svc('drywall_patch', 'Drywall Patch', 'კედლის შეკეთება', 'Заделка стены', 20, 60, 'piece', 'per patch', 'ადგილი', 'за место'),
        svc('paint_touchup', 'Paint Touch-up', 'შეღებვის კორექცია', 'Подкраска', 20, 50, 'piece', 'per area', 'ადგილი', 'за место'),
        svc('caulking', 'Caulking/Sealing', 'ჰერმეტიზაცია', 'Герметизация', 20, 50, 'meter', 'per meter', 'მეტრი', 'за метр'),
        svc('tile_repair', 'Tile Repair', 'ფილის შეკეთება', 'Ремонт плитки', 25, 60, 'piece', 'per tile', 'ფილა', 'за плитку'),
      ]),
    ],
  },

  // ─── 5. Builder ──────────────────────────────────────────────
  {
    key: 'builder', label: { en: 'Builder', ka: 'მშენებელი', ru: 'Строитель' },
    iconName: 'HardHat', color: '#DC2626', minPrice: 50, sortOrder: 4, isActive: true,
    subcategories: [
      sub('walls', 'Walls', 'კედლები', 'Стены', 'Brick', 50, 300, 0, [
        svc('plastering', 'Plastering', 'კედლის მოხვნა', 'Штукатурка', 8, 20, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('drywall_work', 'Drywall Work', 'თაბაშირმუყაო', 'Гипсокартон', 10, 25, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('demolition', 'Demolition', 'დემონტაჟი', 'Демонтаж', 15, 40, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
      sub('waterproofing', 'Waterproofing', 'ჰიდროიზოლაცია', 'Гидроизоляция', 'Droplets', 10, 30, 1, [
        svc('bathroom_waterproof', 'Bathroom Waterproofing', 'სააბაზანოს ჰიდროიზოლაცია', 'Гидроизоляция ванной', 10, 25, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('balcony_waterproof', 'Balcony Waterproofing', 'აივნის ჰიდროიზოლაცია', 'Гидроизоляция балкона', 10, 30, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
      sub('full_renovation', 'Full Renovation', 'სრული რემონტი', 'Полный ремонт', 'Home', 200, 1000, 2, [
        svc('renovation_consultation', 'Renovation Consultation', 'რემონტის კონსულტაცია', 'Консультация по ремонту', 50, 150, 'piece', 'per visit', 'ვიზიტი', 'за визит'),
        svc('full_apartment_reno', 'Full Apartment Renovation', 'ბინის სრული რემონტი', 'Полный ремонт квартиры', 150, 500, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
    ],
  },

  // ─── 6. Painter ──────────────────────────────────────────────
  {
    key: 'painter', label: { en: 'Painter', ka: 'მხატვარი / მალიარი', ru: 'Маляр' },
    iconName: 'Paintbrush', color: '#8B5CF6', minPrice: 5, sortOrder: 5, isActive: true,
    subcategories: [
      sub('painting', 'Painting', 'შეღებვა', 'Покраска', 'Paintbrush', 5, 20, 0, [
        svc('wall_painting', 'Wall Painting', 'კედლების შეღებვა', 'Покраска стен', 5, 15, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('ceiling_painting', 'Ceiling Painting', 'ჭერის შეღებვა', 'Покраска потолка', 5, 15, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('decorative_painting', 'Decorative Painting', 'დეკორატიული შეღებვა', 'Декоративная покраска', 10, 30, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('facade_painting', 'Facade Painting', 'ფასადის შეღებვა', 'Покраска фасада', 8, 20, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
      sub('wallpaper', 'Wallpaper', 'შპალერი', 'Обои', 'Layers', 5, 20, 1, [
        svc('wallpaper_install', 'Wallpaper Install', 'შპალერის დაკვრა', 'Поклейка обоев', 5, 15, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('wallpaper_removal', 'Wallpaper Removal', 'შპალერის მოხსნა', 'Снятие обоев', 3, 8, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
      sub('varnishing', 'Varnishing', 'ლაქირება', 'Лакировка', 'Sparkles', 8, 20, 2, [
        svc('wood_varnishing', 'Wood Varnishing', 'ხის ლაქირება', 'Лакировка дерева', 8, 20, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
    ],
  },

  // ─── 7. Tiler ────────────────────────────────────────────────
  {
    key: 'tiler', label: { en: 'Tiler', ka: 'მოპირკეთებელი', ru: 'Плиточник' },
    iconName: 'LayoutGrid', color: '#0891B2', minPrice: 10, sortOrder: 6, isActive: true,
    subcategories: [
      sub('tiling', 'Tiling', 'ფილის დაგება', 'Укладка плитки', 'LayoutGrid', 10, 35, 0, [
        svc('floor_tiling', 'Floor Tiling', 'იატაკის ფილა', 'Напольная плитка', 12, 30, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('wall_tiling', 'Wall Tiling', 'კედლის ფილა', 'Настенная плитка', 12, 30, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('bathroom_tiling', 'Bathroom Tiling', 'სააბაზანოს ფილა', 'Плитка в ванной', 15, 35, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('kitchen_backsplash', 'Kitchen Backsplash', 'სამზარეულოს ფილა', 'Кухонный фартук', 15, 35, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('grouting', 'Grouting', 'ფუგა', 'Затирка швов', 5, 12, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('tile_removal', 'Tile Removal', 'ფილის დემონტაჟი', 'Демонтаж плитки', 5, 15, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
    ],
  },

  // ─── 8. Flooring ─────────────────────────────────────────────
  {
    key: 'flooring', label: { en: 'Flooring Specialist', ka: 'იატაკის ხელოსანი', ru: 'Специалист по полам' },
    iconName: 'Layers', color: '#A16207', minPrice: 8, sortOrder: 7, isActive: true,
    subcategories: [
      sub('floor_install', 'Floor Install', 'იატაკის მოწყობა', 'Укладка полов', 'Layers', 8, 40, 0, [
        svc('laminate_install', 'Laminate Install', 'ლამინატის დაგება', 'Укладка ламината', 8, 20, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('vinyl_install', 'Vinyl/LVT Install', 'ვინილის დაგება', 'Укладка винила', 10, 25, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('floor_leveling', 'Floor Leveling/Screed', 'იატაკის მოსწორება/სტიაჟკა', 'Выравнивание/стяжка пола', 10, 25, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
    ],
  },

  // ─── 9. Ceiling ──────────────────────────────────────────────
  {
    key: 'ceiling', label: { en: 'Ceiling Specialist', ka: 'ჭერის ხელოსანი', ru: 'Специалист по потолкам' },
    iconName: 'ArrowUpFromLine', color: '#6366F1', minPrice: 10, sortOrder: 8, isActive: true,
    subcategories: [
      sub('ceiling_work', 'Ceiling Work', 'ჭერის სამუშაო', 'Работа с потолком', 'ArrowUpFromLine', 10, 40, 0, [
        svc('stretch_ceiling', 'Stretch Ceiling', 'ნატიური ჭერი', 'Натяжной потолок', 15, 35, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('drywall_ceiling', 'Drywall Ceiling', 'თაბაშირმუყაოს ჭერი', 'Потолок из гипсокартона', 15, 35, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('ceiling_molding', 'Ceiling Molding/Trim', 'ჭერის ბაგეტი/დეკორი', 'Потолочный плинтус/декор', 5, 15, 'meter', 'per meter', 'მეტრი', 'за метр'),
      ]),
    ],
  },

  // ─── 10. Metalworker ─────────────────────────────────────────
  {
    key: 'metalworker', label: { en: 'Metalworker/Welder', ka: 'მჭედელი', ru: 'Сварщик/Металлист' },
    iconName: 'Anvil', color: '#57534E', minPrice: 50, sortOrder: 9, isActive: true,
    subcategories: [
      sub('metal_work', 'Metal Work', 'ლითონის სამუშაო', 'Металлоработы', 'Anvil', 50, 1000, 0, [
        svc('metal_door', 'Metal Door Fabrication', 'ლითონის კარის დამზადება', 'Изготовление металлической двери', 200, 800, 'piece', 'per door', 'კარი', 'за дверь'),
        svc('railing_install', 'Railing Install', 'მოაჯირის დამზადება/მონტაჟი', 'Изготовление/монтаж перил', 80, 300, 'meter', 'per meter', 'მეტრი', 'за метр'),
        svc('metal_stairs', 'Metal Stairs', 'ლითონის კიბე', 'Металлическая лестница', 300, 2000, 'piece', 'per staircase', 'კიბე', 'за лестницу'),
        svc('fence_gate', 'Fence/Gate Fabrication', 'ღობის/ჭიშკრის დამზადება', 'Изготовление забора/ворот', 100, 1000, 'meter', 'per meter', 'მეტრი', 'за метр'),
        svc('welding', 'Welding', 'შედუღება', 'Сварка', 50, 200, 'hour', 'per hour', 'საათი', 'за час'),
      ]),
    ],
  },

  // ─── 11. Roofer ──────────────────────────────────────────────
  {
    key: 'roofer', label: { en: 'Roofer', ka: 'სახურავის ხელოსანი', ru: 'Кровельщик' },
    iconName: 'Home', color: '#B45309', minPrice: 15, sortOrder: 10, isActive: true,
    subcategories: [
      sub('roofing', 'Roofing', 'სახურავი', 'Кровля', 'Home', 15, 50, 0, [
        svc('roof_install', 'Roof Install', 'სახურავის მონტაჟი', 'Монтаж кровли', 20, 50, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('roof_repair', 'Roof Repair', 'სახურავის შეკეთება', 'Ремонт кровли', 15, 40, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('gutter_install', 'Gutter Install', 'ღარების მონტაჟი', 'Установка водостоков', 15, 30, 'meter', 'per meter', 'მეტრი', 'за метр'),
        svc('roof_waterproof', 'Roof Waterproofing', 'სახურავის ჰიდროიზოლაცია', 'Гидроизоляция кровли', 15, 35, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
    ],
  },

  // ─── 12. Glass & Mirror ──────────────────────────────────────
  {
    key: 'glass_mirror', label: { en: 'Glass & Mirror', ka: 'მინა და სარკე', ru: 'Стекло и зеркала' },
    iconName: 'SquareStack', color: '#06B6D4', minPrice: 40, sortOrder: 11, isActive: true,
    subcategories: [
      sub('glass_work', 'Glass & Mirror Work', 'მინისა და სარკის სამუშაო', 'Стекольные и зеркальные работы', 'SquareStack', 40, 500, 0, [
        svc('pvc_window', 'PVC Window Install', 'მეტალოპლასტმასის ფანჯარა', 'Установка ПВХ окна', 80, 300, 'piece', 'per window', 'ფანჯარა', 'за окно'),
        svc('window_repair', 'Window Repair', 'ფანჯრის შეკეთება', 'Ремонт окна', 40, 120, 'piece', 'per window', 'ფანჯარა', 'за окно'),
        svc('glass_door', 'Glass Door', 'შუშის კარი', 'Стеклянная дверь', 150, 500, 'piece', 'per door', 'კარი', 'за дверь'),
        svc('shower_cabin', 'Shower Cabin Install', 'შხაპის კაბინა', 'Установка душевой кабины', 100, 300, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('custom_mirror', 'Custom Mirror Install', 'სარკის დამზადება/მონტაჟი', 'Изготовление/монтаж зеркала', 60, 300, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
    ],
  },

  // ─── 13. HVAC ────────────────────────────────────────────────
  {
    key: 'hvac', label: { en: 'HVAC Specialist', ka: 'კონდიციონერის სპეციალისტი', ru: 'Специалист по кондиционерам' },
    iconName: 'Snowflake', color: '#2563EB', minPrice: 50, sortOrder: 12, isActive: true,
    subcategories: [
      sub('ac_services', 'Air Conditioning', 'კონდიციონერი', 'Кондиционер', 'Snowflake', 50, 300, 0, [
        svc('ac_install', 'AC Install', 'კონდიციონერის მონტაჟი', 'Установка кондиционера', 100, 250, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('ac_repair', 'AC Repair', 'კონდიციონერის შეკეთება', 'Ремонт кондиционера', 50, 150, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('ac_maintenance', 'AC Maintenance/Cleaning', 'კონდიციონერის მოვლა/წმენდა', 'Обслуживание/чистка кондиционера', 50, 100, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
      sub('heating', 'Heating', 'გათბობა', 'Отопление', 'Flame', 80, 500, 1, [
        svc('radiator_install', 'Radiator Install', 'რადიატორის მონტაჟი', 'Установка радиатора', 60, 150, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('underfloor_heating', 'Underfloor Heating', 'იატაკის გათბობა', 'Теплый пол', 20, 45, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('heating_boiler', 'Heating Boiler Install', 'გათბობის ქვაბის მონტაჟი', 'Установка котла отопления', 150, 500, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
      sub('ventilation', 'Ventilation', 'ვენტილაცია', 'Вентиляция', 'Wind', 60, 200, 2, [
        svc('vent_install', 'Ventilation Install', 'ვენტილაციის მონტაჟი', 'Установка вентиляции', 60, 200, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('hood_install', 'Range Hood Install', 'გამწოვის მონტაჟი', 'Установка вытяжки', 40, 100, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
    ],
  },

  // ─── 14. Security/Systems ────────────────────────────────────
  {
    key: 'systems', label: { en: 'Security & Systems', ka: 'სისტემების სპეციალისტი', ru: 'Системы безопасности' },
    iconName: 'Shield', color: '#059669', minPrice: 40, sortOrder: 13, isActive: true,
    subcategories: [
      sub('security_systems', 'Security & Tech', 'უსაფრთხოება და ტექნიკა', 'Безопасность и техника', 'Shield', 40, 300, 0, [
        svc('camera_install', 'Security Camera Install', 'კამერების მონტაჟი', 'Установка камер', 50, 200, 'piece', 'per camera', 'კამერა', 'за камеру'),
        svc('intercom_install', 'Intercom Install', 'დომოფონის მონტაჟი', 'Установка домофона', 50, 150, 'piece', 'per unit', 'ერთეული', 'за штуку'),
        svc('alarm_install', 'Alarm System Install', 'სიგნალიზაციის მონტაჟი', 'Установка сигнализации', 80, 300, 'piece', 'per system', 'სისტემა', 'за систему'),
        svc('satellite_antenna', 'Satellite/Antenna Install', 'ანტენის მონტაჟი', 'Установка антенны', 40, 100, 'piece', 'per unit', 'ერთეული', 'за штуку'),
      ]),
    ],
  },

  // ─── 15. Cleaner ─────────────────────────────────────────────
  {
    key: 'cleaner', label: { en: 'Cleaner', ka: 'დამლაგებელი', ru: 'Уборщик' },
    iconName: 'SprayCan', color: '#3B82F6', minPrice: 30, sortOrder: 14, isActive: true,
    subcategories: [
      sub('home_cleaning', 'Home Cleaning', 'სახლის დალაგება', 'Уборка дома', 'SprayCan', 30, 200, 0, [
        svc('standard_cleaning', 'Standard Cleaning', 'სტანდარტული დალაგება', 'Стандартная уборка', 30, 80, 'room', 'per room', 'ოთახი', 'за комнату'),
        svc('deep_cleaning', 'Deep Cleaning', 'გენერალური დალაგება', 'Генеральная уборка', 50, 200, 'room', 'per room', 'ოთახი', 'за комнату'),
        svc('post_reno_cleaning', 'Post-Renovation Cleaning', 'სარემონტო დალაგება', 'Уборка после ремонта', 80, 300, 'room', 'per room', 'ოთახი', 'за комнату'),
        svc('window_cleaning', 'Window Cleaning', 'ფანჯრების წმენდა', 'Мытье окон', 10, 25, 'piece', 'per window', 'ფანჯარა', 'за окно'),
      ]),
      sub('special_cleaning', 'Special Cleaning', 'სპეციალური წმენდა', 'Специальная чистка', 'Sparkles', 40, 150, 1, [
        svc('upholstery_cleaning', 'Upholstery Cleaning', 'ავეჯის ქიმწმენდა', 'Химчистка мебели', 40, 120, 'piece', 'per item', 'ერთეული', 'за штуку'),
        svc('carpet_cleaning', 'Carpet Cleaning', 'ხალიჩის წმენდა', 'Чистка ковров', 5, 15, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('rental_cleaning', 'Rental/Airbnb Cleaning', 'საიჯარო დალაგება', 'Уборка для аренды', 40, 100, 'room', 'per room', 'ოთახი', 'за комнату'),
      ]),
    ],
  },

  // ─── 16. Gardener ────────────────────────────────────────────
  {
    key: 'gardener', label: { en: 'Gardener', ka: 'მებაღე', ru: 'Садовник' },
    iconName: 'TreeDeciduous', color: '#16A34A', minPrice: 30, sortOrder: 15, isActive: true,
    subcategories: [
      sub('garden_work', 'Garden Work', 'ბაღის სამუშაო', 'Садовые работы', 'TreeDeciduous', 30, 300, 0, [
        svc('garden_maintenance', 'Garden Maintenance', 'ბაღის მოვლა', 'Обслуживание сада', 30, 100, 'hour', 'per hour', 'საათი', 'за час'),
        svc('tree_trimming', 'Tree Trimming/Cutting', 'ხეების გასხვლა/ჭრა', 'Обрезка/спил деревьев', 50, 300, 'piece', 'per tree', 'ხე', 'за дерево'),
        svc('landscaping', 'Landscaping', 'გამწვანება/ლანდშაფტი', 'Ландшафтный дизайн', 50, 200, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('irrigation', 'Irrigation System', 'სარწყავი სისტემა', 'Система полива', 80, 300, 'piece', 'per system', 'სისტემა', 'за систему'),
        svc('lawn_care', 'Lawn Care', 'გაზონის მოვლა', 'Уход за газоном', 30, 80, 'hour', 'per hour', 'საათი', 'за час'),
      ]),
    ],
  },

  // ─── 17. Stone/Marble ────────────────────────────────────────
  {
    key: 'stone_worker', label: { en: 'Stone/Marble Worker', ka: 'ქვის ხელოსანი', ru: 'Каменщик/Мраморщик' },
    iconName: 'Mountain', color: '#78716C', minPrice: 30, sortOrder: 16, isActive: true,
    subcategories: [
      sub('stone_work', 'Stone & Marble Work', 'ქვის სამუშაო', 'Работа с камнем', 'Mountain', 30, 500, 0, [
        svc('marble_install', 'Marble Install', 'მარმარილოს დაგება', 'Укладка мрамора', 30, 80, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('granite_countertop', 'Granite Countertop', 'გრანიტის ზედაპირი', 'Гранитная столешница', 100, 400, 'meter', 'per linear meter', 'გრძ. მეტრი', 'за пог. метр'),
        svc('stone_facade', 'Stone Facade', 'ქვის ფასადი', 'Каменный фасад', 40, 120, 'sqm', 'per m²', 'მ²', 'за м²'),
        svc('stone_restoration', 'Stone Restoration', 'ქვის რესტავრაცია', 'Реставрация камня', 50, 200, 'sqm', 'per m²', 'მ²', 'за м²'),
      ]),
    ],
  },

  // ─── 18. IT Specialist ───────────────────────────────────────
  {
    key: 'it_specialist', label: { en: 'IT Specialist', ka: 'IT სპეციალისტი', ru: 'IT специалист' },
    iconName: 'Monitor', color: '#2563EB', minPrice: 30, sortOrder: 17, isActive: true,
    subcategories: [
      sub('computer_services', 'Computer Services', 'კომპიუტერის სერვისი', 'Компьютерный сервис', 'Monitor', 30, 150, 0, [
        svc('pc_setup', 'PC Setup', 'კომპიუტერის აწყობა', 'Настройка ПК', 40, 100, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('pc_repair', 'PC Repair', 'კომპიუტერის შეკეთება', 'Ремонт ПК', 30, 120, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('os_install', 'OS Install', 'სისტემის დაყენება', 'Установка ОС', 30, 60, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('data_recovery', 'Data Recovery', 'მონაცემების აღდგენა', 'Восстановление данных', 50, 200, 'piece', 'per job', 'სამუშაო', 'за работу'),
      ]),
      sub('network_services', 'Network & Internet', 'ქსელი და ინტერნეტი', 'Сеть и интернет', 'Wifi', 30, 100, 1, [
        svc('wifi_setup', 'WiFi Setup', 'WiFi-ის დაყენება', 'Настройка WiFi', 30, 60, 'piece', 'per job', 'სამუშაო', 'за работу'),
        svc('network_wiring', 'Network Wiring', 'ქსელის გაყვანა', 'Прокладка сети', 40, 100, 'point', 'per point', 'წერტილი', 'за точку'),
        svc('printer_setup', 'Printer Setup', 'პრინტერის დაყენება', 'Настройка принтера', 30, 50, 'piece', 'per job', 'სამუშაო', 'за работу'),
      ]),
    ],
  },

  // ─── 19. Architect ───────────────────────────────────────────
  {
    key: 'architect', label: { en: 'Architect', ka: 'არქიტექტორი', ru: 'Архитектор' },
    iconName: 'Building', color: '#1E3A5F', minPrice: 200, sortOrder: 18, isActive: true,
    subcategories: [
      sub('architecture', 'Architecture', 'არქიტექტურა', 'Архитектура', 'Building', 200, 5000, 0, [
        svc('residential_project', 'Residential Project', 'საცხოვრებელი პროექტი', 'Жилой проект', 500, 5000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('commercial_project', 'Commercial Project', 'კომერციული პროექტი', 'Коммерческий проект', 1000, 10000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('permit_docs', 'Permit Documentation', 'ნებართვის დოკუმენტაცია', 'Документация на разрешение', 200, 1000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('technical_supervision', 'Technical Supervision', 'ტექნიკური ზედამხედველობა', 'Технический надзор', 300, 2000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('arch_3d_viz', '3D Visualization', '3D ვიზუალიზაცია', '3D визуализация', 200, 1000, 'piece', 'per project', 'პროექტი', 'за проект'),
      ]),
    ],
  },

  // ─── 20. Interior Designer ───────────────────────────────────
  {
    key: 'designer', label: { en: 'Interior Designer', ka: 'დიზაინერი', ru: 'Дизайнер интерьера' },
    iconName: 'Palette', color: '#DB2777', minPrice: 150, sortOrder: 19, isActive: true,
    subcategories: [
      sub('interior_design', 'Interior Design', 'ინტერიერის დიზაინი', 'Дизайн интерьера', 'Palette', 150, 5000, 0, [
        svc('apartment_design', 'Apartment Design', 'ბინის დიზაინი', 'Дизайн квартиры', 500, 5000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('office_design', 'Office Design', 'ოფისის დიზაინი', 'Дизайн офиса', 500, 5000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('kitchen_design', 'Kitchen Design', 'სამზარეულოს დიზაინი', 'Дизайн кухни', 200, 1500, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('bathroom_design', 'Bathroom Design', 'სააბაზანოს დიზაინი', 'Дизайн ванной', 150, 1000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('furniture_selection', 'Furniture Selection', 'ავეჯის შერჩევა', 'Подбор мебели', 150, 500, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('design_3d_viz', '3D Rendering', '3D ვიზუალიზაცია', '3D визуализация', 200, 1000, 'piece', 'per project', 'პროექტი', 'за проект'),
        svc('design_supervision', 'Design Supervision', 'ავტორის ზედამხედველობა', 'Авторский надзор', 300, 2000, 'piece', 'per project', 'პროექტი', 'за проект'),
      ]),
    ],
  },

  // ─── 21. Mover ───────────────────────────────────────────────
  {
    key: 'mover', label: { en: 'Mover', ka: 'გადამზიდავი', ru: 'Грузчик/Перевозчик' },
    iconName: 'Truck', color: '#D97706', minPrice: 50, sortOrder: 20, isActive: true,
    subcategories: [
      sub('moving', 'Moving & Delivery', 'გადაზიდვა და მიტანა', 'Переезд и доставка', 'Truck', 50, 500, 0, [
        svc('apartment_moving', 'Apartment Moving', 'ბინის გადაზიდვა', 'Переезд квартиры', 100, 500, 'piece', 'per move', 'გადაზიდვა', 'за переезд'),
        svc('furniture_delivery', 'Furniture Delivery', 'ავეჯის გადაზიდვა', 'Доставка мебели', 50, 200, 'piece', 'per item', 'ერთეული', 'за штуку'),
        svc('material_delivery', 'Construction Material Delivery', 'მასალის მიტანა', 'Доставка стройматериалов', 50, 200, 'piece', 'per load', 'ტვირთი', 'за груз'),
        svc('debris_removal', 'Debris/Waste Removal', 'ნაგვის გატანა', 'Вывоз мусора', 50, 150, 'piece', 'per load', 'ტვირთი', 'за груз'),
        svc('packing_service', 'Packing Service', 'შეფუთვა', 'Упаковка', 50, 150, 'piece', 'per move', 'გადაზიდვა', 'за переезд'),
      ]),
    ],
  },
];

export function buildSeedDataV2(): Category[] {
  return CATALOG;
}

// Also export as default buildSeedData for backwards compatibility
export { buildSeedDataV2 as buildSeedData };
