/**
 * Manually run the supplier-catalog sync for one or more shops.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/sync-suppliers.ts legoroom imart gorgia
 *
 * Boots the real Nest app context and runs each shop's adapter sequentially.
 * Use to backfill after schema changes (e.g. the searchText field) or to
 * populate a freshly-added shop without waiting for the nightly cron.
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { SupplierCatalogService } from '../src/supplier-catalog/supplier-catalog.service';
import { SupplierSyncService } from '../src/supplier-catalog/supplier-sync.service';

dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  const log = new Logger('sync-suppliers');
  const keys = process.argv.slice(2);
  if (keys.length === 0) {
    log.error('usage: sync-suppliers.ts <supplierKey> [supplierKey...]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const catalog = app.get(SupplierCatalogService);
    const sync = app.get(SupplierSyncService);

    await catalog.seedSuppliers();
    log.log(`seeded suppliers; syncing: ${keys.join(', ')}`);

    for (const key of keys) {
      const startedAt = Date.now();
      log.log(`--- syncing ${key} ...`);
      try {
        const summary = await sync.syncSupplier(key);
        log.log(
          `--- ${key} done in ${Math.round((Date.now() - startedAt) / 1000)}s: ${JSON.stringify(summary)}`,
        );
      } catch (err) {
        log.error(`--- ${key} FAILED: ${(err as Error).message}`);
      }
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('sync-suppliers failed:', err);
    process.exit(1);
  });
