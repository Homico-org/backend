import { Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Config-driven scraper for shops on the Storera SaaS platform (e.g. kasco.ge,
 * served from <shop>.storera.ge). Storera server-renders its Bootstrap product
 * grid, so a plain cheerio crawl is enough - no headless browser needed.
 *
 * DOM contract (verified on kasco.storera.ge):
 *   product card    .card  (holds one product; skip cards without a product link)
 *   url             a.productitem-image[href^="/products/"]  (SEO-slug URL)
 *   externalId      the /products/<slug> pathname (stable + unique per shop)
 *   name            h5.card-text.ellipsis  (the sibling div.card-text.ellipsis is
 *                   the spec blurb, NOT the name)
 *   price           .text-md  (CURRENT price; the lari sign is an <i> icon so the
 *                   element's text is just the digits). .text-danger is the
 *                   struck-through OLD price and is deliberately ignored.
 *   image           background-image url() on a.productitem-image (relative
 *                   /files/products/...), made absolute.
 *
 * Category listings live at /categories/<slug> and paginate with ?page=N. We
 * stop a category as soon as a page yields no new product ids (Storera clamps
 * out-of-range pages to the last one instead of 404-ing).
 *
 * Politeness: realistic browser UA, Accept-Language ka, paced fetches, per-page
 * try/catch (log + continue).
 */
export interface StoreraAdapterConfig {
  supplierKey: string;
  baseUrl: string;
  /** Category listing URLs to crawl (absolute or path). */
  categorySeeds: string[];
  language?: string;
  requestDelayMs?: number;
  maxPagesPerCategory?: number;
}

export class StoreraScraperAdapter implements SupplierAdapter {
  readonly supplierKey: string;
  readonly sourceType: SupplierSourceType = 'scrape';

  private readonly logger: Logger;
  private readonly cfg: Required<StoreraAdapterConfig>;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  constructor(config: StoreraAdapterConfig) {
    this.supplierKey = config.supplierKey;
    this.logger = new Logger(`Storera:${config.supplierKey}`);
    this.cfg = {
      supplierKey: config.supplierKey,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      categorySeeds: config.categorySeeds,
      language: config.language ?? 'ka',
      requestDelayMs: config.requestDelayMs ?? 500,
      maxPagesPerCategory: config.maxPagesPerCategory ?? 60,
    };
  }

  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    // Dedup across categories: a product listed under several categories is
    // yielded once (the first category that surfaces it wins the label).
    const seenGlobal = new Set<string>();

    for (const seed of this.cfg.categorySeeds) {
      const categoryUrl = this.absolute(seed);
      const categorySlug = this.slugFromUrl(categoryUrl);
      let categoryLabel: string | undefined;
      const seenInCategory = new Set<string>();

      for (let page = 1; page <= this.cfg.maxPagesPerCategory; page++) {
        const html = await this.fetchHtml(this.pageUrl(categoryUrl, page));
        if (!html) break;
        const $ = cheerio.load(html);

        if (page === 1) {
          categoryLabel = $('h1').first().text().trim() || undefined;
        }

        const products = this.parseProducts($, categorySlug, categoryLabel);
        if (products.length === 0) break;

        let fresh = 0;
        for (const p of products) {
          if (seenInCategory.has(p.externalId)) continue;
          seenInCategory.add(p.externalId);
          fresh++;
          if (seenGlobal.has(p.externalId)) continue;
          seenGlobal.add(p.externalId);
          yield p;
        }
        // No new ids on this page -> Storera clamped `page` to the last one.
        if (fresh === 0) break;

        await this.delay(this.cfg.requestDelayMs);
      }

      await this.delay(this.cfg.requestDelayMs);
    }
  }

  private parseProducts(
    $: cheerio.CheerioAPI,
    categorySlug: string,
    categoryLabel?: string,
  ): NormalizedSupplierProduct[] {
    const out: NormalizedSupplierProduct[] = [];

    $('a.productitem-image[href]').each((_, a) => {
      const anchor = $(a);
      const href = (anchor.attr('href') || '').trim();
      if (!href || !href.includes('/products/')) return;

      const externalUrl = this.absolute(href);
      const externalId = this.pathOf(externalUrl);
      if (!externalId) return;

      const card = anchor.closest('.card');

      // Name: the h5 title (skip the sibling spec blurb div.card-text.ellipsis).
      const name = (card.find('h5.card-text.ellipsis').first().text() || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!name) return;

      // Current price lives in .text-md (lari is an <i> icon -> text = digits).
      const rawPrice = (card.find('.text-md').first().text() || '')
        .replace(/\s+/g, ' ')
        .trim();
      const priceMinor = this.parsePriceMinor(rawPrice);
      // Storera lists some POA items (water fountains etc.) at 0 - not sellable
      // in the shop, so skip them (same as the headless adapter does).
      if (priceMinor <= 0) return;

      // Image: background-image url() on the anchor (relative -> absolute).
      const style = anchor.attr('style') || '';
      const m = style.match(/url\(["']?([^"')]+)["']?\)/i);
      const imageUrls =
        m && m[1] && !m[1].startsWith('data:') ? [this.absolute(m[1])] : [];

      out.push({
        externalId,
        externalUrl,
        name,
        nameKa: name,
        priceMinor,
        currency: 'GEL',
        rawPrice: rawPrice || undefined,
        imageUrls,
        category: categorySlug,
        categoryLabel: categoryLabel || categorySlug,
        inStock: undefined,
      });
    });

    return out;
  }

  /** seed/base -> page N url (?page=N; page 1 is the bare category url). */
  private pageUrl(categoryUrl: string, page: number): string {
    if (page <= 1) return categoryUrl;
    const u = new URL(categoryUrl);
    u.searchParams.set('page', String(page));
    return u.toString();
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept-Language': `${this.cfg.language},${this.cfg.language}-GE;q=0.9`,
          Accept: 'text/html',
        },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.text();
    } catch (err) {
      this.logger.warn(
        `${this.supplierKey}: fetch ${url} failed: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Digits-only price text -> tetri. Handles thousands/decimal separators. */
  private parsePriceMinor(raw: string): number {
    if (!raw) return 0;
    let s = raw.replace(/[^\d.,]/g, '');
    // A separator grouping exactly 3 digits is a thousands separator -> strip;
    // otherwise it's the decimal mark.
    s = s.replace(/[.,](?=\d{3}(?:\D|$))/g, '');
    s = s.replace(',', '.');
    const gel = parseFloat(s);
    if (!Number.isFinite(gel)) return 0;
    return Math.round(gel * 100);
  }

  private absolute(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${this.cfg.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  private pathOf(url: string): string {
    try {
      return decodeURIComponent(new URL(url).pathname).replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  private slugFromUrl(url: string): string {
    try {
      const path = new URL(url).pathname.replace(/\/+$/, '');
      return decodeURIComponent(path.split('/').filter(Boolean).pop() || '') || url;
    } catch {
      return url;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
