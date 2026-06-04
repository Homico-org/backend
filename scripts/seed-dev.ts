/**
 * One-command dev environment seeder.
 *
 *   npm run seed:dev
 *
 * Does three things, in order:
 *   1. Seeds the service catalog (categories, subcategories, services,
 *      unit options, pricing) via the real ServiceCatalogService - same
 *      code path the admin `POST /catalog/seed` button uses. Idempotent.
 *   2. Upserts 12 realistic demo users (8 pros + 4 clients, Georgian
 *      names) via the existing seed-demo-pros.ts script. All share the
 *      password `Demo123!`. Re-running just refreshes the docs.
 *   3. Creates / promotes a dev admin (admin@demo.ge / DevAdmin1234)
 *      via the existing make-admin.ts script. Idempotent.
 *
 * Safety: refuses to run unless MONGODB_URI's path is exactly
 * `homi_dev`. Prevents accidentally seeding into `homi_prod` or the
 * legacy `homi` database.
 */

import { spawnSync } from 'child_process';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ServiceCatalogService } from '../src/service-catalog/service-catalog.service';
import { buildSeedData } from '../src/service-catalog/seed';

dotenv.config({ path: resolve(__dirname, '../.env') });

// ---- Defaults for the dev admin -------------------------------------------
//
// Hardcoded because this script ONLY runs against homi_dev (enforced
// below). If you want different credentials, set the env vars before
// invoking - they're read by make-admin.ts.

const DEV_ADMIN_DEFAULTS = {
  MAKE_ADMIN_EMAIL: 'admin@demo.ge',
  MAKE_ADMIN_PASSWORD: 'DevAdmin1234',
  MAKE_ADMIN_PHONE: '+995599000000',
  MAKE_ADMIN_NAME: 'Dev Admin',
};

// ---- Safety guard ---------------------------------------------------------

function assertHomiDev(): void {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('\nMONGODB_URI missing from backend/.env');
    process.exit(1);
  }
  // Path segment after the host - this is the database name Mongoose
  // will use. Match `/homi_dev` followed by `?` or end-of-string.
  if (!/\/homi_dev(\?|$)/.test(uri)) {
    const safe = uri.replace(/\/\/[^@]+@/, '//***:***@');
    console.error(
      `\nABORT: seed:dev refuses to write to anything other than homi_dev.\n` +
        `Current MONGODB_URI: ${safe}\n` +
        `Edit backend/.env so the path ends with /homi_dev?... and try again.`,
    );
    process.exit(2);
  }
}

// ---- Step 1: seed the service catalog -------------------------------------

async function seedCatalog(): Promise<void> {
  const logger = new Logger('seed-dev:catalog');
  logger.log('Bootstrapping Nest application context...');

  // Headless Nest - no HTTP listener, just the DI container.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(ServiceCatalogService);
    const data = buildSeedData();
    logger.log(`Seeding ${data.length} categories into homi_dev...`);
    const result = await service.seed(data);
    logger.log(
      `Catalog done: ${result.inserted} inserted, ${result.updated} updated, ${result.removed} removed.`,
    );
  } finally {
    await app.close();
  }
}

// ---- Step 2: seed demo users (via existing script) ------------------------

function seedDemoUsers(): void {
  console.log('\n[seed-dev] Running seed-demo-pros.ts...');
  const result = spawnSync(
    'npx',
    ['ts-node', 'scripts/seed-demo-pros.ts'],
    {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
      env: process.env, // inherits MONGODB_URI from .env loaded above
    },
  );
  if (result.status !== 0) {
    console.error('[seed-dev] seed-demo-pros.ts failed');
    process.exit(result.status ?? 1);
  }
}

// ---- Step 3: make admin (via existing script) -----------------------------

function makeAdmin(): void {
  console.log('\n[seed-dev] Running make-admin.ts...');
  // Caller can override any of the defaults by exporting the env var
  // before running `npm run seed:dev`.
  const childEnv = { ...process.env };
  for (const [key, value] of Object.entries(DEV_ADMIN_DEFAULTS)) {
    if (!childEnv[key]) childEnv[key] = value;
  }
  const result = spawnSync(
    'npx',
    ['ts-node', 'scripts/make-admin.ts'],
    {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
      env: childEnv,
    },
  );
  if (result.status !== 0) {
    console.error('[seed-dev] make-admin.ts failed');
    process.exit(result.status ?? 1);
  }
}

// ---- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  assertHomiDev();

  await seedCatalog();
  seedDemoUsers();
  makeAdmin();

  console.log('\n' + '='.repeat(70));
  console.log('  Dev environment ready.');
  console.log('='.repeat(70));
  console.log('  Admin:   admin@demo.ge / DevAdmin1234');
  console.log('  Demo pros + clients: see table above (all use Demo123!)');
  console.log('='.repeat(70) + '\n');
}

main().catch((err) => {
  console.error('\n[seed-dev] Fatal:', err);
  process.exit(1);
});
