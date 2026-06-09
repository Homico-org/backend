import { Injectable, Logger } from '@nestjs/common';
import { SupplierAdapter } from './supplier-adapter.interface';
import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Deferred. domino.ge blocks plain HTTP (Cloudflare challenge / geo-block), so
 * it needs a headless browser (Playwright/Puppeteer - heavy new dep) or a
 * partner feed. The Supplier row is seeded `isActive: false` so the cron skips
 * it; this stub exists only so the adapter registry stays complete and the
 * decision is documented in code. Revisit with a feed adapter (sourceType
 * 'feed' seam) or an isolated headless worker.
 */
@Injectable()
export class DominoScraperAdapter implements SupplierAdapter {
  readonly supplierKey = 'domino';
  readonly sourceType: SupplierSourceType = 'scrape';
  private readonly logger = new Logger(DominoScraperAdapter.name);

  // eslint-disable-next-line require-yield
  async *listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void> {
    this.logger.warn(
      'domino sync skipped: deferred - needs headless browser or partner feed',
    );
    return;
  }
}
