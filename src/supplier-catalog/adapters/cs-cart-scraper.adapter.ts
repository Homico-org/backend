import { Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Config-driven scraper for CS-Cart shops on the Unitheme2 theme. Both iMart
 * and Gorgia run this exact stack, so one adapter + per-shop config covers them
 * (and any future CS-Cart shop in Georgia).
 *
 * DOM contract (verified on imart.ge + gorgia.ge):
 *   product block   .ut2-gl__item
 *   id              input[name="product_data[<id>][product_id]"] value
 *   name + url      a.product-title  (title attr + href, SEO-slug URL)
 *   price           first .ty-price-num text (digits wrapped in U+200D joiners)
 *   image           .ut2-gl__image img  (data-src lazyload, fallback src)
 *   out of stock    "out_of_stock" / "out-of-stock" token within the block
 *   subcategories   .ut2__subcategories a  (iMart top cats are landing pages)
 *
 * Two category shapes handled via `followSubcategories`:
 *   - iMart: top categories are subcategory LANDINGS (0 products) -> BFS down
 *     `.ut2__subcategories a` to leaf categories that hold products.
 *   - Gorgia: categories AGGREGATE descendant products and paginate directly,
 *     so seeds + ?page=N suffice (followSubcategories off).
 *
 * Politeness: realistic browser UA, Accept-Language ka, paced fetches, per-page
 * try/catch (log + continue). robots.txt verified to permit category crawling.
 */
export interface CsCartSelectors {
  item: string;
  productIdInput: string;
  title: string;
  priceNum: string;
  image: string;
  subcategory: string;
}

export interface CsCartAdapterConfig {
  supplierKey: string;
  baseUrl: string;
  /** Renovation-relevant category URLs to start from (absolute or path). */
  categorySeeds: string[];
  /** Follow `.ut2__subcategories a` to leaf categories (iMart). */
  followSubcategories?: boolean;
  itemsPerPage?: number;
  language?: string;
  requestDelayMs?: number;
  maxCategories?: number;
  maxPagesPerCategory?: number;
  selectors?: Partial<CsCartSelectors>;
}

// Theme-agnostic: `.ut2-gl__item` is Unitheme2 (iMart/Gorgia/thermocenter),
// `.ty-grid-list__item` is stock CS-Cart (goodbuild). Image `img.ty-pict` and
// the rest are identical across both themes.
const DEFAULT_SELECTORS: CsCartSelectors = {
  item: '.ut2-gl__item, .ty-grid-list__item',
  productIdInput: 'input[name$="[product_id]"]',
  // `.product-title` matches both Unitheme2's <a> and vanilla's <span>.
  title: '.product-title',
  priceNum: '.ty-price-num',
  image: '.ut2-gl__image img, img.ty-pict',
  subcategory: '.ut2__subcategories a',
};

export class CsCartScraperAdapter implements SupplierAdapter {
  readonly supplierKey: string;
  readonly sourceType: SupplierSourceType = 'scrape';

  private readonly logger: Logger;
  private readonly cfg: Required<
    Omit<CsCartAdapterConfig, 'selectors' | 'followSubcategories'>
  > & { followSubcategories: boolean; selectors: CsCartSelectors };
  /** Encoded pathnames of the seed categories; only their descendants crawl. */
  private readonly allowedPrefixes: string[];
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

  constructor(config: CsCartAdapterConfig) {
    this.supplierKey = config.supplierKey;
    this.logger = new Logger(`CsCart:${config.supplierKey}`);
    this.cfg = {
      supplierKey: config.supplierKey,
      baseUrl: config.baseUrl.replace(/\/$/, ''),
      categorySeeds: config.categorySeeds,
      followSubcategories: config.followSubcategories ?? false,
      itemsPerPage: config.itemsPerPage ?? 48,
      language: config.language ?? 'ka',
      requestDelayMs: config.requestDelayMs ?? 600,
      maxCategories: config.maxCategories ?? 400,
      maxPagesPerCategory: config.maxPagesPerCategory ?? 80,
      selectors: { ...DEFAULT_SELECTORS, ...(config.selectors ?? {}) },
    };
    this.allowedPrefixes = this.cfg.categorySeeds.map((u) => {
      const p = new URL(this.absolute(u)).pathname;
      return p.endsWith('/') ? p : `${p}/`;
    });
  }

  /** A category URL is crawlable iff it sits under a configured seed subtree. */
  private isAllowedCategory(url: string): boolean {
    try {
      const path = new URL(url).pathname;
      return this.allowedPrefixes.some((prefix) => path.startsWith(prefix));
    } catch {
      return false;
    }
  }

  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    const visited = new Set<string>();
    const queue: string[] = this.cfg.categorySeeds.map((u) => this.absolute(u));

    while (queue.length > 0 && visited.size < this.cfg.maxCategories) {
      const categoryUrl = queue.shift() as string;
      const norm = categoryUrl.split('?')[0];
      if (visited.has(norm)) continue;
      visited.add(norm);

      let categoryLabel: string | undefined;
      const seenInCategory = new Set<string>();

      for (let page = 1; page <= this.cfg.maxPagesPerCategory; page++) {
        const html = await this.fetchHtml(this.pageUrl(categoryUrl, page));
        if (!html) break;
        const $ = cheerio.load(html);

        if (page === 1) {
          categoryLabel = $('h1').first().text().trim() || undefined;
          if (this.cfg.followSubcategories) {
            // The CS-Cart mega-menu (present on every page) lists the full
            // category tree. Enqueue every link that sits under a seed subtree;
            // product detail URLs are root-level single slugs and never match.
            $('a[href]').each((_, a) => {
              const href = $(a).attr('href');
              if (!href) return;
              const sub = this.absolute(href).split(/[?#]/)[0];
              if (
                sub.startsWith(this.cfg.baseUrl) &&
                !visited.has(sub) &&
                this.isAllowedCategory(sub)
              ) {
                queue.push(sub);
              }
            });
          }
        }

        const products = this.parseProducts(
          $,
          norm,
          categoryLabel,
        );
        if (products.length === 0) break;

        let fresh = 0;
        for (const p of products) {
          if (seenInCategory.has(p.externalId)) continue;
          seenInCategory.add(p.externalId);
          fresh++;
          yield p;
        }
        // No new ids on this page -> the site ignored `page` (clamped to last).
        if (fresh === 0) break;

        await this.delay(this.cfg.requestDelayMs);
      }

      await this.delay(this.cfg.requestDelayMs);
    }
  }

  private parseProducts(
    $: cheerio.CheerioAPI,
    categoryKey: string,
    categoryLabel?: string,
  ): NormalizedSupplierProduct[] {
    const out: NormalizedSupplierProduct[] = [];
    const sel = this.cfg.selectors;
    const categorySlug = this.slugFromUrl(categoryKey);

    $(sel.item).each((_, el) => {
      const item = $(el);
      const externalId = (
        item.find(sel.productIdInput).first().attr('value') || ''
      ).trim();
      if (!externalId) return;

      const titleEl = item.find(sel.title).first();
      const name = (
        titleEl.attr('title') ||
        titleEl.text() ||
        ''
      ).trim();
      if (!name) return;

      // Unitheme2 puts the href on the title anchor itself; the vanilla theme
      // (cavoli) uses a <span class="product-title"> wrapped in an ancestor <a>.
      const href =
        titleEl.attr('href') ||
        titleEl.closest('a').attr('href') ||
        item.find('a.product-title, a.ty-grid-list__item-name, .ty-grid-list__info').first().attr('href') ||
        '';
      const externalUrl = this.absolute(href);

      const priceMinor = this.parsePriceMinor(
        item.find(sel.priceNum).first().text(),
      );

      const imgEl = item.find(sel.image).first();
      const rawSrc = imgEl.attr('data-src') || imgEl.attr('src') || '';
      const imageUrls =
        rawSrc && !rawSrc.startsWith('data:') ? [this.absolute(rawSrc)] : [];

      const blockHtml = item.html() || '';
      const inStock = /out[_-]of[_-]stock/i.test(blockHtml) ? false : undefined;

      out.push({
        externalId,
        externalUrl,
        name,
        nameKa: name,
        priceMinor,
        currency: 'GEL',
        rawPrice: item.find(sel.priceNum).first().text().trim() || undefined,
        imageUrls,
        category: categorySlug,
        categoryLabel: categoryLabel || categorySlug,
        inStock,
      });
    });

    return out;
  }

  private pageUrl(categoryUrl: string, page: number): string {
    const u = new URL(categoryUrl);
    // CS-Cart SEO URLs 404 without a trailing slash before the query string.
    if (!u.pathname.endsWith('/')) u.pathname += '/';
    u.searchParams.set('page', String(page));
    if (this.cfg.itemsPerPage) {
      u.searchParams.set('items_per_page', String(this.cfg.itemsPerPage));
    }
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

  /**
   * First .ty-price-num text -> tetri. CS-Cart wraps digits in zero-width
   * joiners and may use a comma decimal; stripping everything but [0-9.,]
   * removes the joiners too.
   */
  private parsePriceMinor(raw: string): number {
    if (!raw) return 0;
    let s = raw.replace(/[^\d.,]/g, '');
    // Both separators -> comma is thousands; else comma is the decimal mark.
    s = s.includes(',') && s.includes('.') ? s.replace(/,/g, '') : s.replace(',', '.');
    const gel = parseFloat(s);
    if (!Number.isFinite(gel)) return 0;
    return Math.round(gel * 100);
  }

  private absolute(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${this.cfg.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  private slugFromUrl(url: string): string {
    try {
      const path = new URL(url).pathname.replace(/\/+$/, '');
      const seg = decodeURIComponent(path.split('/').filter(Boolean).pop() || '');
      return seg || url;
    } catch {
      return url;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
