import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CatalogSubcategory,
  PricingModel,
  ServiceCatalogCategory,
  ServiceType,
  ServiceUnit,
} from './schemas/service-catalog.schema';
import { CreateCatalogCategoryDto } from './dto/create-catalog-category.dto';
import {
  UpdateCatalogCategoryDto,
  UpsertSubcategoryDto,
} from './dto/update-catalog-category.dto';
import { User } from '../users/schemas/user.schema';
import type { SeedCategory } from './seed/types';

// === Read-shape contracts ===
//
// These mirror the lean Mongoose document shape we hand to API consumers.
// They are kept here (not re-exported from the schema) so changes to the
// internal schema don't accidentally break the legacy `as-categories`
// response wire format.

export interface LeanLocalizedText {
  en: string;
  ka: string;
  ru: string;
}

export interface LeanUnitOption {
  id?: string;
  key: string;
  unit: ServiceUnit;
  label: LeanLocalizedText;
  defaultPrice: number;
  maxPrice?: number;
}

export interface LeanService {
  id?: string;
  key: string;
  label: LeanLocalizedText;
  description?: LeanLocalizedText;
  basePrice: number;
  maxPrice?: number;
  unit: ServiceUnit;
  unitLabel: LeanLocalizedText;
  unitOptions?: LeanUnitOption[];
  priceRange?: { min: number; typical?: number; max: number };
  pricingModel?: PricingModel;
  serviceType?: ServiceType;
  estimatedDurationMin?: number;
  estimatedDurationMax?: number;
  tags?: string[];
  keywords?: LeanLocalizedText[];
  imageUrl?: string;
}

export interface LeanSubcategory {
  id?: string;
  key: string;
  label: LeanLocalizedText;
  description?: LeanLocalizedText;
  iconName: string;
  imageUrl?: string;
  priceRange?: { min: number; max?: number };
  sortOrder?: number;
  isActive?: boolean;
  services?: LeanService[];
  additionalServices?: LeanService[];
  tags?: string[];
  keywords?: LeanLocalizedText[];
}

export interface LeanCategory {
  _id?: Types.ObjectId | string;
  id?: string;
  key: string;
  label: LeanLocalizedText;
  description?: LeanLocalizedText;
  iconName: string;
  color: string;
  minPrice: number;
  sortOrder?: number;
  isActive?: boolean;
  subcategories?: LeanSubcategory[];
  imageUrl?: string;
  tags?: string[];
  keywords?: LeanLocalizedText[];
}

// Public response row for `findBySubcategory` — flat shape used by ordering UI.
export interface FindBySubcategoryRow {
  serviceKey: string;
  label: LeanLocalizedText;
  basePrice: number;
  maxPrice?: number;
  unit: ServiceUnit;
  unitLabel: LeanLocalizedText;
  categoryKey: string;
  subcategoryKey: string;
}

// Flat aggregator row (category OR subcategory) for dropdowns.
export interface FlatCatalogRow {
  key: string;
  name: string;
  nameKa: string;
  type: 'category' | 'subcategory';
  parentKey?: string;
  icon?: string;
}

// Mongoose `$set` accepts dot-notation paths to nested array fields. The keys
// can't be statically derived (they're built from DTO entries at runtime), but
// the values are constrained to the source DTO's value union.
type MongoDotPathSet<TSrc> = {
  [path: string]: TSrc[keyof TSrc];
};

// Subset of User fields the catalog cleanup pass may rewrite. Typing this
// explicitly avoids `Record<string, unknown>` and keeps the writes type-safe.
type UserCleanupUpdate = Partial<
  Pick<
    User,
    | 'servicePricing'
    | 'selectedServices'
    | 'selectedCategories'
    | 'selectedSubcategories'
  >
>;

@Injectable()
export class ServiceCatalogService {
  constructor(
    @InjectModel(ServiceCatalogCategory.name)
    private catalogModel: Model<ServiceCatalogCategory>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  // === Public reads ===

  async findAll(): Promise<LeanCategory[]> {
    const categories = await this.catalogModel
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean<LeanCategory[]>()
      .exec();
    return categories.map((cat) => ({
      ...cat,
      subcategories: (cat.subcategories ?? []).filter(
        (sub) => sub.isActive !== false,
      ),
    }));
  }

  async findAllAdmin(): Promise<LeanCategory[]> {
    return this.catalogModel
      .find()
      .sort({ sortOrder: 1 })
      .lean<LeanCategory[]>()
      .exec();
  }

  async findByKey(key: string) {
    const category = await this.catalogModel.findOne({ key }).lean().exec();
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return category;
  }

  async findBySubcategory(
    subcategoryKey: string,
  ): Promise<FindBySubcategoryRow[]> {
    const categories = await this.catalogModel
      .find({ isActive: true })
      .lean<LeanCategory[]>()
      .exec();

    const results: FindBySubcategoryRow[] = [];

    for (const cat of categories) {
      for (const sub of cat.subcategories ?? []) {
        if (sub.key !== subcategoryKey) continue;
        for (const svc of sub.services ?? []) {
          results.push({
            serviceKey: svc.key,
            label: svc.label,
            basePrice: svc.basePrice,
            maxPrice: svc.maxPrice,
            unit: svc.unit,
            unitLabel: svc.unitLabel,
            categoryKey: cat.key,
            subcategoryKey: sub.key,
          });
        }
      }
    }

    return results;
  }

  async getVersion(): Promise<{ version: number }> {
    const latest = await this.catalogModel
      .findOne()
      .sort({ version: -1 })
      .select('version')
      .lean()
      .exec();
    return { version: latest?.version ?? 0 };
  }

  // === Compatibility endpoints (old Categories API shape) ===

  async findAllAsCategories() {
    const catalogs = await this.findAll();
    return catalogs.map((cat) => ({
      _id: cat._id?.toString() ?? cat.key,
      id: cat.id,
      key: cat.key,
      name: cat.label?.en ?? cat.key,
      nameKa: cat.label?.ka ?? cat.label?.en ?? cat.key,
      nameRu: cat.label?.ru ?? cat.label?.en ?? cat.key,
      description: cat.description?.en,
      descriptionKa: cat.description?.ka,
      icon: cat.key, // Use key for CategoryIcon mapping, not iconName
      // Brand color per category — drives icon backplates and accent strips
      // throughout the UI. Defined in the seed (e.g. "#3B82F6" for plumbing).
      color: cat.color,
      minPrice: cat.minPrice,
      keywords: cat.keywords ?? [],
      isActive: cat.isActive ?? true,
      sortOrder: cat.sortOrder ?? 0,
      // Optional flexibility fields (added 2026-05)
      imageUrl: cat.imageUrl,
      tags: cat.tags,
      subcategories: (cat.subcategories ?? []).map((sub) => ({
        id: sub.id,
        key: sub.key,
        name: sub.label?.en ?? sub.key,
        nameKa: sub.label?.ka ?? sub.label?.en ?? sub.key,
        nameRu: sub.label?.ru ?? sub.label?.en ?? sub.key,
        icon: sub.iconName,
        keywords: sub.keywords ?? [],
        sortOrder: sub.sortOrder ?? 0,
        isActive: sub.isActive ?? true,
        children: [],
        // Optional flexibility fields
        imageUrl: sub.imageUrl,
        tags: sub.tags,
        description: sub.description,
        services: [
          ...(sub.services ?? []),
          ...(sub.additionalServices ?? []),
        ]
          .filter(
            (svc, i, arr) => arr.findIndex((s) => s.key === svc.key) === i,
          )
          .map((svc) => {
            const primary = svc.unitOptions?.[0];
            return {
              id: svc.id,
              key: svc.key,
              name: svc.label?.en ?? svc.key,
              nameKa: svc.label?.ka ?? svc.label?.en ?? svc.key,
              nameRu: svc.label?.ru ?? svc.label?.en ?? svc.key,
              // Backward compat: primary unit from unitOptions[0] or legacy fields
              basePrice: primary?.defaultPrice ?? svc.basePrice,
              maxPrice: primary?.maxPrice ?? svc.maxPrice,
              unit: primary?.unit ?? svc.unit,
              unitName: primary?.label?.en ?? svc.unitLabel?.en ?? svc.unit,
              unitNameKa: primary?.label?.ka ?? svc.unitLabel?.ka ?? svc.unit,
              // Multi-unit options
              unitOptions: (svc.unitOptions ?? []).map((uo) => ({
                id: uo.id,
                key: uo.key,
                unit: uo.unit,
                label: {
                  en: uo.label?.en ?? '',
                  ka: uo.label?.ka ?? '',
                  ru: uo.label?.ru ?? '',
                },
                defaultPrice: uo.defaultPrice,
                maxPrice: uo.maxPrice,
              })),
              // Optional flexibility fields — passed through verbatim. UI
              // consumers can ignore them; old documents have them as undefined.
              description: svc.description,
              priceRange: svc.priceRange,
              pricingModel: svc.pricingModel,
              serviceType: svc.serviceType,
              estimatedDurationMin: svc.estimatedDurationMin,
              estimatedDurationMax: svc.estimatedDurationMax,
              tags: svc.tags,
              keywords: svc.keywords,
              imageUrl: svc.imageUrl,
            };
          }),
        priceRange: sub.priceRange,
      })),
    }));
  }

  async findAllAsCategoriesFlat(): Promise<FlatCatalogRow[]> {
    const catalogs = await this.findAll();
    const flat: FlatCatalogRow[] = [];
    for (const cat of catalogs) {
      flat.push({
        key: cat.key,
        name: cat.label?.en ?? cat.key,
        nameKa: cat.label?.ka ?? cat.label?.en ?? cat.key,
        type: 'category',
      });
      for (const sub of cat.subcategories ?? []) {
        flat.push({
          key: sub.key,
          name: sub.label?.en ?? sub.key,
          nameKa: sub.label?.ka ?? sub.label?.en ?? sub.key,
          type: 'subcategory',
          parentKey: cat.key,
          icon: sub.iconName,
        });
      }
    }
    return flat;
  }

  // === Admin writes ===

  async create(
    dto: CreateCatalogCategoryDto,
  ): Promise<ServiceCatalogCategory> {
    const category = new this.catalogModel({
      ...dto,
      version: 1,
    });
    return category.save();
  }

  async update(key: string, dto: UpdateCatalogCategoryDto) {
    const category = await this.catalogModel
      .findOneAndUpdate(
        { key },
        { $set: dto, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return category;
  }

  async softDelete(key: string) {
    const category = await this.catalogModel
      .findOneAndUpdate(
        { key },
        { $set: { isActive: false }, $inc: { version: 1 } },
        { new: true },
      )
      .exec();
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return category;
  }

  async hardDelete(key: string): Promise<void> {
    const result = await this.catalogModel.deleteOne({ key }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
  }

  // === Subcategory operations ===

  async upsertSubcategory(
    categoryKey: string,
    subKey: string,
    subcategoryData: UpsertSubcategoryDto,
  ) {
    // Translate the DTO into Mongoose dot-notation positional updates so we
    // can patch a single field on the matched subcategory without rewriting
    // the whole array. Keys generate at runtime — typed via `MongoDotPathSet`.
    const setFields: MongoDotPathSet<UpsertSubcategoryDto> = {};
    for (const field of Object.keys(subcategoryData) as (keyof UpsertSubcategoryDto)[]) {
      if (field === 'key') continue;
      setFields[`subcategories.$.${String(field)}`] = subcategoryData[field];
    }

    const updated = Object.keys(setFields).length > 0
      ? await this.catalogModel
          .findOneAndUpdate(
            { key: categoryKey, 'subcategories.key': subKey },
            {
              $set: setFields,
              $inc: { version: 1 },
            },
            { new: true },
          )
          .exec()
      : null;

    if (updated) return updated;

    // Insert new subcategory
    const inserted = await this.catalogModel
      .findOneAndUpdate(
        { key: categoryKey },
        {
          $push: { subcategories: { ...subcategoryData, key: subKey } },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();

    if (!inserted) {
      throw new NotFoundException(`Category "${categoryKey}" not found`);
    }
    return inserted;
  }

  async removeSubcategory(categoryKey: string, subKey: string) {
    const category = await this.catalogModel
      .findOneAndUpdate(
        { key: categoryKey },
        {
          $pull: { subcategories: { key: subKey } },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .exec();
    if (!category) {
      throw new NotFoundException(`Category "${categoryKey}" not found`);
    }
    return category;
  }

  // === Reorder ===

  async reorderCategories(orderedKeys: string[]) {
    const categories = await this.catalogModel.find().exec();
    const catMap = new Map(categories.map((c) => [c.key, c]));

    for (let i = 0; i < orderedKeys.length; i++) {
      const cat = catMap.get(orderedKeys[i]);
      if (cat) {
        cat.sortOrder = i;
        await cat.save();
      }
    }

    return { success: true };
  }

  async reorderSubcategories(categoryKey: string, orderedKeys: string[]) {
    const category = await this.catalogModel
      .findOne({ key: categoryKey })
      .exec();
    if (!category) {
      throw new NotFoundException(`Category "${categoryKey}" not found`);
    }

    const subMap = new Map(
      category.subcategories.map((s) => [s.key, s]),
    );
    const reordered: CatalogSubcategory[] = [];

    orderedKeys.forEach((key, index) => {
      const sub = subMap.get(key);
      if (sub) {
        sub.sortOrder = index;
        reordered.push(sub);
      }
    });

    // Append any subcategories not in the ordered list
    for (const sub of category.subcategories) {
      if (!orderedKeys.includes(sub.key)) {
        reordered.push(sub);
      }
    }

    category.subcategories = reordered;
    category.version += 1;
    return category.save();
  }

  // === Seed ===

  async seed(
    categories: SeedCategory[],
  ): Promise<{ inserted: number; updated: number; removed: number }> {
    let inserted = 0;
    let updated = 0;

    // Walk the tree and ensure every stable id (category, subcategory, service)
    // is unique across the whole catalog. Pros and jobs persist selections by
    // id — duplicates would silently corrupt user data. Unit option ids
    // (U01..U17) are intentionally shared across services.
    const seenIds = new Map<string, string>();
    const claim = (id: string | undefined, where: string): void => {
      if (!id) return;
      const prior = seenIds.get(id);
      if (prior) {
        throw new BadRequestException(
          `Duplicate catalog id "${id}": already used at ${prior}, again at ${where}`,
        );
      }
      seenIds.set(id, where);
    };
    for (const cat of categories) {
      claim(cat.id, `category ${cat.key}`);
      for (const sub of cat.subcategories ?? []) {
        claim(sub.id, `subcategory ${cat.key}/${sub.key}`);
        for (const svc of sub.services ?? []) {
          claim(svc.id, `service ${cat.key}/${sub.key}/${svc.key}`);
        }
      }
    }

    const seedKeys = new Set(categories.map((c) => c.key));

    for (let i = 0; i < categories.length; i++) {
      const dto = categories[i];
      const existing = await this.catalogModel
        .findOne({ key: dto.key })
        .exec();

      if (existing) {
        await this.catalogModel.updateOne(
          { key: dto.key },
          {
            $set: { ...dto, sortOrder: i },
            $inc: { version: 1 },
          },
        );
        updated++;
      } else {
        await this.catalogModel.create({
          ...dto,
          sortOrder: i,
          version: 1,
        });
        inserted++;
      }
    }

    // Remove categories not in the new seed
    const result = await this.catalogModel.deleteMany({
      key: { $nin: Array.from(seedKeys) },
    });
    const removed = result.deletedCount || 0;

    return { inserted, updated, removed };
  }

  async cleanupUserServices(): Promise<{ checked: number; updated: number }> {
    // Build the set of valid keys from the current catalog (categories,
    // subcategories, and services). Pros referencing anything outside this
    // set get those entries pruned.
    const validKeys = new Set<string>();
    const categories = await this.catalogModel
      .find({ isActive: true })
      .lean<LeanCategory[]>()
      .exec();
    for (const cat of categories) {
      validKeys.add(cat.key);
      for (const sub of cat.subcategories ?? []) {
        validKeys.add(sub.key);
        for (const svc of sub.services ?? []) {
          validKeys.add(svc.key);
        }
      }
    }

    const pros = await this.userModel.find({
      role: 'pro',
      $or: [
        { 'servicePricing.0': { $exists: true } },
        { 'selectedServices.0': { $exists: true } },
      ],
    }).exec();

    let updated = 0;
    for (const pro of pros) {
      const updates: UserCleanupUpdate = {};

      if (pro.servicePricing && pro.servicePricing.length > 0) {
        const filtered = pro.servicePricing.filter(
          (sp) => validKeys.has(sp.serviceKey) || validKeys.has(sp.subcategoryKey),
        );
        if (filtered.length !== pro.servicePricing.length) {
          updates.servicePricing = filtered;
        }
      }

      if (pro.selectedServices && pro.selectedServices.length > 0) {
        const filtered = pro.selectedServices.filter(
          (ss) => validKeys.has(ss.key) || validKeys.has(ss.categoryKey),
        );
        if (filtered.length !== pro.selectedServices.length) {
          updates.selectedServices = filtered;
        }
      }

      if (pro.selectedCategories && pro.selectedCategories.length > 0) {
        const filtered = pro.selectedCategories.filter((key) => validKeys.has(key));
        if (filtered.length !== pro.selectedCategories.length) {
          updates.selectedCategories = filtered;
        }
      }

      if (pro.selectedSubcategories && pro.selectedSubcategories.length > 0) {
        const filtered = pro.selectedSubcategories.filter((key) => validKeys.has(key));
        if (filtered.length !== pro.selectedSubcategories.length) {
          updates.selectedSubcategories = filtered;
        }
      }

      if (Object.keys(updates).length > 0) {
        await this.userModel.updateOne({ _id: pro._id }, { $set: updates });
        updated++;
      }
    }

    return { checked: pros.length, updated };
  }
}
