import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Supplier, SupplierStatus } from './schemas/supplier.schema';
import {
  SupplierProduct,
  SupplierProductDoc,
} from './schemas/supplier-product.schema';
import { SearchProductsDto } from './dto/search-products.dto';
import {
  CreateShopDto,
  SellerProductDto,
  UpdateShopDto,
} from './dto/seller-shop.dto';

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

    // Hide products from shops still pending moderation / suspended. No-op while
    // there are no self-serve shops (legacy suppliers have no `status`).
    const hidden = await this.hiddenSupplierKeys();
    if (dto.supplierKey) {
      // A specific hidden shop must return nothing.
      if (hidden.includes(dto.supplierKey)) {
        return { items: [], total: 0, page, limit, hasMore: false };
      }
      filter.supplierKey = dto.supplierKey;
    } else if (hidden.length) {
      filter.supplierKey = { $nin: hidden };
    }
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
        searchText: { $regex: `(^|[\\s_-])${this.escapeRegex(tok.toLowerCase())}`, $options: 'i' },
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
    // Don't leak products from shops still pending moderation / suspended
    // (searchProducts hides them too, so direct-by-id must be consistent).
    const hidden = await this.hiddenSupplierKeys();
    if (hidden.includes(product.supplierKey)) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /** Public-facing supplier list for filter UIs. */
  async listSuppliers() {
    return this.supplierModel
      .find({ isActive: true, status: { $nin: ['pending', 'suspended'] } })
      .select('key name productCount')
      .sort({ name: 1 })
      .lean();
  }

  /**
   * Supplier keys that must NOT surface publicly (self-serve shops still pending
   * moderation, or suspended). Legacy suppliers have no `status` and are visible.
   * Empty today (no manual shops yet), so it's a no-op on the live catalog.
   */
  private async hiddenSupplierKeys(): Promise<string[]> {
    const rows = await this.supplierModel
      .find({ status: { $in: ['pending', 'suspended'] } })
      .select('key')
      .lean<{ key: string }[]>();
    return rows.map((r) => r.key);
  }

  // === Self-serve seller portal (Phase B) - owner-scoped shop + product CRUD ===

  /** The shop owned by this user (one per owner), or null. */
  async getMyShop(ownerUserId: string) {
    return this.supplierModel
      .findOne({
        ownerUserId: new Types.ObjectId(ownerUserId),
        sourceType: 'manual',
      })
      .lean();
  }

  /** Create the caller's shop. Starts 'pending' (hidden until admin approves). */
  async createMyShop(ownerUserId: string, dto: CreateShopDto) {
    const owner = new Types.ObjectId(ownerUserId);
    if (await this.supplierModel.exists({ ownerUserId: owner, sourceType: 'manual' })) {
      throw new BadRequestException('SHOP_EXISTS');
    }
    const shop = await this.supplierModel.create({
      key: await this.uniqueShopKey(dto.name),
      name: dto.name.trim(),
      baseUrl: dto.baseUrl?.trim() || 'https://homico.ge',
      sourceType: 'manual',
      status: 'pending',
      isActive: true,
      ownerUserId: owner,
      logo: dto.logo,
      legalName: dto.legalName,
      taxId: dto.taxId,
      payoutIban: dto.payoutIban,
      deliveryFeeMinor: Math.round((dto.deliveryFee ?? 0) * 100),
    });
    return shop.toObject();
  }

  /**
   * Update the caller's shop profile (name, logo, legal + payout, delivery
   * fee). Only touches keys present in the dto so a partial save never wipes
   * existing values. Editing a live shop does not reset approval status.
   */
  async updateMyShop(ownerUserId: string, dto: UpdateShopDto) {
    const shop = await this.requireMyShop(ownerUserId);
    if ('name' in dto && dto.name?.trim()) shop.name = dto.name.trim();
    if ('logo' in dto) shop.logo = dto.logo;
    if ('legalName' in dto) shop.legalName = dto.legalName;
    if ('taxId' in dto) shop.taxId = dto.taxId;
    if ('payoutIban' in dto) shop.payoutIban = dto.payoutIban;
    if ('deliveryFee' in dto) {
      shop.deliveryFeeMinor = Math.round((dto.deliveryFee ?? 0) * 100);
    }
    await shop.save();
    return shop.toObject();
  }

  private async requireMyShop(ownerUserId: string) {
    const shop = await this.supplierModel.findOne({
      ownerUserId: new Types.ObjectId(ownerUserId),
      sourceType: 'manual',
    });
    if (!shop) throw new NotFoundException('NO_SHOP');
    return shop;
  }

  async listMyProducts(ownerUserId: string) {
    const shop = await this.requireMyShop(ownerUserId);
    return this.productModel
      .find({ supplierKey: shop.key })
      .sort({ createdAt: -1 })
      .lean();
  }

  async addMyProduct(ownerUserId: string, dto: SellerProductDto) {
    const shop = await this.requireMyShop(ownerUserId);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const doc = await this.productModel.create({
      supplierKey: shop.key,
      externalId: new Types.ObjectId().toString(),
      // Manual products have no external page; link back to the Homico shop.
      externalUrl: 'https://homico.ge/shop',
      name: dto.name.trim(),
      nameKa: dto.nameKa?.trim() || dto.name.trim(),
      searchText: this.buildSearchText(dto),
      priceMinor: Math.round((dto.price ?? 0) * 100),
      currency: 'GEL',
      imageUrl: dto.imageUrls?.[0],
      imageUrls: dto.imageUrls ?? [],
      category: dto.category,
      categoryLabel: dto.categoryLabel ?? dto.category,
      isAvailable: true,
      stockQty: dto.stockQty,
      inStock: dto.stockQty == null ? undefined : dto.stockQty > 0,
      lastSeenAt: new Date(),
      sourceType: 'manual',
    });
    await this.refreshProductCount(shop.key);
    return doc.toObject();
  }

  /**
   * Recompute a shop's cached `productCount` from its actual products. The
   * public shops list reads this field, so it must be kept in sync on every
   * add / import / delete or the shop shows a stale "0 products".
   */
  private async refreshProductCount(supplierKey: string): Promise<void> {
    // Count AVAILABLE products only, to match how scraped/feed shops report
    // productCount (supplier-sync counts isAvailable:true) and what the public
    // catalog actually shows - a delisted item must not inflate the badge.
    const count = await this.productModel.countDocuments({
      supplierKey,
      isAvailable: true,
    });
    await this.supplierModel.updateOne({ key: supplierKey }, { $set: { productCount: count } });
  }

  /** Bulk-create products from a parsed CSV/Excel upload. Skips blank rows. */
  async bulkAddMyProducts(ownerUserId: string, rows: SellerProductDto[]) {
    const shop = await this.requireMyShop(ownerUserId);
    const valid = (rows || []).filter((r) => r?.name?.trim()).slice(0, 1000);
    if (!valid.length) throw new BadRequestException('No valid rows to import');
    const now = new Date();
    const docs = valid.map((dto) => ({
      supplierKey: shop.key,
      externalId: new Types.ObjectId().toString(),
      externalUrl: 'https://homico.ge/shop',
      name: dto.name!.trim(),
      nameKa: dto.nameKa?.trim() || dto.name!.trim(),
      searchText: this.buildSearchText(dto),
      priceMinor: Math.round((dto.price ?? 0) * 100),
      currency: 'GEL',
      imageUrl: dto.imageUrls?.[0],
      imageUrls: dto.imageUrls ?? [],
      category: dto.category,
      categoryLabel: dto.categoryLabel ?? dto.category,
      isAvailable: true,
      stockQty: dto.stockQty,
      inStock: dto.stockQty == null ? undefined : dto.stockQty > 0,
      lastSeenAt: now,
      sourceType: 'manual' as const,
    }));
    // ordered:false so one bad row doesn't abort the batch.
    await this.productModel.insertMany(docs, { ordered: false });
    await this.refreshProductCount(shop.key);
    return { created: docs.length };
  }

  async updateMyProduct(
    ownerUserId: string,
    productId: string,
    dto: SellerProductDto,
  ) {
    const shop = await this.requireMyShop(ownerUserId);
    const product = Types.ObjectId.isValid(productId)
      ? await this.productModel.findById(productId)
      : null;
    if (!product || product.supplierKey !== shop.key) {
      throw new NotFoundException('Product not found');
    }
    if (dto.name != null) product.name = dto.name.trim();
    if (dto.nameKa != null) product.nameKa = dto.nameKa.trim();
    if (dto.price != null) product.priceMinor = Math.round(dto.price * 100);
    if (dto.category != null) {
      product.category = dto.category;
      product.categoryLabel = dto.categoryLabel ?? dto.category;
    }
    if (dto.imageUrls != null) {
      product.imageUrls = dto.imageUrls;
      product.imageUrl = dto.imageUrls[0];
    }
    if (dto.stockQty !== undefined) {
      product.stockQty = dto.stockQty;
      product.inStock = dto.stockQty == null ? undefined : dto.stockQty > 0;
    }
    if (dto.isAvailable !== undefined) product.isAvailable = dto.isAvailable;
    product.searchText = this.buildSearchText({
      name: product.name,
      nameKa: product.nameKa,
      category: product.category,
      categoryLabel: product.categoryLabel,
    });
    await product.save();
    // A delist/relist (isAvailable) changes the available count the public
    // "N products" badge shows, so keep it in sync here too.
    await this.refreshProductCount(shop.key);
    return product.toObject();
  }

  async deleteMyProduct(ownerUserId: string, productId: string) {
    const shop = await this.requireMyShop(ownerUserId);
    const product = Types.ObjectId.isValid(productId)
      ? await this.productModel.findById(productId).select('supplierKey')
      : null;
    if (!product || product.supplierKey !== shop.key) {
      throw new NotFoundException('Product not found');
    }
    await this.productModel.deleteOne({ _id: product._id });
    await this.refreshProductCount(shop.key);
    return { deleted: true };
  }

  private buildSearchText(p: {
    name?: string;
    nameKa?: string;
    category?: string;
    categoryLabel?: string;
  }): string {
    return [p.name, p.nameKa, p.categoryLabel, p.category]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  /** ASCII, unique machine key from a (possibly Georgian) shop name. */
  private async uniqueShopKey(name: string): Promise<string> {
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'x';
    const base = `shop-${slug}`;
    let key = base;
    for (let i = 2; await this.supplierModel.exists({ key }); i++) {
      key = `${base}-${i}`;
    }
    return key;
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

  /** Admin: self-serve shops (sourceType 'manual'), pending first for review. */
  async listSellerShops() {
    const order: Record<string, number> = { pending: 0, approved: 1, suspended: 2 };
    const shops = await this.supplierModel
      .find({ sourceType: 'manual' })
      .lean();
    return shops.sort(
      (a, b) =>
        (order[a.status] ?? 3) - (order[b.status] ?? 3) ||
        a.name.localeCompare(b.name),
    );
  }

  /** Admin: approve / suspend / re-pend a self-serve shop. */
  async setShopStatus(key: string, status: SupplierStatus) {
    const shop = await this.supplierModel.findOne({ key, sourceType: 'manual' });
    if (!shop) throw new NotFoundException('Shop not found');
    shop.status = status;
    await shop.save();
    return shop.toObject();
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
      { key: 'cavoli', name: 'Cavoli', baseUrl: 'https://cavoligeorgia.ge', sourceType: 'scrape' as const, isActive: true },
      // Headless (Playwright-rendered)
      { key: 'nova', name: 'Nova', baseUrl: 'https://nova.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'comforter', name: 'Comforter', baseUrl: 'https://comforter.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'classica', name: 'Classica', baseUrl: 'https://classica.com.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'ashleyhome', name: 'Ashley Home', baseUrl: 'https://ashleyhome.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'thermocenter', name: 'Thermocenter', baseUrl: 'https://thermocenter.ge', sourceType: 'scrape' as const, isActive: true },
      { key: 'kasco', name: 'Kasco', baseUrl: 'https://kasco.storera.ge', sourceType: 'scrape' as const, isActive: true },
      // WooCommerce Store API (JSON, real stock) - shared adapter
      { key: 'mosaics', name: 'Mosaics', baseUrl: 'https://mosaics.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'vitra', name: 'VitrA', baseUrl: 'https://vitra.com.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'homevision', name: 'Home Vision', baseUrl: 'https://homevision.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'qebuli', name: 'Qebuli Climate', baseUrl: 'https://qebuli-climate.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'maxtherm', name: 'Maxtherm', baseUrl: 'https://maxtherm.ge', sourceType: 'feed' as const, isActive: true },
      { key: 'contempo', name: 'Contempo', baseUrl: 'https://contempo.ge', sourceType: 'feed' as const, isActive: true },
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
