import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { CategoriesService } from '../categories/categories.service';
import { ServiceCatalogService } from '../service-catalog/service-catalog.service';
import { ReviewService } from '../review/review.service';
import { CURRENCY_BY_COUNTRY, DEFAULT_COUNTRY, type CountryCode } from '../common/countries';

function currencyForCountry(country?: string | null): string {
  if (!country) return CURRENCY_BY_COUNTRY[DEFAULT_COUNTRY];
  const code = country.toUpperCase() as CountryCode;
  return CURRENCY_BY_COUNTRY[code] ?? CURRENCY_BY_COUNTRY[DEFAULT_COUNTRY];
}
import {
  ProfessionalCardData,
  CategoryItem,
  ReviewItem,
  PriceInfo,
  FeatureExplanation,
  RichContent,
  RichContentType,
} from './dto/rich-content.dto';
import {
  KNOWLEDGE_BASE,
  FeatureKey,
  getFeatureExplanation,
} from './knowledge-base';

export interface SearchProfessionalsParams {
  category?: string;
  subcategory?: string;
  /** Specific service key, e.g. "drain-cleaning". Most queries use category instead. */
  serviceKey?: string;
  /** District/city name for location filtering. */
  serviceArea?: string;
  /** YYYY-MM-DD when the user needs the service. */
  scheduledDate?: string;
  /** Language codes the pro must speak (any-of match). */
  languages?: string[];
  minRating?: number;
  maxPrice?: number;
  minPrice?: number;
  /** When true, return only Premium pros. */
  premiumOnly?: boolean;
  /** When true, return only Homico Partners (bookable pros). */
  partnersOnly?: boolean;
  sort?: 'rating' | 'reviews' | 'price-low' | 'price-high' | 'newest';
  limit?: number;
  locale?: 'en' | 'ka' | 'ru';
}

export interface GetProfessionalReviewsParams {
  proId: string;
  limit?: number;
}

@Injectable()
export class AiToolsService {
  constructor(
    private usersService: UsersService,
    private categoriesService: CategoriesService,
    private serviceCatalogService: ServiceCatalogService,
    private reviewService: ReviewService,
  ) {}

  /**
   * The live service catalog in the SAME shape the legacy CategoriesService
   * returned ({ key, name, nameKa, nameRu, icon, subcategories, keywords }).
   * The chatbot must resolve categories against THIS (servicecatalogcategories
   * — what pros and the public listing use), not the stale legacy `categories`
   * collection, or category searches silently return zero.
   */
  private async catalogCategories(): Promise<any[]> {
    return this.serviceCatalogService.findAllAsCategories();
  }

  /**
   * Search for professionals based on criteria
   */
  async searchProfessionals(
    params: SearchProfessionalsParams,
  ): Promise<RichContent> {
    const {
      category,
      subcategory,
      serviceKey,
      serviceArea,
      scheduledDate,
      languages,
      minRating,
      maxPrice,
      minPrice,
      premiumOnly,
      partnersOnly,
      sort,
      limit = 5,
      locale = 'en',
    } = params;

    const filters: any = {
      limit,
      page: 1,
    };

    // Intelligently determine if 'category' is a top-level category or a subcategory
    if (category) {
      const categoryInfo = await this.resolveCategory(category, locale);
      if (categoryInfo.isTopLevel) {
        filters.category = categoryInfo.categoryKey;
      } else if (categoryInfo.subcategoryKey) {
        // It's a subcategory - search by subcategory instead
        filters.subcategory = categoryInfo.subcategoryKey;
      } else {
        // Try as subcategory directly (fallback)
        filters.subcategory = category;
      }
    }

    if (subcategory) {
      // Allow localized / free-text subcategory (e.g. "არქიტექტორი") and resolve it to a key when possible
      const subInfo = await this.resolveCategory(subcategory, locale);
      filters.subcategory = subInfo.subcategoryKey || subcategory;
      if (!filters.category && subInfo.categoryKey) {
        filters.category = subInfo.categoryKey;
      }
    }
    if (minRating) filters.minRating = minRating;
    if (maxPrice) filters.maxPrice = maxPrice;
    if (minPrice) filters.minPrice = minPrice;
    if (premiumOnly) filters.premiumOnly = true;
    if (partnersOnly) filters.partnersOnly = true;
    if (sort) filters.sort = sort;

    // New AI-search filters (added 2026-05). All optional - the model
    // emits them only when the user mentions the corresponding signal.
    if (serviceKey && /^[a-z0-9][a-z0-9_-]*$/i.test(serviceKey)) {
      filters.serviceKey = serviceKey;
    }
    if (serviceArea && serviceArea.trim()) {
      // Keep the value as-is; findAllPros matches against serviceAreas[]
      // which is an array of district name strings.
      filters.serviceArea = serviceArea.trim();
    }
    if (scheduledDate && /^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      filters.scheduledDate = scheduledDate;
    }
    if (languages && Array.isArray(languages) && languages.length > 0) {
      // Only accept known language codes - silently drop anything else
      // so a hallucinated "fr" doesn't return zero results.
      const valid = languages.filter((l) =>
        ['en', 'ka', 'ru'].includes(l),
      );
      if (valid.length > 0) filters.languages = valid;
    }

    const result = await this.usersService.findAllPros(filters);

    const professionals: ProfessionalCardData[] = result.data.map((pro: any) => {
      // Get the primary category name
      let primaryCategory = '';
      let primaryCategoryKa = '';
      if (pro.categories && pro.categories.length > 0) {
        primaryCategory = pro.categories[0];
        primaryCategoryKa = pro.categories[0]; // Will be resolved below
      }

      return {
        id: pro._id.toString(),
        uid: pro.uid,
        name: pro.name || 'Professional',
        avatar: pro.avatar,
        title: pro.title,
        isVerified: pro.verificationStatus === 'verified',
        isPremium: pro.isPremium || false,
        avgRating: pro.avgRating || 0,
        totalReviews: pro.totalReviews || 0,
        primaryCategory,
        primaryCategoryKa,
        priceRange: pro.basePrice
          ? {
              min: pro.basePrice,
              max: pro.maxPrice,
              model: this.normalizePricingModel(pro.pricingModel),
              currency: pro.currency || 'GEL',
            }
          : undefined,
        portfolioCount: (pro as any).portfolioItemCount || pro.portfolioProjects?.length || 0,
        completedJobs: (pro.completedJobs || 0) + (pro.externalCompletedJobs || 0),
        profileUrl: `/professionals/${pro.uid}`,
      };
    });

    // Resolve category names
    if (professionals.length > 0) {
      const categoryKeys = new Set(professionals.map((p) => p.primaryCategory));
      const all = await this.catalogCategories();
      const categoryMap = new Map(
        all
          .filter((c: any) => categoryKeys.has(c.key))
          .map((c: any) => [c.key, c]),
      );

      professionals.forEach((pro) => {
        const cat = categoryMap.get(pro.primaryCategory);
        if (cat) {
          pro.primaryCategory = cat.name;
          pro.primaryCategoryKa = cat.nameKa;
        }
      });
    }

    return {
      type: RichContentType.PROFESSIONAL_LIST,
      data: professionals,
    };
  }

  /**
   * Get details for a specific professional
   */
  async getProfessionalDetails(proId: string): Promise<RichContent | null> {
    try {
      const pro = await this.usersService.findProById(proId);
      if (!pro) return null;

      let primaryCategory = '';
      let primaryCategoryKa = '';
      if (pro.categories && pro.categories.length > 0) {
        const all = await this.catalogCategories();
        const cat = all.find((c: any) => c.key === pro.categories[0]);
        if (cat) {
          primaryCategory = cat.name;
          primaryCategoryKa = cat.nameKa;
        }
      }

      const professional: ProfessionalCardData = {
        id: pro._id.toString(),
        uid: pro.uid,
        name: pro.name || 'Professional',
        avatar: pro.avatar,
        title: pro.title,
        isVerified: pro.verificationStatus === 'verified',
        isPremium: pro.isPremium || false,
        avgRating: pro.avgRating || 0,
        totalReviews: pro.totalReviews || 0,
        primaryCategory,
        primaryCategoryKa,
        priceRange: pro.basePrice
          ? {
              min: pro.basePrice,
              max: pro.maxPrice,
              model: this.normalizePricingModel(pro.pricingModel),
              currency: pro.currency || 'GEL',
            }
          : undefined,
        portfolioCount: (pro as any).portfolioItemCount || (pro.portfolioProjects?.length || 0),
        completedJobs: (pro.completedJobs || 0) + (pro.externalCompletedJobs || 0),
        profileUrl: `/professionals/${pro.uid}`,
      };

      return {
        type: RichContentType.PROFESSIONAL_CARD,
        data: professional,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get reviews for a professional
   */
  async getProfessionalReviews(params: GetProfessionalReviewsParams): Promise<RichContent> {
    const { proId, limit = 5 } = params;

    const reviews = await this.reviewService.findByPro(proId, limit, 0);

    const reviewItems: ReviewItem[] = reviews.map((review: any) => ({
      id: review._id.toString(),
      rating: review.rating,
      text: review.text,
      clientName: review.isAnonymous
        ? 'Anonymous'
        : review.externalClientName || review.clientId?.name || 'Client',
      isAnonymous: review.isAnonymous,
      isVerified: review.isVerified,
      source: review.source,
      projectTitle: review.projectTitle,
      createdAt: review.createdAt?.toISOString() || new Date().toISOString(),
    }));

    return {
      type: RichContentType.REVIEW_LIST,
      data: reviewItems,
    };
  }

  /**
   * Get all categories or a specific category
   */
  async getCategories(categoryKey?: string): Promise<RichContent> {
    if (categoryKey) {
      const all = await this.catalogCategories();
      const category = all.find((c: any) => c.key === categoryKey);
      if (!category) {
        return {
          type: RichContentType.CATEGORY_LIST,
          data: [],
        };
      }

      const categoryItems: CategoryItem[] = [
        {
          key: category.key,
          name: category.name,
          nameKa: category.nameKa,
          icon: category.icon,
          subcategoryCount: category.subcategories?.length || 0,
        },
      ];

      return {
        type: RichContentType.CATEGORY_LIST,
        data: categoryItems,
      };
    }

    const categories = await this.catalogCategories();

    const categoryItems: CategoryItem[] = categories.map((cat: any) => ({
      key: cat.key,
      name: cat.name,
      nameKa: cat.nameKa,
      icon: cat.icon,
      subcategoryCount: cat.subcategories?.length || 0,
    }));

    return {
      type: RichContentType.CATEGORY_LIST,
      data: categoryItems,
    };
  }

  /**
   * Suggest closest matching categories for a free-text query.
   * Useful when users type role words like "არქიტექტორი" instead of a category key.
   */
  async suggestCategories(
    query: string,
    locale: 'en' | 'ka' | 'ru' = 'en',
    limit: number = 8,
  ): Promise<RichContent> {
    const q = String(query || '').trim();
    if (!q) {
      return { type: RichContentType.CATEGORY_LIST, data: [] };
    }

    const all = await this.catalogCategories();
    const items: CategoryItem[] = [];
    const seen = new Set<string>();
    const norm = this.normalizeCategoryQuery(q);
    const contains = (v: string | undefined | null) => {
      const n = this.normalizeCategoryQuery(v);
      return n.length > 0 && (n.includes(norm) || norm.includes(n));
    };

    const pushCategory = (cat: any) => {
      if (!cat?.key || seen.has(cat.key)) return;
      seen.add(cat.key);
      items.push({
        key: cat.key,
        name: cat.name,
        nameKa: cat.nameKa,
        icon: cat.icon,
        subcategoryCount: (cat.subcategories || []).length,
      });
    };

    // Role-word alias first (e.g. "electrician" -> electrical)
    const alias = this.resolveCategoryAlias(q.toLowerCase());
    if (alias) {
      const a = all.find((c: any) => c.key === alias);
      if (a) pushCategory(a);
    }

    // Top-level category matches (name / localized name / keywords)
    for (const cat of all) {
      if (items.length >= limit) break;
      if (
        contains(cat.name) ||
        contains(cat.nameKa) ||
        (cat.keywords || []).some((k: string) => contains(k))
      ) {
        pushCategory(cat);
      }
    }

    // Then categories that have a matching subcategory
    if (items.length < limit) {
      for (const cat of all) {
        if (items.length >= limit) break;
        const hit = (cat.subcategories || []).some(
          (s: any) =>
            contains(s.name) ||
            contains(s.nameKa) ||
            (s.keywords || []).some((k: string) => contains(k)),
        );
        if (hit) pushCategory(cat);
      }
    }

    // Localize the primary `name` for RU as well (front-end uses `nameKa` only for ka)
    if (locale === 'ru') {
      // If the DB doesn't store `nameRu`, we keep `name` as default.
      // (We still provide `nameKa` for Georgian UI.)
    }

    return { type: RichContentType.CATEGORY_LIST, data: items.slice(0, limit) };
  }

  /**
   * Get price ranges for a category based on real data
   */
  async getPriceRanges(
    category: string,
    country?: string,
  ): Promise<RichContent> {
    // Resolve if it's a category or subcategory
    const categoryInfo = await this.resolveCategory(category);

    const filters: any = {
      limit: 100,
      page: 1,
    };

    if (categoryInfo.isTopLevel) {
      filters.category = categoryInfo.categoryKey;
    } else if (categoryInfo.subcategoryKey) {
      filters.subcategory = categoryInfo.subcategoryKey;
    }

    // Restrict the aggregation to pros in the active marketplace; without
    // this a /us visitor would see Tbilisi pro prices labelled in dollars.
    if (country) {
      filters.country = country.toUpperCase();
    }

    // Get professionals in this category to compute real price ranges
    const result = await this.usersService.findAllPros(filters);

    const professionals = result.data;

    // Get category details - try both as category and subcategory (live catalog)
    const allCategories = await this.catalogCategories();
    const categoryDetails = allCategories.find((c: any) => c.key === category);
    let categoryName = category;
    let categoryNameKa = category;

    if (categoryDetails) {
      categoryName = categoryDetails.name;
      categoryNameKa = categoryDetails.nameKa;
    } else {
      // Try to find subcategory details
      for (const cat of allCategories) {
        const sub = cat.subcategories?.find((s: any) => s.key === category);
        if (sub) {
          categoryName = sub.name;
          categoryNameKa = sub.nameKa;
          break;
        }
      }
    }

    // Compute price statistics
    const prices = professionals
      .filter((p: any) => p.basePrice)
      .map((p: any) => ({
        min: p.basePrice,
        max: p.maxPrice || p.basePrice,
      }));

    let priceInfo: PriceInfo;

    if (prices.length === 0) {
      priceInfo = {
        category: categoryName,
        categoryKa: categoryNameKa,
        professionalCount: professionals.length,
        priceRanges: [],
        note: 'Contact professionals directly for pricing information.',
        noteKa: 'დაუკავშირდით პროფესიონალებს ფასების შესახებ ინფორმაციისთვის.',
      };
    } else {
      // Compute price tiers
      const allMinPrices = prices.map((p: any) => p.min).sort((a: number, b: number) => a - b);
      const allMaxPrices = prices.map((p: any) => p.max).sort((a: number, b: number) => a - b);

      const avgMin = Math.round(allMinPrices.reduce((a: number, b: number) => a + b, 0) / allMinPrices.length);
      const avgMax = Math.round(allMaxPrices.reduce((a: number, b: number) => a + b, 0) / allMaxPrices.length);

      // Create price tiers: budget, mid-range, premium
      const budgetMax = allMinPrices[Math.floor(allMinPrices.length * 0.33)] || avgMin;
      const midMax = allMinPrices[Math.floor(allMinPrices.length * 0.66)] || avgMin;
      const premiumMin = allMinPrices[Math.floor(allMinPrices.length * 0.66)] || avgMin;

      priceInfo = {
        category: categoryName,
        categoryKa: categoryNameKa,
        averagePrice: {
          min: avgMin,
          max: avgMax,
          currency: currencyForCountry(country),
        },
        priceRanges: [
          {
            label: 'Budget',
            labelKa: 'ეკონომიური',
            min: Math.min(...allMinPrices),
            max: budgetMax,
            currency: currencyForCountry(country),
          },
          {
            label: 'Mid-range',
            labelKa: 'საშუალო',
            min: budgetMax,
            max: midMax,
            currency: currencyForCountry(country),
          },
          {
            label: 'Premium',
            labelKa: 'პრემიუმ',
            min: premiumMin,
            max: Math.max(...allMaxPrices),
            currency: currencyForCountry(country),
          },
        ],
        professionalCount: professionals.length,
        note: 'Prices may vary based on project scope and complexity.',
        noteKa: 'ფასები შეიძლება განსხვავდებოდეს პროექტის მოცულობისა და სირთულის მიხედვით.',
      };
    }

    return {
      type: RichContentType.PRICE_INFO,
      data: priceInfo,
    };
  }

  /**
   * Explain a platform feature
   */
  async explainFeature(
    feature: string,
    locale: 'en' | 'ka' | 'ru' = 'en',
  ): Promise<RichContent | null> {
    // Map common phrases to feature keys (English, Georgian, Russian)
    const featureMapping: Record<string, FeatureKey> = {
      // Registration - Client
      register: 'registration_client',
      'register client': 'registration_client',
      'sign up': 'registration_client',
      'რეგისტრაცია': 'registration_client',
      'დარეგისტრირება': 'registration_client',

      // Registration - Professional
      'register professional': 'registration_pro',
      'register pro': 'registration_pro',
      'become professional': 'registration_pro',
      'become a pro': 'registration_pro',
      'პროფესიონალად': 'registration_pro',
      'პროფესიონალის რეგისტრაცია': 'registration_pro',
      'როგორ გავხდე პროფესიონალი': 'registration_pro',
      'როგორ დავრეგისტრირდე პროფესიონალად': 'registration_pro',
      'სპეციალისტად რეგისტრაცია': 'registration_pro',
      'как стать специалистом': 'registration_pro',
      'регистрация специалиста': 'registration_pro',

      // Post Job
      'post job': 'post_job',
      'create job': 'post_job',
      'განცხადება': 'post_job',
      'სამუშაოს განთავსება': 'post_job',
      'разместить заказ': 'post_job',

      // Find Professionals
      'find professional': 'find_professionals',
      'find pros': 'find_professionals',
      'browse professional': 'find_professionals',
      search: 'find_professionals',
      'პროფესიონალების პოვნა': 'find_professionals',
      'მოძებნა': 'find_professionals',
      'найти специалиста': 'find_professionals',

      // Pricing
      pricing: 'pricing',
      price: 'pricing',
      cost: 'pricing',
      free: 'pricing',
      'ფასი': 'pricing',
      'ღირებულება': 'pricing',
      'უფასო': 'pricing',
      'цена': 'pricing',
      'стоимость': 'pricing',

      // Verification
      verification: 'verification',
      verify: 'verification',
      verified: 'verification',
      'ვერიფიკაცია': 'verification',
      'დადასტურება': 'verification',
      'верификация': 'verification',

      // Messaging
      message: 'messaging',
      messaging: 'messaging',
      chat: 'messaging',
      'შეტყობინება': 'messaging',
      'ჩათი': 'messaging',
      'сообщение': 'messaging',

      // Proposals
      proposal: 'proposals',
      proposals: 'proposals',
      quote: 'proposals',
      'შეთავაზება': 'proposals',
      'წინადადება': 'proposals',
      'предложение': 'proposals',

      // Reviews
      review: 'reviews',
      reviews: 'reviews',
      rating: 'reviews',
      'შეფასება': 'reviews',
      'რეიტინგი': 'reviews',
      'отзыв': 'reviews',

      // Portfolio
      portfolio: 'portfolio',
      'პორტფოლიო': 'portfolio',
      'портфолио': 'portfolio',

      // How it works
      'how it works': 'how_it_works',
      'how does it work': 'how_it_works',
      homico: 'how_it_works',
      'როგორ მუშაობს': 'how_it_works',
      'как работает': 'how_it_works',

      // Tools - General
      tools: 'tools',
      'ხელსაწყოები': 'tools',
      'კალკულატორები': 'tools',
      'инструменты': 'tools',

      // Tool - Analyzer
      analyzer: 'tool_analyzer',
      'estimate analyzer': 'tool_analyzer',
      'analyze estimate': 'tool_analyzer',
      'check estimate': 'tool_analyzer',
      'ანალიზატორი': 'tool_analyzer',
      'შეფასების ანალიზი': 'tool_analyzer',
      'შეფასების შემოწმება': 'tool_analyzer',
      'анализатор сметы': 'tool_analyzer',
      'проверить смету': 'tool_analyzer',

      // Tool - Prices
      'price database': 'tool_prices',
      'prices database': 'tool_prices',
      'market prices': 'tool_prices',
      'renovation prices': 'tool_prices',
      'ფასების ბაზა': 'tool_prices',
      'რემონტის ფასები': 'tool_prices',
      'საბაზრო ფასები': 'tool_prices',
      'რა ღირს': 'tool_prices',
      'база цен': 'tool_prices',
      'цены на ремонт': 'tool_prices',

      // Tool - Calculator
      calculator: 'tool_calculator',
      'cost calculator': 'tool_calculator',
      'renovation calculator': 'tool_calculator',
      'calculate cost': 'tool_calculator',
      'კალკულატორი': 'tool_calculator',
      'ღირებულების კალკულატორი': 'tool_calculator',
      'რემონტის კალკულატორი': 'tool_calculator',
      'калькулятор': 'tool_calculator',
      'калькулятор ремонта': 'tool_calculator',

      // Tool - Compare
      compare: 'tool_compare',
      'compare estimates': 'tool_compare',
      'estimate comparison': 'tool_compare',
      'შედარება': 'tool_compare',
      'შეფასებების შედარება': 'tool_compare',
      'сравнение смет': 'tool_compare',
      'сравнить сметы': 'tool_compare',
    };

    // Find matching feature key
    const featureLower = feature.toLowerCase();
    let featureKey: FeatureKey | undefined;

    // Direct match
    if (KNOWLEDGE_BASE.features[featureLower as FeatureKey]) {
      featureKey = featureLower as FeatureKey;
    } else {
      // Check mapping
      for (const [phrase, key] of Object.entries(featureMapping)) {
        if (featureLower.includes(phrase)) {
          featureKey = key;
          break;
        }
      }
    }

    if (!featureKey) {
      return null;
    }

    const explanation = getFeatureExplanation(featureKey);
    if (!explanation) {
      return null;
    }

    return {
      type: RichContentType.FEATURE_EXPLANATION,
      data: explanation,
    };
  }

  /**
   * Search the knowledge base for relevant information
   */
  searchKnowledge(
    query: string,
    locale: 'en' | 'ka' | 'ru' = 'en',
  ): { features: FeatureExplanation[]; faqs: any[] } {
    const queryLower = query.toLowerCase();

    const matchedFeatures = Object.values(KNOWLEDGE_BASE.features).filter(
      (feature) => {
        const title =
          locale === 'ka'
            ? feature.titleKa
            : locale === 'ru'
              ? feature.titleRu
              : feature.title;
        const description =
          locale === 'ka'
            ? feature.descriptionKa
            : locale === 'ru'
              ? feature.descriptionRu
              : feature.description;

        return (
          title?.toLowerCase().includes(queryLower) ||
          description?.toLowerCase().includes(queryLower) ||
          feature.feature.toLowerCase().includes(queryLower)
        );
      },
    );

    const matchedFaqs = KNOWLEDGE_BASE.faqs.filter((faq) => {
      const question = faq.question[locale] || faq.question.en;
      const answer = faq.answer[locale] || faq.answer.en;

      return (
        question.toLowerCase().includes(queryLower) ||
        answer.toLowerCase().includes(queryLower)
      );
    });

    return {
      features: matchedFeatures,
      faqs: matchedFaqs,
    };
  }

  /**
   * Normalize pricing model to frontend-compatible values
   */
  private normalizePricingModel(
    model: string | undefined,
  ): 'fixed' | 'range' | 'byAgreement' | 'per_sqm' {
    if (!model) return 'fixed';

    const normalized = model.toLowerCase();

    if (normalized === 'range') return 'range';
    if (normalized === 'byagreement' || normalized === 'hourly' || normalized === 'daily') {
      return 'byAgreement';
    }
    if (normalized === 'per_sqm' || normalized === 'sqm') return 'per_sqm';

    return 'fixed';
  }

  /**
   * Resolve a category key - determine if it's a top-level category or subcategory
   */
  private async resolveCategory(
    key: string,
    locale: 'en' | 'ka' | 'ru' = 'en',
  ): Promise<{ isTopLevel: boolean; categoryKey?: string; subcategoryKey?: string }> {
    const query = String(key || '').trim();
    const keyLower = query.toLowerCase();

    // Lightweight alias mapping for common "role words" users type (esp. in Georgian/Russian)
    const alias = this.resolveCategoryAlias(keyLower);
    if (alias) {
      return { isTopLevel: true, categoryKey: alias };
    }

    // First, check if it's a top-level category (against the LIVE catalog —
    // the same keys pros and the listing use, not the stale legacy collection).
    const allCategories = await this.catalogCategories();

    const norm = this.normalizeCategoryQuery(query);

    for (const cat of allCategories) {
      if (cat.key.toLowerCase() === keyLower) {
        return { isTopLevel: true, categoryKey: cat.key };
      }

      // Also match by localized name / keywords (important for KA/RU queries)
      if (
        this.normalizeCategoryQuery(cat.name) === norm ||
        this.normalizeCategoryQuery(cat.nameKa) === norm ||
        (cat.keywords || []).some((k) => this.normalizeCategoryQuery(k) === norm)
      ) {
        return { isTopLevel: true, categoryKey: cat.key };
      }

      // Check subcategories
      if (cat.subcategories) {
        for (const sub of cat.subcategories) {
          if (sub.key.toLowerCase() === keyLower) {
            return { isTopLevel: false, categoryKey: cat.key, subcategoryKey: sub.key };
          }

          if (
            this.normalizeCategoryQuery(sub.name) === norm ||
            this.normalizeCategoryQuery(sub.nameKa) === norm ||
            (sub.keywords || []).some((k) => this.normalizeCategoryQuery(k) === norm)
          ) {
            return { isTopLevel: false, categoryKey: cat.key, subcategoryKey: sub.key };
          }

          // Check sub-subcategories (children)
          if (sub.children) {
            for (const child of sub.children) {
              if (child.key.toLowerCase() === keyLower) {
                return { isTopLevel: false, categoryKey: cat.key, subcategoryKey: child.key };
              }

              if (
                this.normalizeCategoryQuery(child.name) === norm ||
                this.normalizeCategoryQuery(child.nameKa) === norm ||
                (child.keywords || []).some((k) => this.normalizeCategoryQuery(k) === norm)
              ) {
                return { isTopLevel: false, categoryKey: cat.key, subcategoryKey: child.key };
              }
            }
          }
        }
      }
    }

    // Fallback: partial / substring match over the live catalog (name,
    // localized name, keywords). Covers free-text like "architect" that isn't
    // an exact key. Prefer a top-level category hit, then a subcategory.
    if (norm) {
      const contains = (v: string | undefined | null) => {
        const n = this.normalizeCategoryQuery(v);
        return n.length > 0 && (n.includes(norm) || norm.includes(n));
      };
      for (const cat of allCategories) {
        if (
          contains(cat.name) ||
          contains(cat.nameKa) ||
          (cat.keywords || []).some((k: string) => contains(k))
        ) {
          return { isTopLevel: true, categoryKey: cat.key };
        }
      }
      for (const cat of allCategories) {
        for (const sub of cat.subcategories || []) {
          if (
            contains(sub.name) ||
            contains(sub.nameKa) ||
            (sub.keywords || []).some((k: string) => contains(k))
          ) {
            return {
              isTopLevel: false,
              categoryKey: cat.key,
              subcategoryKey: sub.key,
            };
          }
        }
      }
    }

    // Not found - return as-is and let it be used as subcategory
    return { isTopLevel: false, subcategoryKey: key };
  }

  private normalizeCategoryQuery(value: string | undefined | null): string {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[_/]+/g, ' ')
      .replace(/[-]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]+/gu, '')
      .replace(/\s+/g, ' ');
  }

  private resolveCategoryAlias(queryLower: string): string | null {
    const q = this.normalizeCategoryQuery(queryLower);
    // Targets MUST be real servicecatalogcategories keys (architects/designers/
    // painters/electrical/plumbing), not the old legacy taxonomy.
    const aliases: Record<string, string> = {
      // EN
      architect: 'architects',
      architects: 'architects',
      architecture: 'architects',
      'interior designer': 'designers',
      designer: 'designers',
      designers: 'designers',
      electricians: 'electrical',
      electrician: 'electrical',
      electric: 'electrical',
      electricity: 'electrical',
      plumber: 'plumbing',
      plumbers: 'plumbing',
      plumbing: 'plumbing',
      painter: 'painters',
      painters: 'painters',
      painting: 'painters',
      design: 'designers',
      'interior design': 'designers',
      moving: 'movers',
      mover: 'movers',
      // KA
      არქიტექტორი: 'architects',
      არქიტექტორები: 'architects',
      არქიტექტურა: 'architects',
      დიზაინერი: 'designers',
      ინტერიერი: 'designers',
      'ინტერიერის დიზაინი': 'designers',
      ელექტრიკოსი: 'electrical',
      სანტექნიკოსი: 'plumbing',
      სანტექნიკა: 'plumbing',
      მხატვარი: 'painters',
      // RU
      архитектор: 'architects',
      архитектура: 'architects',
      дизайнер: 'designers',
      электрик: 'electrical',
      сантехник: 'plumbing',
      маляр: 'painters',
    };

    return aliases[q] || null;
  }
}
