import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Supplier } from './schemas/supplier.schema';
import { SupplierProduct } from './schemas/supplier-product.schema';
import {
  SUPPLIER_ADAPTERS,
  SupplierAdapter,
} from './adapters/supplier-adapter.interface';
import { NormalizedSupplierProduct } from './adapters/normalized-product.dto';

export interface SyncSummary {
  scanned: number;
  upserted: number;
  markedUnavailable: number;
  durationMs: number;
}

// Some shops serve a generic placeholder (e.g. classica's bag.svg) when a
// product has no real photo. Drop those so the catalog stores real images or
// nothing - the UI then shows its own clean fallback.
const PLACEHOLDER_IMAGE_RE =
  /(\/bag\.svg)|placeholder|no[-_]?image|noimage|default[-_]?(product|image)/i;

export function stripPlaceholderImages(urls: string[] = []): string[] {
  return urls.filter((u) => u && !PLACEHOLDER_IMAGE_RE.test(u));
}

/**
 * Runs a supplier's adapter, upserts every product on (supplierKey, externalId),
 * and retires anything not seen this run by flipping isAvailable=false. Records
 * status + stats on the Supplier row so the admin surface can report on it.
 *
 * Best-effort: a thrown adapter still records 'error' on the supplier.
 */
@Injectable()
export class SupplierSyncService {
  private readonly logger = new Logger(SupplierSyncService.name);

  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<Supplier>,
    @InjectModel(SupplierProduct.name)
    private readonly productModel: Model<SupplierProduct>,
    @Inject(SUPPLIER_ADAPTERS)
    private readonly adapters: SupplierAdapter[],
  ) {}

  private adapterFor(key: string): SupplierAdapter {
    const adapter = this.adapters.find((a) => a.supplierKey === key);
    if (!adapter) {
      throw new NotFoundException(`No adapter registered for supplier '${key}'`);
    }
    return adapter;
  }

  /**
   * Kick off a sync without blocking the caller. A full crawl takes minutes -
   * far longer than an HTTP request should hold open - so the admin endpoint
   * uses this and then polls supplier status. Skips if one is already running.
   */
  async startSync(
    supplierKey: string,
  ): Promise<{ started: boolean; status: string; message?: string }> {
    this.adapterFor(supplierKey); // validates the key
    const supplier = await this.supplierModel
      .findOne({ key: supplierKey })
      .select('lastSyncStatus')
      .lean<{ lastSyncStatus: string } | null>();
    if (!supplier) {
      throw new NotFoundException(
        `Supplier '${supplierKey}' not found - seed it first`,
      );
    }
    if (supplier.lastSyncStatus === 'running') {
      return {
        started: false,
        status: 'running',
        message: 'A sync is already in progress',
      };
    }
    // Fire-and-forget; syncSupplier records its own success/error status.
    void this.syncSupplier(supplierKey).catch((err) =>
      this.logger.error(
        `Background sync for ${supplierKey} failed: ${(err as Error).message}`,
      ),
    );
    return { started: true, status: 'running' };
  }

  async syncSupplier(supplierKey: string): Promise<SyncSummary> {
    const adapter = this.adapterFor(supplierKey);
    const supplier = await this.supplierModel.findOne({ key: supplierKey });
    if (!supplier) {
      throw new NotFoundException(
        `Supplier '${supplierKey}' not found - seed it first`,
      );
    }

    const startedAt = new Date();
    supplier.lastSyncStatus = 'running';
    await supplier.save();

    let scanned = 0;
    let upserted = 0;
    const BATCH = 100;
    let buffer: NormalizedSupplierProduct[] = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const ids = buffer.map((p) => p.externalId);
      // One read for the whole batch to diff prices for the history seam.
      const existing = await this.productModel
        .find({ supplierKey, externalId: { $in: ids } })
        .select('externalId priceMinor')
        .lean<{ externalId: string; priceMinor: number }[]>();
      const priceByExt = new Map(existing.map((e) => [e.externalId, e.priceMinor]));

      const ops = buffer.map((p) => {
        const realImages = stripPlaceholderImages(p.imageUrls);
        const set: Record<string, unknown> = {
          supplierKey,
          externalUrl: p.externalUrl,
          name: p.name,
          nameKa: p.nameKa,
          searchText: this.buildSearchText(p),
          priceMinor: p.priceMinor,
          currency: p.currency,
          imageUrl: realImages[0],
          imageUrls: realImages,
          category: p.category,
          categoryLabel: p.categoryLabel,
          rawPrice: p.rawPrice,
          sourceType: adapter.sourceType,
          attributes: p.attributes,
          isAvailable: true,
          lastSeenAt: startedAt,
        };
        if (p.inStock !== undefined) set.inStock = p.inStock;

        const update: Record<string, unknown> = {
          $set: set,
          $setOnInsert: { externalId: p.externalId },
        };
        const prev = priceByExt.get(p.externalId);
        if (prev !== undefined && prev !== p.priceMinor) {
          update.$push = {
            priceHistory: { priceMinor: p.priceMinor, at: startedAt },
          };
        }
        return {
          updateOne: {
            filter: { supplierKey, externalId: p.externalId },
            update,
            upsert: true,
          },
        };
      });

      await this.productModel.bulkWrite(ops, { ordered: false });
      upserted += buffer.length;
      buffer = [];
    };

    try {
      for await (const p of adapter.listProducts()) {
        scanned++;
        buffer.push(p);
        if (buffer.length >= BATCH) await flush();
      }
      await flush();

      // Retire products no longer present at the source.
      const retired = await this.productModel.updateMany(
        {
          supplierKey,
          isAvailable: true,
          lastSeenAt: { $lt: startedAt },
        },
        { $set: { isAvailable: false } },
      );
      const markedUnavailable = retired.modifiedCount ?? 0;

      const productCount = await this.productModel.countDocuments({
        supplierKey,
        isAvailable: true,
      });

      const durationMs = Date.now() - startedAt.getTime();
      const summary: SyncSummary = {
        scanned,
        upserted,
        markedUnavailable,
        durationMs,
      };

      supplier.lastSyncedAt = new Date();
      supplier.lastSyncStatus = scanned === 0 ? 'partial' : 'success';
      supplier.lastSyncError = undefined;
      supplier.productCount = productCount;
      supplier.lastSyncStats = summary;
      await supplier.save();

      this.logger.log(
        `sync ${supplierKey}: scanned=${scanned} upserted=${upserted} retired=${markedUnavailable} in ${durationMs}ms`,
      );
      return summary;
    } catch (err) {
      supplier.lastSyncStatus = 'error';
      supplier.lastSyncError = (err as Error).message;
      await supplier.save();
      this.logger.error(
        `sync failed for ${supplierKey}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /** Lowercased name + nameKa + category - the field search matches against. */
  private buildSearchText(p: NormalizedSupplierProduct): string {
    return [p.name, p.nameKa, p.categoryLabel, p.category]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }
}
