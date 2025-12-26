/**
 * Migrate portfolio projects from User documents to PortfolioItem collection
 *
 * Usage:
 *   npx ts-node scripts/migrate-portfolio-projects.ts dev
 *   npx ts-node scripts/migrate-portfolio-projects.ts prod
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

// Check for command line argument for database
const args = process.argv.slice(2);
const targetEnv = args[0] || 'dev';

// Database URIs
const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI?.replace('/homi?', '/homi_prod?') || '',
  dev: process.env.MONGODB_URI?.replace('/homi?', '/homi_dev?') || ''
};

// Portfolio item schema
const portfolioItemSchema = new mongoose.Schema({
  proId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String, required: true },
  images: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  projectDate: { type: Date },
  completedDate: { type: Date },
  location: { type: String },
  displayOrder: { type: Number, default: 0 },
  projectType: { type: String, enum: ['quick', 'project', 'job'], default: 'project' },
  status: { type: String, enum: ['completed', 'in_progress'], default: 'completed' },
  source: { type: String, enum: ['external', 'homico'], default: 'external' },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
}, { timestamps: true });

// User schema (minimal for this migration)
const userSchema = new mongoose.Schema({
  role: { type: String },
  portfolioProjects: { type: Array, default: [] },
});

async function migratePortfolioProjects(dbUri: string, envName: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Migrating ${envName.toUpperCase()} database...`);
  console.log(`${'='.repeat(50)}`);

  const connection = await mongoose.createConnection(dbUri).asPromise();
  const User = connection.model('User', userSchema);
  const PortfolioItem = connection.model('PortfolioItem', portfolioItemSchema);

  // Find all pros with portfolioProjects
  const prosWithPortfolio = await User.find({
    role: 'pro',
    portfolioProjects: { $exists: true, $ne: [] }
  }).exec();

  console.log(`Found ${prosWithPortfolio.length} pros with portfolio projects`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const pro of prosWithPortfolio) {
    try {
      const existingItems = await PortfolioItem.countDocuments({ proId: pro._id });

      if (existingItems > 0) {
        console.log(`[SKIP] Pro ${pro._id} already has ${existingItems} portfolio items`);
        skipped++;
        continue;
      }

      const portfolioItems = pro.portfolioProjects.map((project: any, index: number) => ({
        proId: pro._id,
        title: project.title || `Project ${index + 1}`,
        description: project.description || '',
        imageUrl: project.images?.[0] || '',
        images: project.images || [],
        source: 'external',
        status: 'completed',
        projectType: 'project',
        displayOrder: index,
      }));

      if (portfolioItems.length > 0) {
        await PortfolioItem.insertMany(portfolioItems);
        console.log(`[OK] Migrated ${portfolioItems.length} projects for pro ${pro._id}`);
        migrated++;
      }
    } catch (error: any) {
      console.log(`[ERROR] Failed for pro ${pro._id}: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${envName.toUpperCase()} Results:`);
  console.log(`Migrated: ${migrated} | Skipped: ${skipped} | Failed: ${failed}`);

  await connection.close();
  return { migrated, skipped, failed };
}

async function main() {
  console.log('Portfolio Projects Migration Script');
  console.log(`Target: ${targetEnv}`);

  const dbUri = DB_URIS[targetEnv];

  if (!dbUri) {
    console.error(`Database URI for ${targetEnv} not configured`);
    process.exit(1);
  }

  try {
    await migratePortfolioProjects(dbUri, targetEnv);
    console.log('\n✅ Migration completed!');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
