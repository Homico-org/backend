/**
 * Seed categories into MongoDB
 *
 * Usage:
 *   npx ts-node scripts/seed-categories.ts [prod|dev]
 *
 * This script will:
 *   - Delete all existing categories
 *   - Insert the predefined categories
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
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
  key: { type: String, required: true },
  name: { type: String, required: true },
  nameKa: { type: String, required: true },
  icon: String,
  keywords: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { _id: false });

const subcategorySchema = new mongoose.Schema({
  key: { type: String, required: true },
  name: { type: String, required: true },
  nameKa: { type: String, required: true },
  icon: String,
  keywords: { type: [String], default: [] },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  children: { type: [subSubcategorySchema], default: [] },
}, { _id: false });

const categorySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  nameKa: { type: String, required: true },
  description: String,
  descriptionKa: String,
  icon: String,
  keywords: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  subcategories: { type: [subcategorySchema], default: [] },
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

// ============================================================================
// CATEGORIES DATA - Edit this section to add/modify categories
// ============================================================================

const CATEGORIES = [
  {
    key: 'renovation',
    name: 'Renovation',
    nameKa: 'რემონტი',
    description: 'Home renovation services',
    descriptionKa: 'სახლის სარემონტო სერვისები',
    icon: 'renovation',
    isActive: true,
    sortOrder: 0,
    subcategories: [
      {
        key: 'plumbing',
        name: 'Plumbing',
        nameKa: 'სანტექნიკა',
        icon: 'plumbing',
        isActive: true,
        sortOrder: 0,
        children: []
      },
      {
        key: 'electricity',
        name: 'Electricity',
        nameKa: 'ელექტროობა',
        icon: 'electricity',
        isActive: true,
        sortOrder: 1,
        children: []
      },
      {
        key: 'mural',
        name: 'Mural',
        nameKa: 'მალიარი',
        icon: 'mural',
        isActive: true,
        sortOrder: 2,
        children: []
      },
      {
        key: 'roofing',
        name: 'Roofing',
        nameKa: 'სახურავი',
        icon: 'roofing',
        isActive: true,
        sortOrder: 3,
        children: []
      },
      {
        key: 'tile',
        name: 'Tile',
        nameKa: 'ჭერი',
        icon: 'tile',
        isActive: true,
        sortOrder: 4,
        children: [
          {
            key: 'stretch-ceiling',
            name: 'Stretch Ceiling',
            nameKa: 'გასაჭიმი ჭერი',
            icon: 'stretch-ceiling',
            isActive: true,
            sortOrder: 0
          },
          {
            key: 'drywall',
            name: 'Drywall',
            nameKa: 'გიფსოკარდონი',
            icon: 'drywall',
            isActive: true,
            sortOrder: 1
          }
        ]
      },
      {
        key: 'flooring',
        name: 'Flooring',
        nameKa: 'იატაკი',
        icon: 'flooring',
        isActive: true,
        sortOrder: 5,
        children: [
          {
            key: 'parquet',
            name: 'Parquet',
            nameKa: 'პარკეტი',
            icon: 'parquet',
            isActive: true,
            sortOrder: 0
          },
          {
            key: 'laminate',
            name: 'Laminate',
            nameKa: 'ლამინატი',
            icon: 'laminate',
            isActive: true,
            sortOrder: 1
          },
          {
            key: 'wood',
            name: 'Wood',
            nameKa: 'ხე',
            icon: 'wood',
            isActive: true,
            sortOrder: 2
          }
        ]
      },
      {
        key: 'plastering',
        name: 'Plastering',
        nameKa: 'მლესავი',
        icon: 'plastering',
        isActive: true,
        sortOrder: 6,
        children: []
      },
      {
        key: 'hvac',
        name: 'Heating/Cooling',
        nameKa: 'გათბობა/გაგრილება',
        icon: 'hvac',
        isActive: true,
        sortOrder: 7,
        children: []
      }
    ]
  },
  {
    key: 'design',
    name: 'Design',
    nameKa: 'დიზაინი',
    description: 'Design',
    descriptionKa: 'დიზაინი',
    icon: 'designer',
    isActive: true,
    sortOrder: 1,
    subcategories: [
      {
        key: 'interior',
        name: 'Interior Design',
        nameKa: 'ინტერიერი',
        icon: 'interior',
        isActive: true,
        sortOrder: 0,
        children: []
      },
      {
        key: 'exterior',
        name: 'Exterior Design',
        nameKa: 'ექსტერიერი',
        icon: 'exterior',
        isActive: true,
        sortOrder: 1,
        children: []
      },
      {
        key: '3d-design',
        name: '3D Design',
        nameKa: '3D დიზაინი',
        icon: '3d',
        isActive: true,
        sortOrder: 2,
        children: []
      }
    ]
  },
  {
    key: 'architecture',
    name: 'Architecture',
    nameKa: 'არქიტექტურა',
    description: 'Architecture services',
    descriptionKa: 'არქიტექტურა',
    icon: 'architecture',
    isActive: true,
    sortOrder: 2,
    subcategories: [
      {
        key: 'residential-architecture',
        name: 'Residential',
        nameKa: 'საცხოვრებელი',
        icon: 'residential-architecture',
        isActive: true,
        sortOrder: 0,
        children: []
      },
      {
        key: 'commercial-architecture',
        name: 'Commercial',
        nameKa: 'კომერციული',
        icon: 'commercial-architecture',
        isActive: true,
        sortOrder: 1,
        children: []
      },
      {
        key: 'industrial-architecture',
        name: 'Industrial',
        nameKa: 'ინდუსტრიული',
        icon: 'industrial-architecture',
        isActive: true,
        sortOrder: 2,
        children: []
      },
      {
        key: 'reconstruction',
        name: 'Reconstruction',
        nameKa: 'რეკონსტრუქცია',
        icon: 'reconstruction',
        isActive: true,
        sortOrder: 3,
        children: []
      }
    ]
  },
  {
    key: 'services',
    name: 'Services',
    nameKa: 'სერვისები',
    description: 'Services',
    descriptionKa: 'სერვისები',
    icon: 'services',
    isActive: true,
    sortOrder: 3,
    subcategories: [
      {
        key: 'cleaning',
        name: 'Cleaning',
        nameKa: 'დალაგება',
        icon: 'cleaning',
        isActive: true,
        sortOrder: 0,
        children: [
          {
            key: 'deep-cleaning',
            name: 'Deep Cleaning',
            nameKa: 'გენერალური დალაგება',
            icon: 'deep-cleaning',
            isActive: true,
            sortOrder: 0
          },
          {
            key: 'after-renovation',
            name: 'After Renovation',
            nameKa: 'რემონტის შემდგომი',
            icon: 'after-renovation',
            isActive: true,
            sortOrder: 1
          }
        ]
      },
      {
        key: 'moving',
        name: 'Moving',
        nameKa: 'გადაზიდვა',
        icon: 'moving',
        isActive: true,
        sortOrder: 1,
        children: []
      },
      {
        key: 'gardening',
        name: 'Gardening',
        nameKa: 'მებაღეობა',
        icon: 'gardening',
        isActive: true,
        sortOrder: 2,
        children: []
      },
      {
        key: 'appliance-repair',
        name: 'Appliance Repair',
        nameKa: 'ტექნიკის შეკეთება',
        icon: 'appliance',
        isActive: true,
        sortOrder: 3,
        children: []
      },
      {
        key: 'pest-control',
        name: 'Pest Control',
        nameKa: 'დეზინსექცია',
        icon: 'pest',
        isActive: true,
        sortOrder: 4,
        children: []
      },
      {
        key: 'window-cleaning',
        name: 'Window Cleaning',
        nameKa: 'ფანჯრების წმენდა',
        icon: 'window',
        isActive: true,
        sortOrder: 5,
        children: []
      },
      {
        key: 'security',
        name: 'Security',
        nameKa: 'უსაფრთხოება',
        icon: 'security',
        isActive: true,
        sortOrder: 6,
        children: []
      },
      {
        key: 'solar',
        name: 'Solar',
        nameKa: 'მზის პანელები',
        icon: 'solar',
        isActive: true,
        sortOrder: 7,
        children: []
      },
      {
        key: 'pool',
        name: 'Pool',
        nameKa: 'აუზი',
        icon: 'pool',
        isActive: true,
        sortOrder: 8,
        children: []
      },
      {
        key: 'smart-home',
        name: 'Smart Home',
        nameKa: 'ჭკვიანი სახლი',
        icon: 'smart-home',
        isActive: true,
        sortOrder: 9,
        children: []
      },
      {
        key: 'lighting',
        name: 'Lighting',
        nameKa: 'განათება',
        icon: 'lighting',
        isActive: true,
        sortOrder: 10,
        children: []
      },
      {
        key: 'windows',
        name: 'Windows',
        nameKa: 'ფანჯრები',
        icon: 'windows',
        isActive: true,
        sortOrder: 11,
        children: []
      },
      {
        key: 'doors',
        name: 'Doors',
        nameKa: 'კარები',
        icon: 'doors',
        isActive: true,
        sortOrder: 12,
        children: []
      },
      {
        key: 'it-support',
        name: 'IT Support',
        nameKa: 'IT მხარდაჭერა',
        icon: 'it-support',
        isActive: true,
        sortOrder: 13,
        children: []
      },
      {
        key: 'network-admin',
        name: 'Network Administration',
        nameKa: 'ქსელის ადმინისტრირება',
        icon: 'network',
        isActive: true,
        sortOrder: 14,
        children: []
      }
    ]
  }
];

// ============================================================================

async function seedCategories() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully!\n');

  // Delete existing categories
  console.log('Deleting existing categories...');
  const deleteResult = await Category.deleteMany({});
  console.log(`Deleted ${deleteResult.deletedCount} categories\n`);

  // Insert new categories
  console.log('Inserting categories...');
  for (const categoryData of CATEGORIES) {
    const category = new Category(categoryData);
    await category.save();
    console.log(`[OK] ${categoryData.key}: ${categoryData.name} (${categoryData.nameKa})`);

    // Log subcategories
    for (const sub of categoryData.subcategories) {
      console.log(`     - ${sub.key}: ${sub.name}`);
      for (const child of sub.children || []) {
        console.log(`       - ${child.key}: ${child.name}`);
      }
    }
  }

  console.log('\n================================');
  console.log(`Seeded ${CATEGORIES.length} categories`);
  console.log('================================');

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB');
}

seedCategories().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
