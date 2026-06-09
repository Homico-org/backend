import { Logger } from '@nestjs/common';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';
import { HeadlessBrowserService } from './headless-browser.service';

/**
 * Generic adapter for custom / JS-rendered shops with no API and no
 * server-rendered prices. Renders listing pages with the shared headless
 * browser and extracts product cards heuristically. Per-shop config is just the
 * listing URL(s) + how to page (infinite scroll vs ?page=N).
 *
 * externalId is the product URL's pathname (stable + unique per shop).
 */
export interface HeadlessAdapterConfig {
  supplierKey: string;
  baseUrl: string;
  /** Category / all-products listing URLs to crawl. */
  listingSeeds: string[];
  /** 'scroll' = infinite-scroll one page; 'param' = ?page=N; 'none' = single. */
  pagination?: 'scroll' | 'param' | 'none';
  pageParam?: string;
  maxPages?: number;
  /** Only keep product URLs whose path contains one of these markers. */
  productUrlMustInclude?: string[];
  /** Ancestors to climb to find a product card (default 4; raise for nested layouts). */
  cardClimbDepth?: number;
  requestDelayMs?: number;
}

export class HeadlessHeuristicAdapter implements SupplierAdapter {
  readonly supplierKey: string;
  readonly sourceType: SupplierSourceType = 'scrape';

  private readonly logger: Logger;
  private readonly cfg: Required<
    Omit<HeadlessAdapterConfig, 'productUrlMustInclude' | 'cardClimbDepth'>
  > & { productUrlMustInclude?: string[]; cardClimbDepth: number };

  constructor(
    config: HeadlessAdapterConfig,
    private readonly browser: HeadlessBrowserService,
  ) {
    this.supplierKey = config.supplierKey;
    this.logger = new Logger(`Headless:${config.supplierKey}`);
    this.cfg = {
      supplierKey: config.supplierKey,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      listingSeeds: config.listingSeeds,
      pagination: config.pagination ?? 'scroll',
      pageParam: config.pageParam ?? 'page',
      maxPages: config.maxPages ?? 40,
      requestDelayMs: config.requestDelayMs ?? 500,
      productUrlMustInclude: config.productUrlMustInclude,
      cardClimbDepth: config.cardClimbDepth ?? 4,
    };
  }

  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    const seenUrls = new Set<string>();

    for (const seed of this.cfg.listingSeeds) {
      if (this.cfg.pagination === 'param') {
        for (let page = 1; page <= this.cfg.maxPages; page++) {
          const url = this.withPage(seed, page);
          const cards = await this.browser.scrapeListing(url, {
            scroll: false,
            cardClimbDepth: this.cfg.cardClimbDepth,
          });
          const fresh = this.yieldable(cards, seenUrls);
          if (fresh.length === 0) break;
          for (const p of fresh) yield p;
        }
      } else {
        const cards = await this.browser.scrapeListing(seed, {
          scroll: this.cfg.pagination === 'scroll',
          cardClimbDepth: this.cfg.cardClimbDepth,
        });
        for (const p of this.yieldable(cards, seenUrls)) yield p;
      }
    }
  }

  // Common non-product info/marketing slugs to drop when no explicit
  // productUrlMustInclude is configured.
  private static readonly INFO_SLUGS =
    /(collections?|offers?|discount|delivery|return|exchange|installment|ganvadeba|dabruneba|mitana|about|contact|blog|news|faq|terms|privacy|brands?|category|categories|search)/i;

  private yieldable(
    cards: { name: string; priceText: string; url: string; img: string | null }[],
    seen: Set<string>,
  ): NormalizedSupplierProduct[] {
    const out: NormalizedSupplierProduct[] = [];
    for (const c of cards) {
      const externalUrl = this.absolute(c.url);
      const path = this.pathOf(externalUrl);
      if (!path || seen.has(path)) continue;
      const decoded = decodeURIComponent(path);
      if (this.cfg.productUrlMustInclude) {
        if (!this.cfg.productUrlMustInclude.some((m) => decoded.includes(m))) continue;
      } else {
        // Generic guard: real product URLs are deep (>=2 segments) and not info pages.
        if (path.split('/').filter(Boolean).length < 2) continue;
        if (HeadlessHeuristicAdapter.INFO_SLUGS.test(decoded)) continue;
      }
      const priceMinor = this.parsePriceMinor(c.priceText);
      if (priceMinor <= 0) continue;
      seen.add(path);
      out.push({
        externalId: path,
        externalUrl,
        name: c.name,
        nameKa: c.name,
        priceMinor,
        currency: 'GEL',
        rawPrice: c.priceText,
        imageUrls: c.img ? [this.absolute(c.img)] : [],
        inStock: undefined,
      });
    }
    return out;
  }

  private withPage(url: string, page: number): string {
    const u = new URL(url);
    u.searchParams.set(this.cfg.pageParam, String(page));
    return u.toString();
  }

  private parsePriceMinor(raw: string): number {
    if (!raw) return 0;
    let s = raw.replace(/[^\d.,]/g, '');
    // A separator grouping exactly 3 digits is a THOUSANDS separator (1,200 /
    // 1.200 / 1,200,000) -> strip. A separator before 1-2 digits is the decimal
    // mark. Fixes comma-thousands shops (classica "1,200₾" = 1200, not 1.2).
    s = s.replace(/[.,](?=\d{3}(?:\D|$))/g, '');
    s = s.replace(',', '.');
    const gel = parseFloat(s);
    if (!Number.isFinite(gel)) return 0;
    return Math.round(gel * 100);
  }

  private pathOf(url: string): string {
    try {
      return new URL(url).pathname.replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  private absolute(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${this.cfg.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }
}
