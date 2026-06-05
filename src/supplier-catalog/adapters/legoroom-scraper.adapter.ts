import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Scrapes legoroom.ge (tiles / flooring / laminate). The store is a custom
 * platform with no JSON-LD or public API, so we parse the listing pages:
 *
 *   listing: https://www.legoroom.ge/ka/products?page=N   (~45 pages, 30/page)
 *   card:    .product-category-item
 *              a[href*="/product/{id}"]   -> externalId + externalUrl
 *              h4.title a                 -> name
 *              span.product-price         -> '110.00 ₾'
 *              img.img-1 / img.img-2      -> images (hotlinked)
 *
 * Stock isn't on the listing pages, so inStock is left undefined in v1.
 * Detail-page stock enrichment is intentionally NOT run on the full crawl to
 * stay polite over ~1300 products.
 *
 * Politeness: sequential fetches with a delay, HomicoBot UA, per-page
 * try/catch (log + continue). robots.txt must be verified before launch.
 */
@Injectable()
export class LegoroomScraperAdapter implements SupplierAdapter {
  readonly supplierKey = 'legoroom';
  readonly sourceType: SupplierSourceType = 'scrape';

  private readonly logger = new Logger(LegoroomScraperAdapter.name);
  private readonly BASE = 'https://www.legoroom.ge';
  private readonly USER_AGENT =
    'Mozilla/5.0 (compatible; HomicoBot/1.0; +https://homico.ge)';
  /** Delay between page fetches (ms) to stay polite. */
  private readonly REQUEST_DELAY_MS = 400;
  /** Hard ceiling so a pager-parse bug can never spin forever. */
  private readonly MAX_PAGES = 200;

  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    const firstHtml = await this.fetchHtml(this.listUrl(1));
    if (!firstHtml) {
      this.logger.warn('legoroom: could not fetch page 1, aborting sync');
      return;
    }

    const lastPage = Math.min(this.parseLastPage(firstHtml), this.MAX_PAGES);
    this.logger.log(`legoroom: crawling ${lastPage} page(s)`);

    for (let page = 1; page <= lastPage; page++) {
      const html =
        page === 1 ? firstHtml : await this.fetchHtml(this.listUrl(page));
      if (!html) {
        this.logger.warn(`legoroom: skipping page ${page} (fetch failed)`);
        continue;
      }

      const products = this.parseCards(html);
      if (products.length === 0 && page > 1) {
        // Empty page past the first usually means we ran off the end.
        this.logger.log(`legoroom: page ${page} empty, stopping`);
        break;
      }
      for (const p of products) yield p;

      if (page < lastPage) await this.delay(this.REQUEST_DELAY_MS);
    }
  }

  async fetchPage(page: number): Promise<NormalizedSupplierProduct[]> {
    const html = await this.fetchHtml(this.listUrl(page));
    return html ? this.parseCards(html) : [];
  }

  private listUrl(page: number): string {
    return `${this.BASE}/ka/products?page=${page}`;
  }

  private async fetchHtml(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': this.USER_AGENT, Accept: 'text/html' },
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.text();
    } catch (err) {
      this.logger.warn(`legoroom: fetch ${url} failed: ${(err as Error).message}`);
      return null;
    }
  }

  /** Read the highest ?page=N from the pager. Falls back to 1. */
  private parseLastPage(html: string): number {
    let max = 1;
    const re = /[?&]page=(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  private parseCards(html: string): NormalizedSupplierProduct[] {
    const $ = cheerio.load(html);
    const out: NormalizedSupplierProduct[] = [];

    $('.product-category-item').each((_, el) => {
      const card = $(el);
      const href = card.find('a[href*="/product/"]').first().attr('href') || '';
      const idMatch = href.match(/\/product\/(\d+)/);
      if (!idMatch) return;
      const externalId = idMatch[1];
      const externalUrl = this.absolute(href);

      const name =
        card.find('h4.title a').first().text().trim() ||
        card.find('img.img-1').first().attr('alt')?.trim() ||
        '';
      if (!name) return;

      const rawPrice = card.find('.product-price').first().text().trim();
      const priceMinor = this.parsePriceMinor(rawPrice);

      const imageUrls = card
        .find('.thumb img')
        .map((__, img) => this.absolute($(img).attr('src') || ''))
        .get()
        .filter((u) => !!u);

      out.push({
        externalId,
        externalUrl,
        name,
        nameKa: name,
        priceMinor,
        currency: 'GEL',
        rawPrice: rawPrice || undefined,
        imageUrls,
        inStock: undefined,
      });
    });

    return out;
  }

  /** '110.00 ₾' -> 11000 tetri. */
  private parsePriceMinor(raw: string): number {
    if (!raw) return 0;
    const cleaned = raw.replace(/[^\d.,]/g, '').replace(',', '.');
    const gel = parseFloat(cleaned);
    if (!Number.isFinite(gel)) return 0;
    return Math.round(gel * 100);
  }

  private absolute(url: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${this.BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
