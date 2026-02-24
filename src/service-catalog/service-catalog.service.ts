import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ServiceCatalogCategory } from './schemas/service-catalog.schema';
import { UpdateCatalogCategoryDto } from './dto/update-catalog-category.dto';

@Injectable()
export class ServiceCatalogService {
  constructor(
    @InjectModel(ServiceCatalogCategory.name)
    private catalogModel: Model<ServiceCatalogCategory>,
  ) {}

  // === Public reads ===

  async findAll() {
    return this.catalogModel
      .find({ isActive: true })
      .sort({ sortOrder: 1 })
      .lean()
      .exec();
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

  async getVersion(): Promise<{ version: number }> {
    const latest = await this.catalogModel
      .findOne()
      .sort({ version: -1 })
      .select('version')
      .lean()
      .exec();
    return { version: latest?.version ?? 0 };
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
  ): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

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

    return { inserted, updated };
  }
}
