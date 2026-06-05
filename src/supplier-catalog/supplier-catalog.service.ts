import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Supplier } from './schemas/supplier.schema';
import {
  SupplierProduct,
  SupplierProductDoc,
} from './schemas/supplier-product.schema';
import { SearchProductsDto } from './dto/search-products.dto';

export interface ProductSearchResult {
  items: SupplierProductDoc[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/**
 * Read side of the supplier catalog: product search/list + supplier listing.
 * Public search always forces isAvailable=true so retired products never leak.
 *
 * Search uses case-insensitive regex over name/nameKa rather than Mongo $text:
 * $text has no Georgian analyzer and won't match substrings, which is the
 * common UX for a tile store.
 */
@Injectable()
export class SupplierCatalogService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<Supplier>,
    @InjectModel(SupplierProduct.name)
    private readonly productModel: Model<SupplierProduct>,
  ) {}

  async searchProducts(dto: SearchProductsDto): Promise<ProductSearchResult> {
    const page = Math.max(1, parseInt(dto.page ?? '1', 10) || 1);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(dto.limit ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT),
    );

    const filter: FilterQuery<SupplierProduct> = { isAvailable: true };

    if (dto.supplierKey) filter.supplierKey = dto.supplierKey;
    if (dto.category) filter.category = dto.category;
    // 3-state stock: only `true` is "in stock"; undefined = unknown must NOT pass.
    if (dto.inStockOnly === 'true' || dto.inStockOnly === '1') {
      filter.inStock = true;
    }

    const q = dto.q?.trim();
    if (q) {
      // Match every whitespace-split token as a word-prefix against the
      // normalized `searchText` (name + nameKa + category, lowercased). This is
      // the "ship now" engine; Atlas Search is the documented scale path.
      const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
      filter.$and = tokens.map((tok) => ({
        searchText: { $regex: `(^|[\\s-])${this.escapeRegex(tok.toLowerCase())}`, $options: 'i' },
      }));
    }

    const priceFilter: Record<string, number> = {};
    const min = this.parseGelToMinor(dto.minPrice);
    const max = this.parseGelToMinor(dto.maxPrice);
    if (min !== undefined) priceFilter.$gte = min;
    if (max !== undefined) priceFilter.$lte = max;
    if (Object.keys(priceFilter).length) filter.priceMinor = priceFilter;

    const sort: Record<string, 1 | -1> =
      dto.sort === 'price_asc'
        ? { priceMinor: 1 }
        : dto.sort === 'price_desc'
          ? { priceMinor: -1 }
          : dto.sort === 'newest'
            ? { createdAt: -1 }
            : { lastSeenAt: -1, _id: -1 };

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<SupplierProductDoc[]>(),
      this.productModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  async findProductById(id: string): Promise<SupplierProductDoc> {
    const product = Types.ObjectId.isValid(id)
      ? await this.productModel.findById(id).lean<SupplierProductDoc>()
      : null;
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Public-facing supplier list for filter UIs. */
  async listSuppliers() {
    return this.supplierModel
      .find({ isActive: true })
      .select('key name productCount')
      .sort({ name: 1 })
      .lean();
  }

  /**
   * Distinct categories with available-product counts, optionally scoped to one
   * shop. Drives the per-shop category facet in the browse UI.
   */
  async listCategoryFacets(supplierKey?: string) {
    const match: FilterQuery<SupplierProduct> = { isAvailable: true };
    if (supplierKey) match.supplierKey = supplierKey;
    return this.productModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$category',
          categoryLabel: { $first: '$categoryLabel' },
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
      { $project: { _id: 0, category: '$_id', categoryLabel: 1, count: 1 } },
      { $sort: { count: -1, categoryLabel: 1 } },
    ]);
  }

  /** Admin: full supplier rows including sync status. */
  async listSuppliersAdmin() {
    return this.supplierModel.find().sort({ name: 1 }).lean();
  }

  async getSupplierStatus(key: string) {
    const supplier = await this.supplierModel
      .findOne({ key })
      .select(
        'key name sourceType isActive lastSyncedAt lastSyncStatus lastSyncError productCount lastSyncStats',
      )
      .lean();
    if (!supplier) throw new NotFoundException(`Supplier '${key}' not found`);
    return supplier;
  }

  /** Idempotent upsert of the supplier rows (no migration needed). */
  async seedSuppliers() {
    const seeds = [
      // Custom HTML scrapers
      { key: 'legoroom', name: 'Legoroom', baseUrl: 'https://www.legoroom.ge', sourceType: 'scrape' as const, isActive: true },
      // CS-Cart (Unitheme2) - shared adapter
      { key: 'imart', name: 'iMart', baseUrl: 'https://imart.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'gorgia', name: 'Gorgia', baseUrl: 'https://gorgia.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'goodbuild', name: 'GoodBuild', baseUrl: 'https://goodbuild.ge', sourceType: 'scrape' as const, isActive: true },
      // Headless (Playwright-rendered)
      { key: 'nova', name: 'Nova', baseUrl: 'https://nova.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'comforter', name: 'Comforter', baseUrl: 'https://comforter.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'classica', name: 'Classica', baseUrl: 'https://classica.com.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'ashleyhome', name: 'Ashley Home', baseUrl: 'https://ashleyhome.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'thermocenter', name: 'Thermocenter', baseUrl: 'https://thermocenter.ge', sourceType: 'scrape' as const, isActive: true },
      // WooCommerce Store API (JSON, real stock) - shared adapter
      { key: 'mosaics', name: 'Mosaics', baseUrl: 'https://mosaics.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'vitra', name: 'VitrA', baseUrl: 'https://vitra.com.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'homevision', name: 'Home Vision', baseUrl: 'https://homevision.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'qebuli', name: 'Qebuli Climate', baseUrl: 'https://qebuli-climate.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'maxtherm', name: 'Maxtherm', baseUrl: 'https://maxtherm.ge', sourceType: 'feed' as const, isActive: true },
      // Deferred: Domino blocks plain HTTP (Cloudflare). Seeded inactive so the
      // cron skips it; revisit with a headless worker or a partner feed.
      { key: 'domino', name: 'Domino', baseUrl: 'https://domino.ge', sourceType: 'scrape' as const, isActive: false },
    ];
    for (const s of seeds) {
      await this.supplierModel.updateOne(
        { key: s.key },
        {
          $set: { name: s.name, baseUrl: s.baseUrl, sourceType: s.sourceType },
          $setOnInsert: { key: s.key, isActive: s.isActive },
        },
        { upsert: true },
      );
    }
    return this.listSuppliersAdmin();
  }

  private parseGelToMinor(value?: string): number | undefined {
    if (value === undefined || value === '') return undefined;
    const gel = parseFloat(value);
    if (!Number.isFinite(gel)) return undefined;
    return Math.round(gel * 100);
  }

  private escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
