import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { Supplier } from './schemas/supplier.schema';
import { SupplierSyncService } from './supplier-sync.service';

/**
 * Nightly crawl of every active supplier, run SEQUENTIALLY (one shop at a time)
 * so we never hammer multiple shops at once. Best-effort: a failure on one shop
 * logs and continues to the next. Auto-includes any newly-seeded active shop -
 * no per-shop wiring. Runs once off-peak; a full pass across all shops is long
 * but that's fine for a background job.
 */
@Injectable()
export class SupplierCatalogCronService {
  private readonly logger = new Logger(SupplierCatalogCronService.name);

  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<Supplier>,
    private readonly syncService: SupplierSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'supplier-catalog-nightly-sync' })
  async nightlySync() {
    const suppliers = await this.supplierModel
      .find({ isActive: true })
      .select('key')
      .sort({ key: 1 })
      .lean<{ key: string }[]>();

    if (suppliers.length === 0) return;
    this.logger.log(`Nightly supplier sync: ${suppliers.length} shop(s)`);

    for (const s of suppliers) {
      try {
        await this.syncService.syncSupplier(s.key);
      } catch (err) {
        this.logger.warn(
          `Nightly sync failed for ${s.key}: ${(err as Error).message}`,
        );
      }
    }
  }
}
