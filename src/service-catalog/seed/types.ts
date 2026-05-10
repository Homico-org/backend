/**
 * Plain-object seed types — mirror the persisted document shape but without
 * Mongoose-specific metadata. The seeder upserts these into the
 * `service_catalog_categories` collection.
 *
 * Variants were removed in the 2026-05 stabilization pass.
 */

export interface SeedLocalizedText {
  en: string;
  ka: string;
  ru: string;
}

export interface SeedUnitOption {
  id: string; // stable, e.g. "U01"
  key: string; // e.g. "per_sqm"
  unit: string; // ServiceUnit enum value
  label: SeedLocalizedText;
  defaultPrice: number;
  maxPrice?: number;
}

export type SeedPricingModel = 'fixed' | 'range' | 'from' | 'quote';
export type SeedServiceType =
  | 'installation'
  | 'repair'
  | 'maintenance'
  | 'consultation'
  | 'emergency'
  | 'recurring';

export interface SeedService {
  id: string; // stable, e.g. "V001"
  key: string;
  label: SeedLocalizedText;
  unitOptions: SeedUnitOption[];
  // Mirrored from unitOptions[0] for legacy consumers
  basePrice: number;
  maxPrice?: number;
  unit: string;
  unitLabel: SeedLocalizedText;

  // Optional flexibility fields (all backward-compatible)
  description?: SeedLocalizedText;
  priceRange?: { min: number; typical?: number; max: number };
  pricingModel?: SeedPricingModel;
  serviceType?: SeedServiceType;
  estimatedDurationMin?: number;
  estimatedDurationMax?: number;
  tags?: string[];
  keywords?: SeedLocalizedText[];
  imageUrl?: string;
}

export interface SeedSubcategory {
  id: string; // stable, e.g. "S001"
  key: string;
  label: SeedLocalizedText;
  iconName: string; // Lucide PascalCase name, e.g. "Sparkles"
  priceRange: { min: number; max?: number };
  sortOrder: number;
  isActive: boolean;
  services: SeedService[];
  addons: never[]; // reserved for future
  additionalServices: never[]; // reserved for future

  // Optional flexibility fields
  imageUrl?: string;
  tags?: string[];
  keywords?: SeedLocalizedText[];
}

export interface SeedCategory {
  id: string; // stable, e.g. "C01"
  key: string;
  label: SeedLocalizedText;
  iconName: string; // Lucide PascalCase name
  color: string; // 6-digit hex
  minPrice: number;
  sortOrder: number;
  isActive: boolean;
  subcategories: SeedSubcategory[];

  // Optional flexibility fields
  imageUrl?: string;
  tags?: string[];
  keywords?: SeedLocalizedText[];
}
