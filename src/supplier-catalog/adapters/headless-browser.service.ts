import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'playwright';

export interface RawCard {
  name: string;
  priceText: string;
  url: string;
  img: string | null;
}

export interface ScrapeOptions {
  /** Infinite-scroll the page to load lazy products. */
  scroll?: boolean;
  maxScrolls?: number;
  /** Wait for this selector before extracting (e.g. a product grid). */
  waitSelector?: string;
  /** ms to wait after load / each scroll for client rendering. */
  settleMs?: number;
  /** How many ancestors to climb to find a product card (default 4). */
  cardClimbDepth?: number;
}

/**
 * Shared headless Chromium for the custom/JS-rendered shops that have no API
 * and don't server-render prices. Launched lazily and reused across every
 * headless adapter + the whole sync run; closed on module shutdown.
 *
 * `scrapeListing` renders a listing URL and extracts product cards with a
 * generic in-page heuristic (any link sitting near a ₾ price + image), so most
 * shops need only a listing URL + pagination mode - no per-shop selectors.
 */
@Injectable()
export class HeadlessBrowserService implements OnModuleDestroy {
  private readonly logger = new Logger(HeadlessBrowserService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright');
    this.launching = chromium
      .launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      .then((b: Browser) => {
        this.browser = b;
        this.launching = null;
        this.logger.log('headless chromium launched');
        return b;
      });
    return this.launching as Promise<Browser>;
  }

  async scrapeListing(url: string, opts: ScrapeOptions = {}): Promise<RawCard[]> {
    const { scroll = true, maxScrolls = 25, waitSelector, settleMs = 1200, cardClimbDepth = 4 } = opts;
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      locale: 'ka-GE',
      // Don't download images/fonts - we only read their URLs from the DOM.
      viewport: { width: 1366, height: 1800 },
    });
    const page = await context.newPage();
    // Block heavy resources to speed up and lighten the crawl.
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') return route.abort();
      return route.continue();
    });

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      if (waitSelector) {
        await page.waitForSelector(waitSelector, { timeout: 12000 }).catch(() => undefined);
      }
      await page.waitForTimeout(settleMs);

      if (scroll) {
        let prev = 0;
        for (let i = 0; i < maxScrolls; i++) {
          const count = await page.evaluate(() => document.querySelectorAll('a[href]').length);
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(settleMs);
          const next = await page.evaluate(() => document.querySelectorAll('a[href]').length);
          if (next <= count && next === prev) break; // stable -> done
          prev = count;
        }
      }

      return await page.evaluate(extractCardsInPage, { maxClimb: cardClimbDepth });
    } catch (err) {
      this.logger.warn(`scrapeListing ${url} failed: ${(err as Error).message}`);
      return [];
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    await this.browser?.close().catch(() => undefined);
  }
}

/**
 * Runs in the browser. Finds product cards heuristically: every anchor that has
 * a ₾ price within a few ancestors, carrying an image. Dedups by href.
 * Stringified by Playwright - keep it self-contained (no outer refs).
 */
function extractCardsInPage(arg: { maxClimb: number }): RawCard[] {
  const maxClimb = arg?.maxClimb ?? 4;
  // Match ₾ symbol, "ლარი"/"ლარ" word, or "GEL".
  const priceRe = /(\d[\d\s.,]*)\s*(?:₾|ლარ[ი]?|GEL)/i;
  const seen = new Set<string>();
  const cards: RawCard[] = [];
  const anchors = Array.from(document.querySelectorAll('a[href]'));

  const clean = (s: string) =>
    s.replace(/[{}]/g, ' ').replace(/(fill|stroke|none)\s*:/gi, ' ').replace(/\s+/g, ' ').trim();

  // Image URL from an <img> (incl. lazy attrs) or a CSS background-image. Many
  // shops use background-image divs instead of <img> tags.
  const imageOf = (el: Element): string | null => {
    const img = el.querySelector('img');
    if (img) {
      const s =
        img.getAttribute('data-src') ||
        img.getAttribute('data-lazy-src') ||
        img.getAttribute('data-original') ||
        (img as HTMLImageElement).src;
      if (s && !s.startsWith('data:')) return s;
    }
    const bgEl = /background-image\s*:\s*url/i.test(el.getAttribute('style') || '')
      ? el
      : el.querySelector('[style*="background-image"]');
    if (bgEl) {
      const m = (bgEl.getAttribute('style') || '').match(/url\(["']?([^"')]+)["']?\)/i);
      if (m && m[1] && !m[1].startsWith('data:')) return m[1];
    }
    return null;
  };
  const hasImage = (el: Element): boolean =>
    !!el.querySelector('img') ||
    /background-image\s*:\s*url/i.test(el.getAttribute('style') || '') ||
    !!el.querySelector('[style*="background-image"]');

  for (const a of anchors) {
    const href = (a as HTMLAnchorElement).href;
    if (!href || seen.has(href)) continue;
    if (/\/(cart|checkout|login|wishlist|compare|account|search)\b/i.test(href)) continue;

    // Card = nearest ancestor (incl. the anchor) carrying an image (<img> or a
    // background-image). Handles shops where the price is in the anchor text but
    // the image is a sibling within the card.
    let container: Element | null = a;
    for (let up = 0; !hasImage(container) && up < maxClimb && container?.parentElement; up++) {
      container = container.parentElement;
    }
    if (!container || !hasImage(container)) continue;

    // The card must carry a price somewhere.
    if (!priceRe.test(container.textContent || '')) continue;
    const img = imageOf(container);
    const altImg = container.querySelector('img');

    // Price: prefer a dedicated price element (avoids concatenating two prices).
    let priceText: string | null = null;
    const priceEl = container.querySelector('[class*="price" i]');
    const pm = (priceEl?.textContent || '').match(priceRe);
    if (pm) priceText = pm[0];
    if (!priceText) {
      const cm = (container.textContent || '').match(priceRe);
      priceText = cm ? cm[0] : null;
    }
    if (!priceText) continue;

    // Name: prefer img alt / a[title] / a title-class element (clean, short).
    const candidates = [
      altImg?.getAttribute('alt'),
      (a as HTMLAnchorElement).getAttribute('title'),
      container.querySelector('[class*="title" i],[class*="name" i],h2,h3,h4')?.textContent,
      a.textContent,
    ];
    let name = '';
    const stripPrices = /\d[\d\s.,]*\s*(?:₾|ლარ[ი]?|GEL)/gi;
    for (const c of candidates) {
      const v = clean((c || '').replace(stripPrices, ''));
      if (v.length >= 3) {
        name = v.slice(0, 200);
        break;
      }
    }
    if (!name) continue;

    seen.add(href);
    cards.push({ name, priceText, url: href, img: img && !img.startsWith('data:') ? img : null });
  }

  return cards;
}
