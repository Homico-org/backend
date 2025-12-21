import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from './schemas/category.schema';
import {
  CategoryDoc,
  SubcategoryDoc,
  SubSubcategoryDoc,
  FlatCategoryItem,
  SearchResult,
} from './types/category.types';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
  ) {}

  // Get all active categories with their subcategories
  async findAll(): Promise<CategoryDoc[]> {
    const categories = await this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean<CategoryDoc[]>()
      .exec();

    // Filter out inactive subcategories and sub-subcategories
    return categories.map(cat => ({
      ...cat,
      subcategories: (cat.subcategories || [])
        .filter(sub => sub.isActive !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(sub => ({
          ...sub,
          children: (sub.children || [])
            .filter(child => child.isActive !== false)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
        })),
    }));
  }

  // Get a single category by key
  async findByKey(key: string): Promise<CategoryDoc | null> {
    return this.categoryModel.findOne({ key, isActive: true }).lean<CategoryDoc>().exec();
  }

  // Get multiple categories by keys
  async findByKeys(keys: string[]): Promise<CategoryDoc[]> {
    return this.categoryModel
      .find({ key: { $in: keys }, isActive: true })
      .lean<CategoryDoc[]>()
      .exec();
  }

  // Get subcategories for a specific category
  async getSubcategories(categoryKey: string): Promise<SubcategoryDoc[]> {
    const category = await this.categoryModel
      .findOne({ key: categoryKey, isActive: true })
      .lean<CategoryDoc>()
      .exec();

    if (!category) return [];

    return (category.subcategories || [])
      .filter(sub => sub.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Get sub-subcategories (children) for a specific subcategory
  async getSubSubcategories(categoryKey: string, subcategoryKey: string): Promise<SubSubcategoryDoc[]> {
    const category = await this.categoryModel
      .findOne({ key: categoryKey, isActive: true })
      .lean<CategoryDoc>()
      .exec();

    if (!category) return [];

    const subcategory = (category.subcategories || []).find(
      sub => sub.key === subcategoryKey && sub.isActive !== false
    );

    if (!subcategory) return [];

    return (subcategory.children || [])
      .filter(child => child.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Search categories, subcategories, and sub-subcategories by keyword
  async search(query: string): Promise<SearchResult> {
    const searchRegex = new RegExp(query, 'i');
    const categories = await this.categoryModel
      .find({ isActive: true })
      .lean<CategoryDoc[]>()
      .exec();

    const matchedCategories: CategoryDoc[] = [];
    const matchedSubcategories: { category: string; subcategory: SubcategoryDoc }[] = [];
    const matchedSubSubcategories: { category: string; subcategory: string; subSubcategory: SubSubcategoryDoc }[] = [];

    for (const cat of categories) {
      // Check category match
      if (
        searchRegex.test(cat.name) ||
        searchRegex.test(cat.nameKa) ||
        (cat.keywords || []).some(k => searchRegex.test(k))
      ) {
        matchedCategories.push(cat);
      }

      // Check subcategory matches
      for (const sub of cat.subcategories || []) {
        if (sub.isActive === false) continue;

        if (
          searchRegex.test(sub.name) ||
          searchRegex.test(sub.nameKa) ||
          (sub.keywords || []).some(k => searchRegex.test(k))
        ) {
          matchedSubcategories.push({ category: cat.key, subcategory: sub });
        }

        // Check sub-subcategory matches
        for (const child of sub.children || []) {
          if (child.isActive === false) continue;

          if (
            searchRegex.test(child.name) ||
            searchRegex.test(child.nameKa) ||
            (child.keywords || []).some(k => searchRegex.test(k))
          ) {
            matchedSubSubcategories.push({
              category: cat.key,
              subcategory: sub.key,
              subSubcategory: child,
            });
          }
        }
      }
    }

    return {
      categories: matchedCategories,
      subcategories: matchedSubcategories,
      subSubcategories: matchedSubSubcategories,
    };
  }

  // Flatten all categories into a simple list for dropdowns
  async getFlatList(): Promise<FlatCategoryItem[]> {
    const categories = await this.findAll();
    const flatList: FlatCategoryItem[] = [];

    for (const cat of categories) {
      flatList.push({
        key: cat.key,
        name: cat.name,
        nameKa: cat.nameKa,
        type: 'category',
        icon: cat.icon,
      });

      for (const sub of cat.subcategories || []) {
        flatList.push({
          key: sub.key,
          name: sub.name,
          nameKa: sub.nameKa,
          type: 'subcategory',
          parentKey: cat.key,
          icon: sub.icon,
        });

        for (const child of sub.children || []) {
          flatList.push({
            key: child.key,
            name: child.name,
            nameKa: child.nameKa,
            type: 'subsubcategory',
            parentKey: cat.key,
            parentSubKey: sub.key,
            icon: child.icon,
          });
        }
      }
    }

    return flatList;
  }
}
