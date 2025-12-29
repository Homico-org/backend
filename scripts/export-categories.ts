/**
 * Export categories from MongoDB to JSON
 *
 * Usage:
 *   npx ts-node scripts/export-categories.ts [prod|dev]
 *
 * Output:
 *   Creates scripts/categories-export.json with current categories data
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

// Check for command line argument for database
const args = process.argv.slice(2);
const targetEnv = args[0] || 'prod';

// Database URIs
const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI?.replace('/homi?', '/homi_prod?') || '',
  dev: process.env.MONGODB_URI?.replace('/homi?', '/homi_dev?') || ''
};

const MONGODB_URI = DB_URIS[targetEnv] || DB_URIS.prod;
console.log(`Target environment: ${targetEnv}`);

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Category schema
const subSubcategorySchema = new mongoose.Schema({
  key: String,
  name: String,
  nameKa: String,
  icon: String,
  keywords: [String],
  sortOrder: Number,
  isActive: Boolean,
}, { _id: false });

const subcategorySchema = new mongoose.Schema({
  key: String,
  name: String,
  nameKa: String,
  icon: String,
  keywords: [String],
  sortOrder: Number,
  isActive: Boolean,
  children: [subSubcategorySchema],
}, { _id: false });

const categorySchema = new mongoose.Schema({
  key: String,
  name: String,
  nameKa: String,
  description: String,
  descriptionKa: String,
  icon: String,
  keywords: [String],
  isActive: Boolean,
  sortOrder: Number,
  subcategories: [subcategorySchema],
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

async function exportCategories() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully!\n');

  const categories = await Category.find({}).lean().exec();

  console.log(`Found ${categories.length} categories:\n`);

  for (const cat of categories) {
    console.log(`- ${cat.key}: ${cat.name} (${cat.nameKa})`);
    if (cat.subcategories && cat.subcategories.length > 0) {
      for (const sub of cat.subcategories) {
        console.log(`  - ${sub.key}: ${sub.name} (${sub.nameKa})`);
        if (sub.children && sub.children.length > 0) {
          for (const child of sub.children) {
            console.log(`    - ${child.key}: ${child.name} (${child.nameKa})`);
          }
        }
      }
    }
  }

  // Remove MongoDB-specific fields for clean export
  const cleanCategories = categories.map(cat => {
    const { _id, __v, createdAt, updatedAt, ...rest } = cat as any;
    return rest;
  });

  const outputPath = resolve(__dirname, 'categories-export.json');
  fs.writeFileSync(outputPath, JSON.stringify(cleanCategories, null, 2));

  console.log(`\nExported to: ${outputPath}`);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

exportCategories().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
