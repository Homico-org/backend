import { Injectable, Inject, Logger, forwardRef } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AiService } from "../ai/ai.service";
import { ServiceCatalogService } from "../service-catalog/service-catalog.service";
import { Category } from "./schemas/category.schema";
import {
  CategoryDoc,
  FlatCategoryItem,
  SearchResult,
  SubcategoryDoc,
  SubSubcategoryDoc,
} from "./types/category.types";

export interface AiSearchResult {
  subcategories: { key: string; category: string }[];
  fromCache: boolean;
}

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);
  // In-memory cache: query+locale → { result, timestamp }
  private aiSearchCache = new Map<
    string,
    { result: AiSearchResult; ts: number }
  >();
  private readonly CACHE_TTL = 1000 * 60 * 60; // 1 hour

  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
    private readonly aiService: AiService,
    @Inject(forwardRef(() => ServiceCatalogService))
    private readonly serviceCatalogService: ServiceCatalogService,
  ) {}

  // Get all active categories with their subcategories
  async findAll(): Promise<CategoryDoc[]> {
    const categories = await this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .lean<CategoryDoc[]>()
      .exec();

    // Filter out inactive subcategories and sub-subcategories
    return categories.map((cat) => ({
      ...cat,
      subcategories: (cat.subcategories || [])
        .filter((sub) => sub.isActive !== false)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map((sub) => ({
          ...sub,
          children: (sub.children || [])
            .filter((child) => child.isActive !== false)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
        })),
    }));
  }

  // Get a single category by key
  async findByKey(key: string): Promise<CategoryDoc | null> {
    return this.categoryModel
      .findOne({ key, isActive: true })
      .lean<CategoryDoc>()
      .exec();
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
      .filter((sub) => sub.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Get sub-subcategories (children) for a specific subcategory
  async getSubSubcategories(
    categoryKey: string,
    subcategoryKey: string,
  ): Promise<SubSubcategoryDoc[]> {
    const category = await this.categoryModel
      .findOne({ key: categoryKey, isActive: true })
      .lean<CategoryDoc>()
      .exec();

    if (!category) return [];

    const subcategory = (category.subcategories || []).find(
      (sub) => sub.key === subcategoryKey && sub.isActive !== false,
    );

    if (!subcategory) return [];

    return (subcategory.children || [])
      .filter((child) => child.isActive !== false)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Search categories, subcategories, and sub-subcategories by keyword
  async search(query: string): Promise<SearchResult> {
    const searchRegex = new RegExp(query, "i");
    const categories = await this.categoryModel
      .find({ isActive: true })
      .lean<CategoryDoc[]>()
      .exec();

    const matchedCategories: CategoryDoc[] = [];
    const matchedSubcategories: {
      category: string;
      subcategory: SubcategoryDoc;
    }[] = [];
    const matchedSubSubcategories: {
      category: string;
      subcategory: string;
      subSubcategory: SubSubcategoryDoc;
    }[] = [];

    for (const cat of categories) {
      // Check category match
      if (
        searchRegex.test(cat.name) ||
        searchRegex.test(cat.nameKa) ||
        (cat.keywords || []).some((k) => searchRegex.test(k))
      ) {
        matchedCategories.push(cat);
      }

      // Check subcategory matches
      for (const sub of cat.subcategories || []) {
        if (sub.isActive === false) continue;

        if (
          searchRegex.test(sub.name) ||
          searchRegex.test(sub.nameKa) ||
          (sub.keywords || []).some((k) => searchRegex.test(k))
        ) {
          matchedSubcategories.push({ category: cat.key, subcategory: sub });
        }

        // Check sub-subcategory matches
        for (const child of sub.children || []) {
          if (child.isActive === false) continue;

          if (
            searchRegex.test(child.name) ||
            searchRegex.test(child.nameKa) ||
            (child.keywords || []).some((k) => searchRegex.test(k))
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
        type: "category",
        icon: cat.icon,
      });

      for (const sub of cat.subcategories || []) {
        flatList.push({
          key: sub.key,
          name: sub.name,
          nameKa: sub.nameKa,
          type: "subcategory",
          parentKey: cat.key,
          icon: sub.icon,
        });

        for (const child of sub.children || []) {
          flatList.push({
            key: child.key,
            name: child.name,
            nameKa: child.nameKa,
            type: "subsubcategory",
            parentKey: cat.key,
            parentSubKey: sub.key,
            icon: child.icon,
          });
        }
      }
    }

    return flatList;
  }

  // AI-powered semantic search: maps user query to matching subcategory keys
  async aiSearch(
    query: string,
    locale: string = "en",
  ): Promise<AiSearchResult> {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return { subcategories: [], fromCache: false };
    }

    // Check cache
    const cacheKey = `${trimmed.toLowerCase()}:${locale}`;
    const cached = this.aiSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return { ...cached.result, fromCache: true };
    }

    // Build compact service catalog for the prompt (from Service Catalog, not old Categories DB)
    const catalogCategories = await this.serviceCatalogService.findAllAsCategories();
    const categoryLines: string[] = [];
    for (const cat of catalogCategories) {
      for (const sub of cat.subcategories || []) {
        const services = sub.services || [];
        if (services.length > 0) {
          for (const svc of services) {
            categoryLines.push(
              `${cat.key}/${sub.key}/${svc.key}: ${svc.name} (${svc.nameKa})`,
            );
          }
        } else {
          categoryLines.push(
            `${cat.key}/${sub.key}: ${sub.name} (${sub.nameKa})`,
          );
        }
      }
    }

    try {
      const response = await this.aiService.completionRaw({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: `You match user search queries to home services. Reply ONLY with matching keys from the list below, comma-separated. Use the most specific level available (service > subcategory). If no match, reply "none".\n\nServices:\n${categoryLines.join("\n")}`,
          },
          {
            role: "user",
            content: trimmed,
          },
        ],
      });

      const text = response.trim();
      if (text === "none" || !text) {
        const result: AiSearchResult = { subcategories: [], fromCache: false };
        this.aiSearchCache.set(cacheKey, { result, ts: Date.now() });
        return result;
      }

      const pairs = text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const subcategories = pairs
        .map((pair) => {
          const parts = pair.split("/").map(p => p.trim());
          if (parts.length >= 3) {
            // category/subcategory/service — return service key
            return { category: parts[0], key: parts[2] };
          } else if (parts.length === 2) {
            // category/subcategory
            return { category: parts[0], key: parts[1] };
          }
          return null;
        })
        .filter((v): v is { category: string; key: string } => v !== null);

      const result: AiSearchResult = { subcategories, fromCache: false };
      this.aiSearchCache.set(cacheKey, { result, ts: Date.now() });
      return result;
    } catch (err) {
      this.logger.warn(`AI search failed for "${trimmed}": ${err}`);
      return { subcategories: [], fromCache: false };
    }
  }
}
