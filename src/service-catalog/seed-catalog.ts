/**
 * Seed data transformer for the service catalog.
 * Reads the hardcoded SERVICE_CATALOG structure and 3 locale files,
 * transforms i18n keys into { en, ka, ru } localized text objects.
 *
 * Usage: import { buildSeedData } from './seed-catalog'; const data = buildSeedData();
 * Then pass to ServiceCatalogService.seed(data).
 */

import * as fs from 'fs';
import * as path from 'path';

interface LocaleData {
  catalog?: Record<string, string>;
  [key: string]: unknown;
}

function loadLocale(lang: string): Record<string, string> {
  // Try multiple possible locale file paths
  const possiblePaths = [
    path.join(process.cwd(), '..', 'mobile', 'src', 'locales', `${lang}.json`),
    path.join(process.cwd(), '..', '..', 'mobile', 'src', 'locales', `${lang}.json`),
  ];

  for (const p of possiblePaths) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const data: LocaleData = JSON.parse(raw);
      return data.catalog as Record<string, string> ?? {};
    } catch {
      // Try next path
    }
  }

  return {};
}

function lt(
  key: string,
  en: Record<string, string>,
  ka: Record<string, string>,
  ru: Record<string, string>,
): { en: string; ka: string; ru: string } {
  // key format: "catalog.fieldName" → strip "catalog." prefix
  const field = key.startsWith('catalog.') ? key.slice(8) : key;
  return {
    en: en[field] || field,
    ka: ka[field] || en[field] || field,
    ru: ru[field] || en[field] || field,
  };
}

// ─── Inline SERVICE_CATALOG data (mirrored from mobile) ────────────────

function buildServiceItem(
  s: { key: string; labelKey: string; descriptionKey?: string; basePrice: number; maxPrice?: number; unit: string; unitLabelKey: string; maxQuantity?: number; step?: number; discountTiers?: { minQuantity: number; percent: number }[] },
  en: Record<string, string>,
  ka: Record<string, string>,
  ru: Record<string, string>,
) {
  return {
    key: s.key,
    label: lt(s.labelKey, en, ka, ru),
    ...(s.descriptionKey ? { description: lt(s.descriptionKey, en, ka, ru) } : {}),
    basePrice: s.basePrice,
    ...(s.maxPrice !== undefined ? { maxPrice: s.maxPrice } : {}),
    unit: s.unit,
    unitLabel: lt(s.unitLabelKey, en, ka, ru),
    ...(s.maxQuantity !== undefined ? { maxQuantity: s.maxQuantity } : {}),
    ...(s.step !== undefined ? { step: s.step } : {}),
    ...(s.discountTiers?.length ? { discountTiers: s.discountTiers } : {}),
  };
}

function buildAddon(
  a: { key: string; labelKey: string; promptKey: string; basePrice: number; maxPrice?: number; unit: string; unitLabelKey: string; iconName?: string },
  en: Record<string, string>,
  ka: Record<string, string>,
  ru: Record<string, string>,
) {
  return {
    key: a.key,
    label: lt(a.labelKey, en, ka, ru),
    promptLabel: lt(a.promptKey, en, ka, ru),
    basePrice: a.basePrice,
    ...(a.maxPrice !== undefined ? { maxPrice: a.maxPrice } : {}),
    unit: a.unit,
    unitLabel: lt(a.unitLabelKey, en, ka, ru),
    ...(a.iconName ? { iconName: a.iconName } : {}),
  };
}

function buildVariant(
  v: { key: string; labelKey: string; services: any[]; addons?: any[]; additionalServices?: any[] },
  en: Record<string, string>,
  ka: Record<string, string>,
  ru: Record<string, string>,
) {
  return {
    key: v.key,
    label: lt(v.labelKey, en, ka, ru),
    services: v.services.map((s) => buildServiceItem(s, en, ka, ru)),
    addons: (v.addons ?? []).map((a) => buildAddon(a, en, ka, ru)),
    additionalServices: (v.additionalServices ?? []).map((s) => buildServiceItem(s, en, ka, ru)),
  };
}

function buildSubcategory(
  sub: {
    key: string; labelKey: string; descriptionKey?: string; iconName: string;
    imageUrl?: string; priceRange: { min: number; max?: number };
    variants?: any[]; services?: any[]; addons?: any[]; additionalServices?: any[];
    orderDiscountTiers?: { minQuantity: number; percent: number }[];
  },
  en: Record<string, string>,
  ka: Record<string, string>,
  ru: Record<string, string>,
  sortOrder: number,
) {
  return {
    key: sub.key,
    label: lt(sub.labelKey, en, ka, ru),
    ...(sub.descriptionKey ? { description: lt(sub.descriptionKey, en, ka, ru) } : {}),
    iconName: sub.iconName,
    ...(sub.imageUrl ? { imageUrl: sub.imageUrl } : {}),
    priceRange: sub.priceRange,
    sortOrder,
    isActive: true,
    variants: (sub.variants ?? []).map((v) => buildVariant(v, en, ka, ru)),
    services: (sub.services ?? []).map((s) => buildServiceItem(s, en, ka, ru)),
    addons: (sub.addons ?? []).map((a) => buildAddon(a, en, ka, ru)),
    additionalServices: (sub.additionalServices ?? []).map((s) => buildServiceItem(s, en, ka, ru)),
    ...(sub.orderDiscountTiers?.length ? { orderDiscountTiers: sub.orderDiscountTiers } : {}),
  };
}

// ─── The actual catalog data (inlined from mobile) ─────────────────

const cleaningChemicalsAddon = {
  key: 'cleaning_chemicals', labelKey: 'catalog.cleaningChemicals',
  promptKey: 'catalog.addon_cleaningChemicalsPrompt', basePrice: 12, maxPrice: 25,
  unit: 'set', unitLabelKey: 'catalog.unitSet', iconName: 'SprayCan',
};

const stainProtectionAddon = {
  key: 'stain_protection', labelKey: 'catalog.stainProtection',
  promptKey: 'catalog.addon_stainProtectionPrompt', basePrice: 30, maxPrice: 60,
  unit: 'piece', unitLabelKey: 'catalog.unitPiece', iconName: 'Shield',
};

const packingMaterialsAddon = {
  key: 'packing_materials', labelKey: 'catalog.packingMaterials',
  promptKey: 'catalog.addon_packingMaterialsPrompt', basePrice: 40, maxPrice: 80,
  unit: 'set', unitLabelKey: 'catalog.unitSet', iconName: 'Package',
};

const standardCleaningVariants = [
  {
    key: 'apartment', labelKey: 'catalog.variant_apartment',
    services: [
      { key: 'std_apt_kitchen', labelKey: 'catalog.kitchenCleaning', basePrice: 35, maxPrice: 70, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 2 },
      { key: 'std_apt_bathroom', labelKey: 'catalog.bathroomCleaning', basePrice: 30, maxPrice: 60, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 3, discountTiers: [{ minQuantity: 2, percent: 10 }, { minQuantity: 3, percent: 15 }] },
      { key: 'std_apt_living', labelKey: 'catalog.livingRoomCleaning', basePrice: 40, maxPrice: 80, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 2 },
      { key: 'std_apt_bedroom', labelKey: 'catalog.bedroomCleaning', basePrice: 35, maxPrice: 70, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 5, discountTiers: [{ minQuantity: 2, percent: 10 }, { minQuantity: 4, percent: 20 }] },
      { key: 'std_apt_cabinet', labelKey: 'catalog.cabinetRoom', basePrice: 30, maxPrice: 60, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 2 },
      { key: 'std_apt_terrace', labelKey: 'catalog.terraceCleaning', basePrice: 5, maxPrice: 12, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
    ],
    addons: [cleaningChemicalsAddon],
    additionalServices: [
      { key: 'std_apt_ironing', labelKey: 'catalog.ironing', basePrice: 20, maxPrice: 40, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
      { key: 'std_apt_fridge', labelKey: 'catalog.fridgeCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 2 },
      { key: 'std_apt_cupboard', labelKey: 'catalog.cupboardCleaning', basePrice: 15, maxPrice: 35, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
      { key: 'std_apt_laundry', labelKey: 'catalog.laundryCleaning', basePrice: 20, maxPrice: 40, unit: 'set', unitLabelKey: 'catalog.unitSet' },
    ],
  },
  {
    key: 'studio', labelKey: 'catalog.variant_studio',
    services: [
      { key: 'std_st_kitchen', labelKey: 'catalog.kitchenCleaning', basePrice: 30, maxPrice: 60, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'std_st_bathroom', labelKey: 'catalog.bathroomCleaning', basePrice: 25, maxPrice: 50, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'std_st_living', labelKey: 'catalog.livingRoomCleaning', basePrice: 35, maxPrice: 70, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'std_st_bedroom', labelKey: 'catalog.bedroomCleaning', basePrice: 30, maxPrice: 60, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'std_st_cabinet', labelKey: 'catalog.cabinetRoom', basePrice: 25, maxPrice: 50, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'std_st_terrace', labelKey: 'catalog.terraceCleaning', basePrice: 5, maxPrice: 12, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
    ],
    addons: [cleaningChemicalsAddon],
    additionalServices: [
      { key: 'std_st_ironing', labelKey: 'catalog.ironing', basePrice: 20, maxPrice: 40, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
      { key: 'std_st_fridge', labelKey: 'catalog.fridgeCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 1 },
      { key: 'std_st_cupboard', labelKey: 'catalog.cupboardCleaning', basePrice: 15, maxPrice: 35, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
      { key: 'std_st_laundry', labelKey: 'catalog.laundryCleaning', basePrice: 20, maxPrice: 40, unit: 'set', unitLabelKey: 'catalog.unitSet' },
    ],
  },
];

const deepCleaningVariants = [
  {
    key: 'apartment', labelKey: 'catalog.variant_apartment',
    services: [
      { key: 'deep_apt_kitchen', labelKey: 'catalog.kitchenCleaning', basePrice: 45, maxPrice: 90, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 2 },
      { key: 'deep_apt_bathroom', labelKey: 'catalog.bathroomCleaning', basePrice: 40, maxPrice: 80, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 3 },
      { key: 'deep_apt_living', labelKey: 'catalog.livingRoomCleaning', basePrice: 50, maxPrice: 100, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 2 },
      { key: 'deep_apt_bedroom', labelKey: 'catalog.bedroomCleaning', basePrice: 45, maxPrice: 90, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 5 },
      { key: 'deep_apt_cabinet', labelKey: 'catalog.cabinetRoom', basePrice: 40, maxPrice: 80, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 2 },
      { key: 'deep_apt_terrace', labelKey: 'catalog.terraceCleaning', basePrice: 8, maxPrice: 18, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
      { key: 'deep_apt_window', labelKey: 'catalog.windowCleaning', basePrice: 12, maxPrice: 25, unit: 'window', unitLabelKey: 'catalog.unitWindow', maxQuantity: 20 },
      { key: 'deep_apt_double_window', labelKey: 'catalog.doubleWindowCleaning', basePrice: 18, maxPrice: 35, unit: 'window', unitLabelKey: 'catalog.unitWindow', maxQuantity: 10 },
      { key: 'deep_apt_glass_door', labelKey: 'catalog.glassDoorCleaning', basePrice: 20, maxPrice: 40, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 5 },
      { key: 'deep_apt_stained_glass', labelKey: 'catalog.stainedGlassCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 5 },
    ],
    addons: [cleaningChemicalsAddon],
    additionalServices: [
      { key: 'deep_apt_ironing', labelKey: 'catalog.ironing', basePrice: 20, maxPrice: 40, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
      { key: 'deep_apt_fridge', labelKey: 'catalog.fridgeCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 2 },
      { key: 'deep_apt_cupboard', labelKey: 'catalog.cupboardCleaning', basePrice: 15, maxPrice: 35, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
      { key: 'deep_apt_laundry', labelKey: 'catalog.laundryCleaning', basePrice: 20, maxPrice: 40, unit: 'set', unitLabelKey: 'catalog.unitSet' },
    ],
  },
  {
    key: 'studio', labelKey: 'catalog.variant_studio',
    services: [
      { key: 'deep_st_kitchen', labelKey: 'catalog.kitchenCleaning', basePrice: 40, maxPrice: 80, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'deep_st_bathroom', labelKey: 'catalog.bathroomCleaning', basePrice: 35, maxPrice: 70, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'deep_st_living', labelKey: 'catalog.livingRoomCleaning', basePrice: 45, maxPrice: 90, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'deep_st_bedroom', labelKey: 'catalog.bedroomCleaning', basePrice: 40, maxPrice: 80, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'deep_st_cabinet', labelKey: 'catalog.cabinetRoom', basePrice: 35, maxPrice: 70, unit: 'room', unitLabelKey: 'catalog.unitRoom', maxQuantity: 1 },
      { key: 'deep_st_terrace', labelKey: 'catalog.terraceCleaning', basePrice: 8, maxPrice: 18, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
      { key: 'deep_st_window', labelKey: 'catalog.windowCleaning', basePrice: 12, maxPrice: 25, unit: 'window', unitLabelKey: 'catalog.unitWindow', maxQuantity: 10 },
      { key: 'deep_st_double_window', labelKey: 'catalog.doubleWindowCleaning', basePrice: 18, maxPrice: 35, unit: 'window', unitLabelKey: 'catalog.unitWindow', maxQuantity: 5 },
      { key: 'deep_st_glass_door', labelKey: 'catalog.glassDoorCleaning', basePrice: 20, maxPrice: 40, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 3 },
      { key: 'deep_st_stained_glass', labelKey: 'catalog.stainedGlassCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 3 },
    ],
    addons: [cleaningChemicalsAddon],
    additionalServices: [
      { key: 'deep_st_ironing', labelKey: 'catalog.ironing', basePrice: 20, maxPrice: 40, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
      { key: 'deep_st_fridge', labelKey: 'catalog.fridgeCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 1 },
      { key: 'deep_st_cupboard', labelKey: 'catalog.cupboardCleaning', basePrice: 15, maxPrice: 35, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
      { key: 'deep_st_laundry', labelKey: 'catalog.laundryCleaning', basePrice: 20, maxPrice: 40, unit: 'set', unitLabelKey: 'catalog.unitSet' },
    ],
  },
];

const windowCleaningVariants = [
  {
    key: 'regular', labelKey: 'catalog.variant_regular',
    services: [
      { key: 'wc_reg_window', labelKey: 'catalog.windowCleaning', basePrice: 8, maxPrice: 18, unit: 'window', unitLabelKey: 'catalog.unitWindow' },
      { key: 'wc_reg_double_window', labelKey: 'catalog.doubleWindowCleaning', basePrice: 12, maxPrice: 25, unit: 'window', unitLabelKey: 'catalog.unitWindow' },
      { key: 'wc_reg_glass_door', labelKey: 'catalog.glassDoorCleaning', basePrice: 15, maxPrice: 35, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
      { key: 'wc_reg_stained_glass', labelKey: 'catalog.stainedGlassCleaning', basePrice: 18, maxPrice: 40, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
    ],
  },
  {
    key: 'after_renovation', labelKey: 'catalog.variant_afterRenovation',
    services: [
      { key: 'wc_reno_window', labelKey: 'catalog.windowCleaning', basePrice: 12, maxPrice: 25, unit: 'window', unitLabelKey: 'catalog.unitWindow' },
      { key: 'wc_reno_double_window', labelKey: 'catalog.doubleWindowCleaning', basePrice: 18, maxPrice: 35, unit: 'window', unitLabelKey: 'catalog.unitWindow' },
      { key: 'wc_reno_glass_door', labelKey: 'catalog.glassDoorCleaning', basePrice: 22, maxPrice: 45, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
      { key: 'wc_reno_stained_glass', labelKey: 'catalog.stainedGlassCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
    ],
  },
];

function buildMovingVariant(vKey: string, labelKey: string, prices: { load: number; unload: number; transport: number; pack: number; unpack: number }, maxPrices: { load: number; unload: number; transport: number; pack: number; unpack: number }) {
  return {
    key: vKey, labelKey,
    services: [
      { key: `${vKey}_loading`, labelKey: 'catalog.loading', basePrice: prices.load, maxPrice: maxPrices.load, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
      { key: `${vKey}_unloading`, labelKey: 'catalog.unloading', basePrice: prices.unload, maxPrice: maxPrices.unload, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
      { key: `${vKey}_transport`, labelKey: 'catalog.transport', basePrice: prices.transport, maxPrice: maxPrices.transport, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
      { key: `${vKey}_packing`, labelKey: 'catalog.packing', basePrice: prices.pack, maxPrice: maxPrices.pack, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
      { key: `${vKey}_unpacking`, labelKey: 'catalog.unpacking', basePrice: prices.unpack, maxPrice: maxPrices.unpack, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
    ],
    addons: [packingMaterialsAddon],
    additionalServices: [
      { key: `${vKey}_piano`, labelKey: 'catalog.pianoMoving', basePrice: 200, maxPrice: 400, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 1 },
      { key: `${vKey}_safe`, labelKey: 'catalog.safeMoving', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece', maxQuantity: 1 },
      { key: `${vKey}_disassembly`, labelKey: 'catalog.disassemblyReassembly', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
    ],
  };
}

const movingVariants = [
  buildMovingVariant('mv_studio', 'catalog.variant_studio', { load: 80, unload: 80, transport: 100, pack: 60, unpack: 60 }, { load: 160, unload: 160, transport: 200, pack: 120, unpack: 120 }),
  buildMovingVariant('mv_1r', 'catalog.variant_1room', { load: 120, unload: 120, transport: 150, pack: 80, unpack: 80 }, { load: 240, unload: 240, transport: 300, pack: 160, unpack: 160 }),
  buildMovingVariant('mv_2r', 'catalog.variant_2room', { load: 160, unload: 160, transport: 200, pack: 100, unpack: 100 }, { load: 320, unload: 320, transport: 400, pack: 200, unpack: 200 }),
  buildMovingVariant('mv_3r', 'catalog.variant_3room', { load: 200, unload: 200, transport: 250, pack: 120, unpack: 120 }, { load: 400, unload: 400, transport: 500, pack: 240, unpack: 240 }),
  buildMovingVariant('mv_h', 'catalog.variant_house', { load: 300, unload: 300, transport: 400, pack: 180, unpack: 180 }, { load: 600, unload: 600, transport: 800, pack: 360, unpack: 360 }),
];

// Compact keys to reduce line count — use the same moving variant key pattern as mobile
// Override keys to match mobile exactly
movingVariants[0].key = 'moving_studio';
movingVariants[0].services.forEach(s => s.key = s.key.replace('mv_studio', 'mv_studio'));
movingVariants[1].key = 'moving_1_room';
movingVariants[1].services.forEach(s => s.key = s.key.replace('mv_1r', 'mv_1r'));
movingVariants[2].key = 'moving_2_room';
movingVariants[2].services.forEach(s => s.key = s.key.replace('mv_2r', 'mv_2r'));
movingVariants[3].key = 'moving_3_room';
movingVariants[3].services.forEach(s => s.key = s.key.replace('mv_3r', 'mv_3r'));
movingVariants[4].key = 'moving_house';
movingVariants[4].services.forEach(s => s.key = s.key.replace('mv_h', 'mv_h'));

const SERVICE_CATALOG = [
  {
    key: 'cleaning', labelKey: 'catalog.cleaning', descriptionKey: 'catalog.cleaningDesc',
    iconName: 'BrushCleaning', color: '#3B82F6', minPrice: 8,
    subcategories: [
      { key: 'rental_host_cleaning', labelKey: 'catalog.rentalHostCleaning', descriptionKey: 'catalog.rentalHostCleaningDesc', iconName: 'Home', priceRange: { min: 50 },
        services: [
          { key: 'rh_up_to_40', labelKey: 'catalog.areaUpTo40', basePrice: 50, maxPrice: 100, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
          { key: 'rh_41_to_70', labelKey: 'catalog.area41to70', basePrice: 65, maxPrice: 130, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
          { key: 'rh_71_to_96', labelKey: 'catalog.area71to96', basePrice: 75, maxPrice: 150, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
        ],
        addons: [cleaningChemicalsAddon],
        additionalServices: [
          { key: 'rh_curtain_wash_iron', labelKey: 'catalog.curtainWashingIroning', basePrice: 15, maxPrice: 35, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'hourly_cleaning', labelKey: 'catalog.hourlyCleaning', descriptionKey: 'catalog.hourlyCleaningDesc', iconName: 'Clock', priceRange: { min: 45 },
        services: [
          { key: 'hc_2_hours', labelKey: 'catalog.duration2Hours', basePrice: 45, maxPrice: 90, unit: 'set', unitLabelKey: 'catalog.unitSet', maxQuantity: 1 },
        ],
        addons: [cleaningChemicalsAddon],
      },
      { key: 'standard_cleaning', labelKey: 'catalog.standardCleaning', descriptionKey: 'catalog.standardCleaningDesc', iconName: 'Sparkles', priceRange: { min: 25 }, variants: standardCleaningVariants, orderDiscountTiers: [{ minQuantity: 3, percent: 5 }, { minQuantity: 5, percent: 10 }] },
      { key: 'deep_cleaning', labelKey: 'catalog.deepCleaning', descriptionKey: 'catalog.deepCleaningDesc', iconName: 'Layers', priceRange: { min: 35 }, variants: deepCleaningVariants },
      { key: 'window_cleaning', labelKey: 'catalog.windowCleaningSub', descriptionKey: 'catalog.windowCleaningSubDesc', iconName: 'Square', priceRange: { min: 8 }, variants: windowCleaningVariants },
      { key: 'ironing_service', labelKey: 'catalog.ironingServiceSub', descriptionKey: 'catalog.ironingServiceDesc', iconName: 'Shirt', priceRange: { min: 15 },
        services: [
          { key: 'iron_1_hour', labelKey: 'catalog.duration1Hour', basePrice: 15, maxPrice: 30, unit: 'set', unitLabelKey: 'catalog.unitHour', maxQuantity: 1 },
          { key: 'iron_2_hours', labelKey: 'catalog.duration2Hours', basePrice: 25, maxPrice: 50, unit: 'set', unitLabelKey: 'catalog.unitHour', maxQuantity: 1 },
          { key: 'iron_3_hours', labelKey: 'catalog.duration3Hours', basePrice: 35, maxPrice: 70, unit: 'set', unitLabelKey: 'catalog.unitHour', maxQuantity: 1 },
          { key: 'iron_4_hours', labelKey: 'catalog.duration4Hours', basePrice: 45, maxPrice: 90, unit: 'set', unitLabelKey: 'catalog.unitHour', maxQuantity: 1 },
        ],
      },
      { key: 'entrance_cleaning', labelKey: 'catalog.entranceCleaning', descriptionKey: 'catalog.entranceCleaningDesc', iconName: 'Building', priceRange: { min: 15 },
        services: [
          { key: 'ent_per_floor', labelKey: 'catalog.floorCleaning', basePrice: 15, maxPrice: 35, unit: 'floor', unitLabelKey: 'catalog.unitFloor' },
        ],
      },
    ],
  },
  {
    key: 'plumbing', labelKey: 'catalog.plumbing', descriptionKey: 'catalog.plumbingDesc',
    iconName: 'Droplets', color: '#0EA5E9', minPrice: 35,
    subcategories: [
      { key: 'pipes', labelKey: 'catalog.pipes', descriptionKey: 'catalog.pipesDesc', iconName: 'Pipette', priceRange: { min: 40 },
        services: [
          { key: 'pipe_repair', labelKey: 'catalog.pipeRepair', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'pipe_replacement', labelKey: 'catalog.pipeReplacement', basePrice: 25, maxPrice: 50, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'leak_fix', labelKey: 'catalog.leakFix', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'drain_cleaning', labelKey: 'catalog.drainCleaning', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'valve_install', labelKey: 'catalog.valveInstall', basePrice: 35, maxPrice: 70, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'bathroom_install', labelKey: 'catalog.bathroomInstall', descriptionKey: 'catalog.bathroomInstallDesc', iconName: 'Bath', priceRange: { min: 40 },
        services: [
          { key: 'toilet_install', labelKey: 'catalog.toiletInstall', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'sink_install', labelKey: 'catalog.sinkInstall', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'shower_install', labelKey: 'catalog.showerInstall', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'bathtub_install', labelKey: 'catalog.bathtubInstall', basePrice: 200, maxPrice: 400, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'faucet_install', labelKey: 'catalog.faucetInstall', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'bidet_install', labelKey: 'catalog.bidetInstall', basePrice: 70, maxPrice: 140, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'kitchen_plumbing', labelKey: 'catalog.kitchenPlumbing', descriptionKey: 'catalog.kitchenPlumbingDesc', iconName: 'CookingPot', priceRange: { min: 40 },
        services: [
          { key: 'kitchen_sink_install', labelKey: 'catalog.kitchenSinkInstall', basePrice: 70, maxPrice: 140, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'dishwasher_connect', labelKey: 'catalog.dishwasherConnect', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'garbage_disposal', labelKey: 'catalog.garbageDisposal', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'water_filter', labelKey: 'catalog.waterFilter', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'water_heater', labelKey: 'catalog.waterHeater', descriptionKey: 'catalog.waterHeaterDesc', iconName: 'Flame', priceRange: { min: 80 },
        services: [
          { key: 'boiler_install', labelKey: 'catalog.boilerInstall', basePrice: 300, maxPrice: 600, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'boiler_repair', labelKey: 'catalog.boilerRepair', basePrice: 100, maxPrice: 200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'boiler_maintenance', labelKey: 'catalog.boilerMaintenance', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'sewer', labelKey: 'catalog.sewer', descriptionKey: 'catalog.sewerDesc', iconName: 'Pipette', priceRange: { min: 60 },
        services: [
          { key: 'sewer_cleaning', labelKey: 'catalog.sewerCleaning', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'sewer_repair', labelKey: 'catalog.sewerRepair', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'septic_service', labelKey: 'catalog.septicService', basePrice: 200, maxPrice: 400, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
    ],
  },
  {
    key: 'heating_cooling', labelKey: 'catalog.heatingCooling', descriptionKey: 'catalog.heatingCoolingDesc',
    iconName: 'Thermometer', color: '#EF4444', minPrice: 50,
    subcategories: [
      { key: 'ac_services', labelKey: 'catalog.acServices', descriptionKey: 'catalog.acServicesDesc', iconName: 'Wind', priceRange: { min: 50 },
        services: [
          { key: 'ac_install', labelKey: 'catalog.acInstall', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'ac_repair', labelKey: 'catalog.acRepair', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'ac_maintenance', labelKey: 'catalog.acMaintenance', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'ac_cleaning', labelKey: 'catalog.acCleaning', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'heating', labelKey: 'catalog.heating', descriptionKey: 'catalog.heatingDesc', iconName: 'Flame', priceRange: { min: 45 },
        services: [
          { key: 'radiator_install', labelKey: 'catalog.radiatorInstall', basePrice: 120, maxPrice: 240, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'underfloor_heating', labelKey: 'catalog.underfloorHeating', basePrice: 45, maxPrice: 90, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
          { key: 'heating_boiler_install', labelKey: 'catalog.boilerInstall', basePrice: 300, maxPrice: 600, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'heating_pipe', labelKey: 'catalog.heatingPipe', basePrice: 20, maxPrice: 40, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
        ],
      },
      { key: 'ventilation', labelKey: 'catalog.ventilation', descriptionKey: 'catalog.ventilationDesc', iconName: 'Wind', priceRange: { min: 60 },
        services: [
          { key: 'vent_install', labelKey: 'catalog.ventInstall', basePrice: 100, maxPrice: 200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'vent_cleaning', labelKey: 'catalog.ventCleaning', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'duct_install', labelKey: 'catalog.ductInstall', basePrice: 30, maxPrice: 60, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'hood_install', labelKey: 'catalog.hoodInstall', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
    ],
  },
  {
    key: 'handyman', labelKey: 'catalog.handyman', descriptionKey: 'catalog.handymanDesc',
    iconName: 'Wrench', color: '#C4735B', minPrice: 20,
    subcategories: [
      { key: 'mounting', labelKey: 'catalog.mounting', descriptionKey: 'catalog.mountingDesc', iconName: 'Hammer', priceRange: { min: 20 },
        services: [
          { key: 'tv_mount', labelKey: 'catalog.tvMount', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'shelf_mount', labelKey: 'catalog.shelfMount', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'curtain_rod', labelKey: 'catalog.curtainRod', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'mirror_mount', labelKey: 'catalog.mirrorMount', basePrice: 35, maxPrice: 70, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'picture_hanging', labelKey: 'catalog.pictureHanging', basePrice: 20, maxPrice: 40, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'minor_repairs', labelKey: 'catalog.minorRepairs', descriptionKey: 'catalog.minorRepairsDesc', iconName: 'Wrench', priceRange: { min: 20 },
        services: [
          { key: 'drywall_patch', labelKey: 'catalog.drywallPatch', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'paint_touch_up', labelKey: 'catalog.paintTouchUp', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'caulking', labelKey: 'catalog.caulking', basePrice: 15, maxPrice: 35, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'grout_repair', labelKey: 'catalog.groutRepair', basePrice: 20, maxPrice: 40, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'tile_repair', labelKey: 'catalog.tileRepair', basePrice: 35, maxPrice: 70, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'handyman_assembly', labelKey: 'catalog.assemblyServices', descriptionKey: 'catalog.assemblyServicesDesc', iconName: 'Package', priceRange: { min: 30 },
        services: [
          { key: 'furniture_assembly', labelKey: 'catalog.furnitureAssembly', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'gym_equipment', labelKey: 'catalog.gymEquipment', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'playground_assembly', labelKey: 'catalog.playgroundAssembly', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'shelving_unit', labelKey: 'catalog.shelvingUnit', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'outdoor', labelKey: 'catalog.outdoor', descriptionKey: 'catalog.outdoorDesc', iconName: 'TreePine', priceRange: { min: 30 },
        services: [
          { key: 'gutter_cleaning', labelKey: 'catalog.gutterCleaning', basePrice: 15, maxPrice: 30, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'pressure_washing', labelKey: 'catalog.pressureWashing', basePrice: 8, maxPrice: 18, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
          { key: 'deck_repair', labelKey: 'catalog.deckRepair', basePrice: 50, maxPrice: 100, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
          { key: 'fence_repair', labelKey: 'catalog.fenceRepair', basePrice: 30, maxPrice: 60, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
        ],
      },
    ],
  },
  {
    key: 'appliance', labelKey: 'catalog.appliance', descriptionKey: 'catalog.applianceDesc',
    iconName: 'Monitor', color: '#8B5CF6', minPrice: 40,
    subcategories: [
      { key: 'large_appliances', labelKey: 'catalog.largeAppliances', descriptionKey: 'catalog.largeAppliancesDesc', iconName: 'Monitor', priceRange: { min: 50 },
        services: [
          { key: 'washing_machine_repair', labelKey: 'catalog.washingMachineRepair', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'dryer_repair', labelKey: 'catalog.dryerRepair', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'dishwasher_repair', labelKey: 'catalog.dishwasherRepair', basePrice: 70, maxPrice: 140, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'refrigerator_repair', labelKey: 'catalog.refrigeratorRepair', basePrice: 90, maxPrice: 180, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'oven_range_repair', labelKey: 'catalog.ovenRangeRepair', basePrice: 75, maxPrice: 150, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'small_appliances', labelKey: 'catalog.smallAppliances', descriptionKey: 'catalog.smallAppliancesDesc', iconName: 'Zap', priceRange: { min: 30 },
        services: [
          { key: 'microwave_repair', labelKey: 'catalog.microwaveRepair', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'coffee_machine_repair', labelKey: 'catalog.coffeeMachineRepair', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'vacuum_repair', labelKey: 'catalog.vacuumRepair', basePrice: 45, maxPrice: 90, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'iron_repair', labelKey: 'catalog.ironRepair', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'appliance_installation', labelKey: 'catalog.applianceInstallation', descriptionKey: 'catalog.applianceInstallationDesc', iconName: 'Package', priceRange: { min: 40 },
        services: [
          { key: 'appliance_install', labelKey: 'catalog.applianceInstall', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'appliance_uninstall', labelKey: 'catalog.applianceUninstall', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'appliance_relocation', labelKey: 'catalog.applianceRelocation', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
    ],
  },
  {
    key: 'electrical', labelKey: 'catalog.electrical', descriptionKey: 'catalog.electricalDesc',
    iconName: 'Zap', color: '#F59E0B', minPrice: 25,
    subcategories: [
      { key: 'wiring', labelKey: 'catalog.wiring', descriptionKey: 'catalog.wiringDesc', iconName: 'Cable', priceRange: { min: 25 },
        services: [
          { key: 'outlet_install', labelKey: 'catalog.outletInstall', basePrice: 30, maxPrice: 60, unit: 'point', unitLabelKey: 'catalog.unitPoint' },
          { key: 'switch_install', labelKey: 'catalog.switchInstall', basePrice: 25, maxPrice: 50, unit: 'point', unitLabelKey: 'catalog.unitPoint' },
          { key: 'wiring_replacement', labelKey: 'catalog.wiringReplacement', basePrice: 15, maxPrice: 30, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'junction_box', labelKey: 'catalog.junctionBox', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'circuit_breaker', labelKey: 'catalog.circuitBreaker', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'lighting', labelKey: 'catalog.lighting', descriptionKey: 'catalog.lightingDesc', iconName: 'Lightbulb', priceRange: { min: 20 },
        services: [
          { key: 'chandelier_install', labelKey: 'catalog.chandelierInstall', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'spot_light', labelKey: 'catalog.spotLight', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'led_strip', labelKey: 'catalog.ledStrip', basePrice: 20, maxPrice: 40, unit: 'meter', unitLabelKey: 'catalog.unitMeter' },
          { key: 'outdoor_lighting', labelKey: 'catalog.outdoorLighting', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'panel', labelKey: 'catalog.panel', descriptionKey: 'catalog.panelDesc', iconName: 'LayoutGrid', priceRange: { min: 100 },
        services: [
          { key: 'panel_install', labelKey: 'catalog.panelInstall', basePrice: 200, maxPrice: 400, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'panel_upgrade', labelKey: 'catalog.panelUpgrade', basePrice: 300, maxPrice: 600, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'grounding', labelKey: 'catalog.grounding', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'smart_home', labelKey: 'catalog.smartHome', descriptionKey: 'catalog.smartHomeDesc', iconName: 'Wifi', priceRange: { min: 80 },
        services: [
          { key: 'smart_switch', labelKey: 'catalog.smartSwitch', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'smart_thermostat', labelKey: 'catalog.smartThermostat', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'smart_lighting_system', labelKey: 'catalog.smartLightingSystem', basePrice: 200, maxPrice: 400, unit: 'set', unitLabelKey: 'catalog.unitSet' },
          { key: 'home_automation', labelKey: 'catalog.homeAutomation', basePrice: 100, maxPrice: 200, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
        ],
      },
    ],
  },
  {
    key: 'doors_locks', labelKey: 'catalog.doorsLocks', descriptionKey: 'catalog.doorsLocksDesc',
    iconName: 'DoorOpen', color: '#6366F1', minPrice: 25,
    subcategories: [
      { key: 'door_install', labelKey: 'catalog.doorInstallation', descriptionKey: 'catalog.doorInstallationDesc', iconName: 'DoorOpen', priceRange: { min: 60 },
        services: [
          { key: 'interior_door', labelKey: 'catalog.interiorDoor', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'entrance_door', labelKey: 'catalog.entranceDoor', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'sliding_door', labelKey: 'catalog.slidingDoor', basePrice: 200, maxPrice: 400, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'door_frame', labelKey: 'catalog.doorFrame', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'door_repair', labelKey: 'catalog.doorRepairSub', descriptionKey: 'catalog.doorRepairSubDesc', iconName: 'Wrench', priceRange: { min: 25 },
        services: [
          { key: 'hinge_repair', labelKey: 'catalog.hingeRepair', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'door_alignment', labelKey: 'catalog.doorAlignment', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'door_sealing', labelKey: 'catalog.doorSealing', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'peephole_install', labelKey: 'catalog.peepholeInstall', basePrice: 20, maxPrice: 40, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'locks', labelKey: 'catalog.locks', descriptionKey: 'catalog.locksDesc', iconName: 'Lock', priceRange: { min: 30 },
        services: [
          { key: 'lock_install', labelKey: 'catalog.lockInstall', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'lock_change', labelKey: 'catalog.lockChange', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'lock_repair', labelKey: 'catalog.lockRepairService', basePrice: 35, maxPrice: 70, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'smart_lock', labelKey: 'catalog.smartLock', basePrice: 120, maxPrice: 240, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'safe_install', labelKey: 'catalog.safeInstall', basePrice: 100, maxPrice: 200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'windows', labelKey: 'catalog.windowServices', descriptionKey: 'catalog.windowServicesDesc', iconName: 'Square', priceRange: { min: 30 },
        services: [
          { key: 'window_install', labelKey: 'catalog.windowInstall', basePrice: 150, maxPrice: 300, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'window_repair', labelKey: 'catalog.windowRepair', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'window_sealing', labelKey: 'catalog.windowSealing', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'mosquito_net', labelKey: 'catalog.mosquitoNet', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
    ],
  },
  {
    key: 'furniture', labelKey: 'catalog.furniture', descriptionKey: 'catalog.furnitureDesc',
    iconName: 'Sofa', color: '#10B981', minPrice: 30,
    subcategories: [
      { key: 'assembly', labelKey: 'catalog.assembly', descriptionKey: 'catalog.assemblyDesc', iconName: 'Package', priceRange: { min: 30 },
        services: [
          { key: 'wardrobe_assembly', labelKey: 'catalog.wardrobeAssembly', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'bed_assembly', labelKey: 'catalog.bedAssembly', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'desk_assembly', labelKey: 'catalog.deskAssembly', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'shelf_assembly', labelKey: 'catalog.shelfAssembly', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'kitchen_cabinet', labelKey: 'catalog.kitchenCabinet', basePrice: 100, maxPrice: 200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'tv_stand_assembly', labelKey: 'catalog.tvStandAssembly', basePrice: 35, maxPrice: 70, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'custom_furniture', labelKey: 'catalog.customFurniture', descriptionKey: 'catalog.customFurnitureDesc', iconName: 'Ruler', priceRange: { min: 200 },
        services: [
          { key: 'custom_wardrobe', labelKey: 'catalog.customWardrobe', basePrice: 800, maxPrice: 1600, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'custom_kitchen', labelKey: 'catalog.customKitchen', basePrice: 1500, maxPrice: 3000, unit: 'set', unitLabelKey: 'catalog.unitSet' },
          { key: 'custom_shelving', labelKey: 'catalog.customShelving', basePrice: 300, maxPrice: 600, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'custom_closet', labelKey: 'catalog.customCloset', basePrice: 600, maxPrice: 1200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'furniture_repair', labelKey: 'catalog.furnitureRepair', descriptionKey: 'catalog.furnitureRepairDesc', iconName: 'Wrench', priceRange: { min: 30 },
        services: [
          { key: 'door_hinge_repair', labelKey: 'catalog.doorHingeRepair', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'drawer_repair', labelKey: 'catalog.drawerRepair', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'upholstery_repair', labelKey: 'catalog.upholsteryRepair', basePrice: 100, maxPrice: 200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'surface_restoration', labelKey: 'catalog.surfaceRestoration', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'disassembly', labelKey: 'catalog.disassembly', descriptionKey: 'catalog.disassemblyDesc', iconName: 'Package', priceRange: { min: 30 },
        services: [
          { key: 'furniture_disassembly', labelKey: 'catalog.furnitureDisassembly', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'furniture_packing', labelKey: 'catalog.furniturePacking', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
    ],
  },
  {
    key: 'chemical_cleaning', labelKey: 'catalog.chemicalCleaning', descriptionKey: 'catalog.chemicalCleaningDesc',
    iconName: 'SprayCan', color: '#06B6D4', minPrice: 25,
    subcategories: [
      { key: 'upholstery', labelKey: 'catalog.upholsteryCleaning', descriptionKey: 'catalog.upholsteryCleaningDesc', iconName: 'Sofa', priceRange: { min: 25 },
        services: [
          { key: 'sofa_cleaning', labelKey: 'catalog.sofaCleaning', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'armchair_cleaning', labelKey: 'catalog.armchairCleaning', basePrice: 35, maxPrice: 70, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'mattress_cleaning', labelKey: 'catalog.mattressCleaning', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'chair_cleaning_chem', labelKey: 'catalog.chairCleaning', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'car_seat_cleaning', labelKey: 'catalog.carSeatCleaning', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
        addons: [stainProtectionAddon],
      },
      { key: 'carpet', labelKey: 'catalog.carpetCleaningSub', descriptionKey: 'catalog.carpetCleaningSubDesc', iconName: 'Layers', priceRange: { min: 10 },
        services: [
          { key: 'carpet_cleaning_service', labelKey: 'catalog.carpetCleaning', basePrice: 10, maxPrice: 20, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
          { key: 'rug_cleaning', labelKey: 'catalog.rugCleaning', basePrice: 15, maxPrice: 30, unit: 'sqm', unitLabelKey: 'catalog.unitSqm' },
          { key: 'carpet_stain_removal', labelKey: 'catalog.carpetStainRemoval', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
        addons: [stainProtectionAddon],
      },
      { key: 'curtains_cleaning', labelKey: 'catalog.curtainCleaningSub', descriptionKey: 'catalog.curtainCleaningSubDesc', iconName: 'Wind', priceRange: { min: 20 },
        services: [
          { key: 'curtain_cleaning_service', labelKey: 'catalog.curtainCleaning', basePrice: 20, maxPrice: 40, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'blind_cleaning', labelKey: 'catalog.blindCleaning', basePrice: 15, maxPrice: 30, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'curtain_steam', labelKey: 'catalog.curtainSteam', basePrice: 25, maxPrice: 50, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
    ],
  },
  {
    key: 'it_services', labelKey: 'catalog.itServices', descriptionKey: 'catalog.itServicesDesc',
    iconName: 'Laptop', color: '#2563EB', minPrice: 30,
    subcategories: [
      { key: 'computer', labelKey: 'catalog.computer', descriptionKey: 'catalog.computerDesc', iconName: 'Monitor', priceRange: { min: 30 },
        services: [
          { key: 'pc_setup', labelKey: 'catalog.pcSetup', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'pc_repair', labelKey: 'catalog.pcRepair', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'virus_removal', labelKey: 'catalog.virusRemoval', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'data_recovery', labelKey: 'catalog.dataRecovery', basePrice: 100, maxPrice: 200, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'os_install', labelKey: 'catalog.osInstall', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'network', labelKey: 'catalog.network', descriptionKey: 'catalog.networkDesc', iconName: 'Wifi', priceRange: { min: 30 },
        services: [
          { key: 'wifi_setup', labelKey: 'catalog.wifiSetup', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'router_install', labelKey: 'catalog.routerInstall', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'cable_management', labelKey: 'catalog.cableManagement', basePrice: 50, maxPrice: 100, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
          { key: 'network_troubleshoot', labelKey: 'catalog.networkTroubleshoot', basePrice: 60, maxPrice: 120, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
        ],
      },
      { key: 'smart_home_tech', labelKey: 'catalog.smartHomeTech', descriptionKey: 'catalog.smartHomeTechDesc', iconName: 'Wifi', priceRange: { min: 50 },
        services: [
          { key: 'smart_device_setup', labelKey: 'catalog.smartDeviceSetup', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'it_home_automation', labelKey: 'catalog.homeAutomation', basePrice: 100, maxPrice: 200, unit: 'hour', unitLabelKey: 'catalog.unitHour' },
          { key: 'security_camera', labelKey: 'catalog.securityCamera', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'intercom_install', labelKey: 'catalog.intercomInstall', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'peripheral', labelKey: 'catalog.peripheral', descriptionKey: 'catalog.peripheralDesc', iconName: 'Monitor', priceRange: { min: 30 },
        services: [
          { key: 'printer_setup', labelKey: 'catalog.printerSetup', basePrice: 30, maxPrice: 60, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'monitor_mount', labelKey: 'catalog.monitorMount', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'speaker_system', labelKey: 'catalog.speakerSystem', basePrice: 60, maxPrice: 120, unit: 'set', unitLabelKey: 'catalog.unitSet' },
        ],
      },
    ],
  },
  {
    key: 'heavy_lifting', labelKey: 'catalog.heavyLifting', descriptionKey: 'catalog.heavyLiftingDesc',
    iconName: 'Truck', color: '#D97706', minPrice: 50,
    subcategories: [
      { key: 'moving', labelKey: 'catalog.moving', descriptionKey: 'catalog.movingDesc', iconName: 'Truck', priceRange: { min: 80 },
        variants: movingVariants,
      },
      { key: 'delivery', labelKey: 'catalog.delivery', descriptionKey: 'catalog.deliveryDesc', iconName: 'Package', priceRange: { min: 30 },
        services: [
          { key: 'large_item_delivery', labelKey: 'catalog.largeItemDelivery', basePrice: 80, maxPrice: 160, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'appliance_delivery', labelKey: 'catalog.applianceDelivery', basePrice: 60, maxPrice: 120, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'construction_materials', labelKey: 'catalog.constructionMaterials', basePrice: 100, maxPrice: 200, unit: 'set', unitLabelKey: 'catalog.unitSet' },
          { key: 'furniture_delivery', labelKey: 'catalog.furnitureDelivery', basePrice: 70, maxPrice: 140, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
        ],
      },
      { key: 'disposal', labelKey: 'catalog.disposal', descriptionKey: 'catalog.disposalDesc', iconName: 'Trash2', priceRange: { min: 40 },
        services: [
          { key: 'debris_removal_hl', labelKey: 'catalog.debrisRemoval', basePrice: 100, maxPrice: 200, unit: 'room', unitLabelKey: 'catalog.unitRoom' },
          { key: 'furniture_disposal', labelKey: 'catalog.furnitureDisposal', basePrice: 50, maxPrice: 100, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'appliance_disposal', labelKey: 'catalog.applianceDisposal', basePrice: 40, maxPrice: 80, unit: 'piece', unitLabelKey: 'catalog.unitPiece' },
          { key: 'construction_waste', labelKey: 'catalog.constructionWaste', basePrice: 150, maxPrice: 300, unit: 'set', unitLabelKey: 'catalog.unitSet' },
        ],
      },
    ],
  },
];

// ─── Public export ─────────────────────────────────────────

export function buildSeedData() {
  const en = loadLocale('en');
  const ka = loadLocale('ka');
  const ru = loadLocale('ru');

  return SERVICE_CATALOG.map((cat, catIndex) => ({
    key: cat.key,
    label: lt(cat.labelKey, en, ka, ru),
    ...(cat.descriptionKey ? { description: lt(cat.descriptionKey, en, ka, ru) } : {}),
    iconName: cat.iconName,
    color: cat.color,
    minPrice: cat.minPrice,
    sortOrder: catIndex,
    isActive: true,
    subcategories: cat.subcategories.map((sub: any, subIndex: number) =>
      buildSubcategory(sub, en, ka, ru, subIndex),
    ),
  }));
}
