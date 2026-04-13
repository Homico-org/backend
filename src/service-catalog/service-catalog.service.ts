import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ServiceCatalogCategory } from './schemas/service-catalog.schema';
import { UpdateCatalogCategoryDto } from './dto/update-catalog-category.dto';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ServiceCatalogService {
  constructor(
    @InjectModel(ServiceCatalogCategory.name)
    private catalogModel: Model<ServiceCatalogCategory>,
    @InjectModel(User.name)
    private userModel: Model<User>,
  ) {}

  // === Public reads ===

  async findAll() {
    const categories = await this.catalogModel
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean()
      .exec();
    return categories.map((cat) => ({
      ...cat,
      subcategories: (cat.subcategories ?? []).filter(
        (sub) => sub.isActive !== false,
      ),
    }));
  }

  async findAllAdmin() {
    return this.catalogModel.find().sort({ sortOrder: 1 }).lean().exec();
  }

  async findByKey(key: string) {
    const category = await this.catalogModel.findOne({ key }).lean().exec();
    if (!category) {
      throw new NotFoundException(`Category "${key}" not found`);
    }
    return category;
  }

  async findBySubcategory(subcategoryKey: string) {
    const categories = await this.catalogModel
      .find({ isActive: true })
      .lean()
      .exec();

    const results: any[] = [];

    for (const cat of categories) {
      for (const sub of cat.subcategories ?? []) {
        if (sub.key !== subcategoryKey) continue;

        // Collect services directly on the subcategory
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

        // Collect services from variants
        for (const variant of sub.variants ?? []) {
          for (const svc of variant.services ?? []) {
            results.push({
              serviceKey: svc.key,
              label: svc.label,
              basePrice: svc.basePrice,
              maxPrice: svc.maxPrice,
              unit: svc.unit,
              unitLabel: svc.unitLabel,
              categoryKey: cat.key,
              subcategoryKey: sub.key,
              variantKey: variant.key,
            });
          }
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
      _id: (cat as any)._id || cat.key,
      key: cat.key,
      name: cat.label?.en || cat.key,
      nameKa: cat.label?.ka || cat.label?.en || cat.key,
      nameRu: cat.label?.ru || cat.label?.en || cat.key,
      description: cat.description?.en,
      descriptionKa: cat.description?.ka,
      icon: cat.key, // Use key for CategoryIcon mapping, not iconName
      keywords: [],
      isActive: cat.isActive ?? true,
      sortOrder: cat.sortOrder ?? 0,
      subcategories: (cat.subcategories || []).map((sub) => ({
        key: sub.key,
        name: sub.label?.en || sub.key,
        nameKa: sub.label?.ka || sub.label?.en || sub.key,
        nameRu: sub.label?.ru || sub.label?.en || sub.key,
        icon: sub.iconName,
        keywords: [],
        sortOrder: sub.sortOrder ?? 0,
        isActive: sub.isActive ?? true,
        children: [],
        services: [
          ...(sub.services || []),
          ...(sub.variants || []).flatMap((v) => v.services || []),
          ...(sub.additionalServices || []),
        ]
          .filter(
            (svc, i, arr) => arr.findIndex((s) => s.key === svc.key) === i,
          )
          .map((svc) => ({
            key: svc.key,
            name: svc.label?.en || svc.key,
            nameKa: svc.label?.ka || svc.label?.en || svc.key,
            nameRu: svc.label?.ru || svc.label?.en || svc.key,
            basePrice: svc.basePrice,
            maxPrice: svc.maxPrice,
            unit: svc.unit,
            unitName: svc.unitLabel?.en || svc.unit,
            unitNameKa: svc.unitLabel?.ka || svc.unitLabel?.en || svc.unit,
          })),
        variants: (sub.variants || []).map((v) => ({
          key: v.key,
          name: v.label?.en || v.key,
          nameKa: v.label?.ka || v.label?.en || v.key,
          services: (v.services || []).map((svc) => ({
            key: svc.key,
            name: svc.label?.en || svc.key,
            nameKa: svc.label?.ka || svc.label?.en || svc.key,
            nameRu: svc.label?.ru || svc.label?.en || svc.key,
            basePrice: svc.basePrice,
            maxPrice: svc.maxPrice,
            unit: svc.unit,
            unitName: svc.unitLabel?.en || svc.unit,
            unitNameKa: svc.unitLabel?.ka || svc.unitLabel?.en || svc.unit,
          })),
        })),
        priceRange: sub.priceRange,
      })),
    }));
  }

  async findAllAsCategoriesFlat() {
    const catalogs = await this.findAll();
    const flat: Array<Record<string, unknown>> = [];
    for (const cat of catalogs) {
      flat.push({
        key: cat.key,
        name: cat.label?.en || cat.key,
        nameKa: cat.label?.ka || cat.label?.en || cat.key,
        type: 'category',
      });
      for (const sub of cat.subcategories || []) {
        flat.push({
          key: sub.key,
          name: sub.label?.en || sub.key,
          nameKa: sub.label?.ka || sub.label?.en || sub.key,
          type: 'subcategory',
          parentKey: cat.key,
          icon: sub.iconName,
        });
      }
    }
    return flat;
  }

  // === Admin writes ===

  async create(dto: Record<string, unknown>) {
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
    subcategoryData: Record<string, unknown>,
  ) {
    // Try to update existing subcategory (merge fields instead of full replace)
    const setFields: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(subcategoryData)) {
      if (field === 'key') continue;
      setFields[`subcategories.$.${field}`] = value;
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

  // === Variant operations ===

  async upsertVariant(
    categoryKey: string,
    subKey: string,
    variantKey: string,
    variantData: Record<string, unknown>,
  ) {
    const category = await this.catalogModel
      .findOne({ key: categoryKey })
      .exec();
    if (!category) {
      throw new NotFoundException(`Category "${categoryKey}" not found`);
    }

    const subIndex = category.subcategories.findIndex(
      (s) => s.key === subKey,
    );
    if (subIndex === -1) {
      throw new NotFoundException(`Subcategory "${subKey}" not found`);
    }

    const variantIndex = category.subcategories[
      subIndex
    ].variants.findIndex((v) => v.key === variantKey);

    if (variantIndex >= 0) {
      const existing = category.subcategories[subIndex].variants[variantIndex];
      for (const [field, value] of Object.entries(variantData)) {
        if (field === 'key') continue;
        (existing as any)[field] = value;
      }
    } else {
      (category.subcategories[subIndex].variants as any).push({
        ...variantData,
        key: variantKey,
      });
    }

    category.version += 1;
    return category.save();
  }

  async removeVariant(
    categoryKey: string,
    subKey: string,
    variantKey: string,
  ) {
    const category = await this.catalogModel
      .findOne({ key: categoryKey })
      .exec();
    if (!category) {
      throw new NotFoundException(`Category "${categoryKey}" not found`);
    }

    const subIndex = category.subcategories.findIndex(
      (s) => s.key === subKey,
    );
    if (subIndex === -1) {
      throw new NotFoundException(`Subcategory "${subKey}" not found`);
    }

    category.subcategories[subIndex].variants = category.subcategories[
      subIndex
    ].variants.filter((v) => v.key !== variantKey) as any;
    category.version += 1;
    return category.save();
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
    const reordered: any[] = [];

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
    categories: Record<string, unknown>[],
  ): Promise<{ inserted: number; updated: number; removed: number }> {
    let inserted = 0;
    let updated = 0;

    const seedKeys = new Set(categories.map((c) => c.key as string));

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
    // Build valid keys from current catalog
    const validKeys = new Set<string>();
    const categories = await this.catalogModel.find({ isActive: true }).lean().exec();
    for (const cat of categories) {
      const c = cat as unknown as Record<string, unknown>;
      validKeys.add(c.key as string);
      for (const sub of ((c.subcategories as unknown[]) || [])) {
        const s = sub as Record<string, unknown>;
        validKeys.add(s.key as string);
        for (const svc of ((s.services as Record<string, string>[]) || [])) {
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
      const updates: Record<string, unknown> = {};

      if (pro.servicePricing?.length > 0) {
        const filtered = pro.servicePricing.filter(
          (sp) => validKeys.has(sp.serviceKey) || validKeys.has(sp.subcategoryKey),
        );
        if (filtered.length !== pro.servicePricing.length) {
          updates.servicePricing = filtered;
        }
      }

      if (pro.selectedServices?.length > 0) {
        const filtered = pro.selectedServices.filter(
          (ss) => validKeys.has(ss.key) || validKeys.has(ss.categoryKey),
        );
        if (filtered.length !== pro.selectedServices.length) {
          updates.selectedServices = filtered;
        }
      }

      if (pro.selectedCategories?.length > 0) {
        const filtered = pro.selectedCategories.filter((key: string) => validKeys.has(key));
        if (filtered.length !== pro.selectedCategories.length) {
          updates.selectedCategories = filtered;
        }
      }

      if (pro.selectedSubcategories?.length > 0) {
        const filtered = pro.selectedSubcategories.filter((key: string) => validKeys.has(key));
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
