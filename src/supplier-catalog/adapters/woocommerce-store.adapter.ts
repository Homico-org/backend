import { Logger } from '@nestjs/common';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Generic adapter for WooCommerce shops via the public Store API:
 *   GET /wp-json/wc/store/v1/products?per_page=100&page=N
 *
 * No scraping - it's clean JSON with real stock (`is_in_stock`), prices in
 * minor units, images, permalinks, and categories. One adapter covers every
 * WooCommerce shop; onboarding a new one is just a config entry.
 *
 * Price note: `prices.price` is a string in the shop's minor units
 * (`currency_minor_unit`). We normalize to GEL tetri (2 minor digits). Some
 * Georgian shops misconfigure `currency_code` (e.g. EUR) while charging GEL, so
 * we ignore the code and treat the amount as GEL.
 */
export interface WooCommerceAdapterConfig {
  supplierKey: string;
  baseUrl: string;
  perPage?: number;
  requestDelayMs?: number;
  maxPages?: number;
}

interface WcImage {
  src?: string;
  thumbnail?: string;
}
interface WcCategory {
  name?: string;
  slug?: string;
}
interface WcPrices {
  price?: string;
  currency_minor_unit?: number;
}
interface WcProduct {
  id: number;
  name?: string;
  permalink?: string;
  prices?: WcPrices;
  images?: WcImage[];
  categories?: WcCategory[];
  is_in_stock?: boolean;
}

export class WooCommerceStoreAdapter implements SupplierAdapter {
  readonly supplierKey: string;
  readonly sourceType: SupplierSourceType = 'feed';

  private readonly logger: Logger;
  private readonly cfg: Required<WooCommerceAdapterConfig>;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  constructor(config: WooCommerceAdapterConfig) {
    this.supplierKey = config.supplierKey;
    this.logger = new Logger(`Woo:${config.supplierKey}`);
    this.cfg = {
      supplierKey: config.supplierKey,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      perPage: config.perPage ?? 100,
      requestDelayMs: config.requestDelayMs ?? 400,
      maxPages: config.maxPages ?? 300,
    };
  }

  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    for (let page = 1; page <= this.cfg.maxPages; page++) {
      const url = `${this.cfg.baseUrl}/wp-json/wc/store/v1/products?per_page=${this.cfg.perPage}&page=${page}`;
      const batch = await this.fetchJson(url);
      if (!batch || batch.length === 0) break;

      for (const p of batch) {
        const normalized = this.normalize(p);
        if (normalized) yield normalized;
      }

      if (batch.length < this.cfg.perPage) break; // last page
      await this.delay(this.cfg.requestDelayMs);
    }
  }

  private normalize(p: WcProduct): NormalizedSupplierProduct | null {
    if (!p?.id || !p.name) return null;
    const cat = p.categories?.[0];
    return {
      externalId: String(p.id),
      externalUrl: p.permalink || `${this.cfg.baseUrl}/?p=${p.id}`,
      name: p.name,
      nameKa: p.name,
      priceMinor: this.toTetri(p.prices),
      currency: 'GEL',
      rawPrice: p.prices?.price,
      imageUrls: this.images(p.images),
      category: cat?.slug,
      categoryLabel: cat?.name,
      inStock: typeof p.is_in_stock === 'boolean' ? p.is_in_stock : undefined,
    };
  }

  /** minor-unit string -> GEL tetri (2 minor digits). */
  private toTetri(prices?: WcPrices): number {
    if (!prices?.price) return 0;
    const amount = parseInt(prices.price, 10);
    if (!Number.isFinite(amount)) return 0;
    const minorUnit = prices.currency_minor_unit ?? 2;
    return Math.round(amount * Math.pow(10, 2 - minorUnit));
  }

  private images(imgs?: WcImage[]): string[] {
    if (!imgs?.length) return [];
    const src = imgs[0].src || imgs[0].thumbnail;
    return src ? [src] : [];
  }

  private async fetchJson(url: string): Promise<WcProduct[] | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': this.USER_AGENT, Accept: 'application/json' },
        redirect: 'follow',
      });
      if (!res.ok) {
        // 400 past the last page is normal for some WC versions - treat as end.
        if (res.status === 400 || res.status === 404) return null;
        throw new Error(`status ${res.status}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? (data as WcProduct[]) : null;
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
