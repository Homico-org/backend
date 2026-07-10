import { Logger } from '@nestjs/common';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Config-driven adapter for ANY shop that exposes a paginated JSON product
 * feed/API - the "swap scrape for a partner feed" seam in action. Onboarding a
 * cooperating shop (e.g. kasco.ge) that gives us an endpoint becomes ONE config
 * entry with a field map, not a new adapter class.
 *
 * It handles the common variations we see across Georgian shop APIs:
 *   - response is either a bare array, or an object wrapping the array at some
 *     dot-path (`itemsPath`, e.g. 'data' or 'result.products')
 *   - each field lives at a configurable dot-path (`fieldMap`), so we don't care
 *     what the shop names its keys
 *   - price in major units (₾, ×100 → tetri) or already minor
 *   - stock as a boolean flag or a numeric quantity
 *   - optional auth header (API key)
 *
 * When a shop's shape is too weird for this (nested variants, GraphQL, etc.),
 * write a bespoke adapter - but most REST/JSON feeds fit here.
 */
export interface FeedFieldMap {
  /** Dot-path to the shop's own product id. Required. */
  externalId: string;
  /** Dot-path to the product name. Required. */
  name: string;
  nameKa?: string;
  /** Dot-path to the price (number or numeric string). Required. */
  price: string;
  /** Dot-path to stock. Interpreted per `stockMode`. Omit if the feed has none. */
  stock?: string;
  /** Dot-path to a single image url. */
  image?: string;
  /** Dot-path to an array of image urls (takes precedence over `image`). */
  images?: string;
  /** Dot-path to a category slug/key. */
  category?: string;
  /** Dot-path to a human category label. */
  categoryLabel?: string;
  /** Dot-path to the product's public page url. */
  url?: string;
}

export interface GenericFeedAdapterConfig {
  supplierKey: string;
  /** Shop origin, e.g. 'https://kasco.ge'. Used to absolutize relative urls. */
  baseUrl: string;
  /**
   * Page URL template. `{page}` is substituted per page. Can be absolute or
   * relative to baseUrl. E.g. '/api/products?page={page}&limit=100'.
   */
  endpoint: string;
  /** Dot-path to the array of items in the response. Empty = response IS the array. */
  itemsPath?: string;
  fieldMap: FeedFieldMap;
  /** Price is already in minor units (tetri)? Default false (major units, ×100). */
  priceInMinor?: boolean;
  /** How to read `fieldMap.stock`. 'quantity' (>0 = in stock) | 'boolean'. Default 'quantity'. */
  stockMode?: 'quantity' | 'boolean';
  /** Optional API-key header sent on every request. */
  authHeader?: { name: string; value: string };
  currency?: string;
  perPage?: number;
  maxPages?: number;
  requestDelayMs?: number;
}

type Json = Record<string, unknown>;

export class GenericFeedAdapter implements SupplierAdapter {
  readonly supplierKey: string;
  readonly sourceType: SupplierSourceType = 'feed';

  private readonly logger: Logger;
  private readonly cfg: Required<
    Omit<GenericFeedAdapterConfig, 'authHeader'>
  > & { authHeader?: { name: string; value: string } };
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  constructor(config: GenericFeedAdapterConfig) {
    this.supplierKey = config.supplierKey;
    this.logger = new Logger(`Feed:${config.supplierKey}`);
    this.cfg = {
      supplierKey: config.supplierKey,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      endpoint: config.endpoint,
      itemsPath: config.itemsPath ?? '',
      fieldMap: config.fieldMap,
      priceInMinor: config.priceInMinor ?? false,
      stockMode: config.stockMode ?? 'quantity',
      currency: config.currency ?? 'GEL',
      perPage: config.perPage ?? 100,
      maxPages: config.maxPages ?? 300,
      requestDelayMs: config.requestDelayMs ?? 400,
      authHeader: config.authHeader,
    };
  }

  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    for (let page = 1; page <= this.cfg.maxPages; page++) {
      const url = this.pageUrl(page);
      const items = await this.fetchItems(url);
      if (!items || items.length === 0) break;

      for (const item of items) {
        const normalized = this.normalize(item);
        if (normalized) yield normalized;
      }

      if (items.length < this.cfg.perPage) break; // last page
      await this.delay(this.cfg.requestDelayMs);
    }
  }

  private pageUrl(page: number): string {
    const path = this.cfg.endpoint.replace('{page}', String(page));
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.cfg.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private normalize(item: Json): NormalizedSupplierProduct | null {
    const fm = this.cfg.fieldMap;
    const externalId = this.str(this.get(item, fm.externalId));
    const name = this.str(this.get(item, fm.name));
    if (!externalId || !name) return null;

    const nameKa = fm.nameKa ? this.str(this.get(item, fm.nameKa)) : undefined;
    const rawPrice = this.get(item, fm.price);
    const url = fm.url ? this.str(this.get(item, fm.url)) : '';

    return {
      externalId,
      externalUrl: this.absoluteUrl(url) || this.cfg.baseUrl,
      name,
      nameKa: nameKa || name,
      priceMinor: this.toTetri(rawPrice),
      currency: this.cfg.currency,
      rawPrice: rawPrice != null ? String(rawPrice) : undefined,
      imageUrls: this.images(item),
      category: fm.category ? this.str(this.get(item, fm.category)) : undefined,
      categoryLabel: fm.categoryLabel
        ? this.str(this.get(item, fm.categoryLabel))
        : undefined,
      inStock: this.stock(item),
    };
  }

  /** Read a value at a dot-path (e.g. 'attributes.price.value'). */
  private get(obj: unknown, path: string): unknown {
    if (!path) return undefined;
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Json)[key];
      return undefined;
    }, obj);
  }

  private str(v: unknown): string {
    if (v == null) return '';
    return String(v).trim();
  }

  /** Major-unit price (₾) -> GEL tetri, unless the feed is already minor. */
  private toTetri(raw: unknown): number {
    if (raw == null) return 0;
    // Strip any currency symbols/spaces from string prices ('1 250 ₾' -> 1250).
    const num =
      typeof raw === 'number'
        ? raw
        : parseFloat(String(raw).replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (!Number.isFinite(num)) return 0;
    return this.cfg.priceInMinor ? Math.round(num) : Math.round(num * 100);
  }

  private stock(item: Json): boolean | undefined {
    const fm = this.cfg.fieldMap;
    if (!fm.stock) return undefined;
    const v = this.get(item, fm.stock);
    if (v == null) return undefined;
    if (this.cfg.stockMode === 'boolean') {
      if (typeof v === 'boolean') return v;
      const s = String(v).toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'in_stock';
    }
    // quantity mode: >0 means in stock
    const qty = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isFinite(qty) ? qty > 0 : undefined;
  }

  private images(item: Json): string[] {
    const fm = this.cfg.fieldMap;
    if (fm.images) {
      const arr = this.get(item, fm.images);
      if (Array.isArray(arr)) {
        return arr
          .map((x) =>
            this.absoluteUrl(
              typeof x === 'string' ? x : this.str((x as Json)?.url ?? (x as Json)?.src),
            ),
          )
          .filter(Boolean);
      }
    }
    if (fm.image) {
      const one = this.absoluteUrl(this.str(this.get(item, fm.image)));
      return one ? [one] : [];
    }
    return [];
  }

  private absoluteUrl(u: string): string {
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `${this.cfg.baseUrl}${u.startsWith('/') ? '' : '/'}${u}`;
  }

  private async fetchItems(url: string): Promise<Json[] | null> {
    const data = await this.fetchJson(url);
    if (data == null) return null;
    const root = this.cfg.itemsPath ? this.get(data, this.cfg.itemsPath) : data;
    return Array.isArray(root) ? (root as Json[]) : null;
  }

  private async fetchJson(url: string): Promise<unknown> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': this.USER_AGENT,
        Accept: 'application/json',
      };
      if (this.cfg.authHeader) {
        headers[this.cfg.authHeader.name] = this.cfg.authHeader.value;
      }
      const res = await fetch(url, { headers, redirect: 'follow' });
      if (!res.ok) {
        // 400/404 past the last page is normal for some APIs - treat as end.
        if (res.status === 400 || res.status === 404) return null;
        throw new Error(`status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      this.logger.warn(
        `${this.supplierKey}: fetch ${url} failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
