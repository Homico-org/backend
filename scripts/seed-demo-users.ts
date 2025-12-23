/**
 * Direct MongoDB seeding script for demo users
 *
 * Usage:
 *   npx ts-node scripts/seed-demo-users.ts
 *
 * Or from backend directory:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-demo-users.ts
 */

import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

// Check for command line argument for database
const args = process.argv.slice(2);
const targetEnv = args[0] || 'prod';

// Database URIs
const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI || '',
  dev: process.env.MONGODB_URI?.replace('/homi?', '/homi-dev?') || ''
};

const MONGODB_URI = DB_URIS[targetEnv] || DB_URIS.prod;
console.log(`Target environment: ${targetEnv}`);

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in environment variables');
  process.exit(1);
}

// User schema matching the main application
const userSchema = new mongoose.Schema({
  uid: { type: Number, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true, lowercase: true },
  password: { type: String },
  role: { type: String, enum: ['client', 'pro', 'company', 'admin'], default: 'client' },
  phone: { type: String, unique: true, sparse: true },
  city: { type: String },
  avatar: { type: String },
  accountType: { type: String, enum: ['individual', 'organization'], default: 'individual' },
  companyName: { type: String },
  isActive: { type: Boolean, default: true },
  selectedCategories: { type: [String], default: [] },
  selectedSubcategories: { type: [String], default: [] },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: true },
  // PRO-specific fields
  title: { type: String },
  description: { type: String },
  categories: { type: [String], default: [] },
  subcategories: { type: [String], default: [] },
  yearsExperience: { type: Number, default: 0 },
  serviceAreas: { type: [String], default: [] },
  pricingModel: { type: String, enum: ['hourly', 'daily', 'sqm', 'project_based', 'from'] },
  basePrice: { type: Number },
  maxPrice: { type: Number },
  currency: { type: String, default: 'GEL' },
  avgRating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  completedJobs: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
  status: { type: String, enum: ['active', 'busy', 'away'], default: 'active' },
  languages: { type: [String], default: ['ka', 'en'] },
  isPremium: { type: Boolean, default: false },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Demo users data
const DEMO_USERS = [
  // Clients
  {
    name: 'Giorgi Melikishvili',
    email: 'giorgi.melikishvili@demo.com',
    password: 'DemoPass123',
    role: 'client',
    phone: '+995591001001',
    city: 'tbilisi'
  },
  {
    name: 'Nino Kvaratskhelia',
    email: 'nino.kvaratskhelia@demo.com',
    password: 'DemoPass123',
    role: 'client',
    phone: '+995591001002',
    city: 'tbilisi'
  },
  {
    name: 'Davit Beridze',
    email: 'davit.beridze@demo.com',
    password: 'DemoPass123',
    role: 'client',
    phone: '+995591001003',
    city: 'batumi'
  },
  {
    name: 'Mariam Janelidze',
    email: 'mariam.janelidze@demo.com',
    password: 'DemoPass123',
    role: 'client',
    phone: '+995591001004',
    city: 'kutaisi'
  },
  {
    name: 'Alex Gogiashvili',
    email: 'alex.gogiashvili@demo.com',
    password: 'DemoPass123',
    role: 'client',
    phone: '+995591001005',
    city: 'tbilisi'
  },
  // Professionals
  {
    name: 'Levan Nikoladze',
    email: 'levan.nikoladze@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002001',
    city: 'tbilisi',
    selectedCategories: ['renovation'],
    selectedSubcategories: ['full-renovation', 'cosmetic-repair'],
    categories: ['renovation'],
    subcategories: ['full-renovation', 'cosmetic-repair'],
    accountType: 'individual',
    title: 'Renovation Specialist',
    description: 'Professional renovation services with 8 years of experience. Full and cosmetic renovations.',
    yearsExperience: 8,
    serviceAreas: ['tbilisi', 'rustavi'],
    pricingModel: 'sqm',
    basePrice: 150,
    maxPrice: 400,
    avgRating: 4.8,
    totalReviews: 24,
    completedJobs: 45
  },
  {
    name: 'Tamar Tsuladze',
    email: 'tamar.tsuladze@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002002',
    city: 'tbilisi',
    selectedCategories: ['design'],
    selectedSubcategories: ['interior', '3d-visualization'],
    categories: ['design'],
    subcategories: ['interior', '3d-visualization'],
    accountType: 'individual',
    title: 'Interior Designer',
    description: 'Creative interior designer specializing in modern and minimalist spaces. 3D visualization included.',
    yearsExperience: 6,
    serviceAreas: ['tbilisi'],
    pricingModel: 'sqm',
    basePrice: 80,
    maxPrice: 200,
    avgRating: 4.9,
    totalReviews: 31,
    completedJobs: 52
  },
  {
    name: 'Zurab Kharaishvili',
    email: 'zurab.kharaishvili@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002003',
    city: 'tbilisi',
    selectedCategories: ['architecture'],
    selectedSubcategories: ['residential-architecture', 'project-documentation'],
    categories: ['architecture'],
    subcategories: ['residential-architecture', 'project-documentation'],
    accountType: 'individual',
    title: 'Architect',
    description: 'Licensed architect with expertise in residential projects and full project documentation.',
    yearsExperience: 12,
    serviceAreas: ['tbilisi', 'batumi', 'kutaisi'],
    pricingModel: 'project_based',
    basePrice: 2000,
    maxPrice: 15000,
    avgRating: 4.7,
    totalReviews: 18,
    completedJobs: 28
  },
  {
    name: 'Elene Mamulashvili',
    email: 'elene.mamulashvili@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002004',
    city: 'batumi',
    selectedCategories: ['design'],
    selectedSubcategories: ['exterior', 'landscape-design'],
    categories: ['design'],
    subcategories: ['exterior', 'landscape-design'],
    accountType: 'individual',
    title: 'Landscape Designer',
    description: 'Specialized in exterior and landscape design for coastal properties.',
    yearsExperience: 5,
    serviceAreas: ['batumi', 'kobuleti'],
    pricingModel: 'project_based',
    basePrice: 500,
    maxPrice: 5000,
    avgRating: 4.6,
    totalReviews: 12,
    completedJobs: 19
  },
  {
    name: 'Gremit Georgia',
    email: 'gremit.georgia@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002005',
    city: 'tbilisi',
    selectedCategories: ['renovation', 'services'],
    selectedSubcategories: ['full-renovation', 'electrical-works', 'plumbing'],
    categories: ['renovation', 'services'],
    subcategories: ['full-renovation', 'electrical-works', 'plumbing'],
    accountType: 'organization',
    companyName: 'Gremit Georgia',
    title: 'Full-Service Renovation Company',
    description: 'Complete renovation solutions including electrical, plumbing, and finishing works.',
    yearsExperience: 10,
    serviceAreas: ['tbilisi', 'rustavi', 'mtskheta'],
    pricingModel: 'sqm',
    basePrice: 200,
    maxPrice: 600,
    avgRating: 4.5,
    totalReviews: 67,
    completedJobs: 120,
    isPremium: true
  },
  {
    name: 'Nika Gelashvili',
    email: 'nika.gelashvili@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002006',
    city: 'tbilisi',
    selectedCategories: ['services'],
    selectedSubcategories: ['electrical-works', 'smart-home'],
    categories: ['services'],
    subcategories: ['electrical-works', 'smart-home'],
    accountType: 'individual',
    title: 'Electrician & Smart Home Expert',
    description: 'Certified electrician specializing in smart home installations and electrical renovations.',
    yearsExperience: 7,
    serviceAreas: ['tbilisi'],
    pricingModel: 'hourly',
    basePrice: 50,
    maxPrice: 100,
    avgRating: 4.8,
    totalReviews: 42,
    completedJobs: 89
  },
  {
    name: 'Sandro Kutateladze',
    email: 'sandro.kutateladze@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002007',
    city: 'kutaisi',
    selectedCategories: ['renovation'],
    selectedSubcategories: ['kitchen-renovation', 'bathroom-renovation'],
    categories: ['renovation'],
    subcategories: ['kitchen-renovation', 'bathroom-renovation'],
    accountType: 'individual',
    title: 'Kitchen & Bathroom Specialist',
    description: 'Expert in kitchen and bathroom renovations with modern designs.',
    yearsExperience: 9,
    serviceAreas: ['kutaisi', 'samtredia', 'zestafoni'],
    pricingModel: 'project_based',
    basePrice: 1500,
    maxPrice: 8000,
    avgRating: 4.7,
    totalReviews: 28,
    completedJobs: 41
  },
  {
    name: 'Design Studio Oasis',
    email: 'design.oasis@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002008',
    city: 'tbilisi',
    selectedCategories: ['design', 'architecture'],
    selectedSubcategories: ['interior', '3d-visualization', 'residential-architecture'],
    categories: ['design', 'architecture'],
    subcategories: ['interior', '3d-visualization', 'residential-architecture'],
    accountType: 'organization',
    companyName: 'Design Studio Oasis',
    title: 'Architecture & Design Studio',
    description: 'Full-service design studio offering interior design, 3D visualization, and architectural services.',
    yearsExperience: 15,
    serviceAreas: ['tbilisi', 'batumi'],
    pricingModel: 'sqm',
    basePrice: 100,
    maxPrice: 300,
    avgRating: 4.9,
    totalReviews: 54,
    completedJobs: 87,
    isPremium: true
  },
  {
    name: 'Beka Lomidze',
    email: 'beka.lomidze@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002009',
    city: 'tbilisi',
    selectedCategories: ['services'],
    selectedSubcategories: ['plumbing', 'heating-cooling'],
    categories: ['services'],
    subcategories: ['plumbing', 'heating-cooling'],
    accountType: 'individual',
    title: 'Plumber & HVAC Specialist',
    description: 'Professional plumbing and heating/cooling system installation and repair.',
    yearsExperience: 11,
    serviceAreas: ['tbilisi', 'rustavi'],
    pricingModel: 'hourly',
    basePrice: 40,
    maxPrice: 80,
    avgRating: 4.6,
    totalReviews: 35,
    completedJobs: 156
  },
  {
    name: 'Ana Chkheidze',
    email: 'ana.chkheidze@demo.com',
    password: 'DemoPass123',
    role: 'pro',
    phone: '+995591002010',
    city: 'tbilisi',
    selectedCategories: ['design'],
    selectedSubcategories: ['furniture-design', 'interior'],
    categories: ['design'],
    subcategories: ['furniture-design', 'interior'],
    accountType: 'individual',
    title: 'Furniture & Interior Designer',
    description: 'Custom furniture design and interior styling. Creating unique, functional spaces.',
    yearsExperience: 4,
    serviceAreas: ['tbilisi'],
    pricingModel: 'project_based',
    basePrice: 300,
    maxPrice: 3000,
    avgRating: 4.8,
    totalReviews: 15,
    completedJobs: 22
  }
];

async function getNextUid(): Promise<number> {
  const lastUser = await User.findOne({ uid: { $exists: true } }).sort({ uid: -1 }).exec();
  return lastUser?.uid ? lastUser.uid + 1 : 100001;
}

async function seedUsers() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected successfully!\n');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const userData of DEMO_USERS) {
    try {
      // Check if user already exists
      const existingByEmail = await User.findOne({ email: userData.email });
      if (existingByEmail) {
        console.log(`[SKIP] Already exists: ${userData.name} (${userData.email})`);
        skipped++;
        continue;
      }

      const existingByPhone = await User.findOne({ phone: userData.phone });
      if (existingByPhone) {
        console.log(`[SKIP] Phone exists: ${userData.name} (${userData.phone})`);
        skipped++;
        continue;
      }

      // Generate UID and hash password
      const uid = await getNextUid();
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create user
      const user = new User({
        ...userData,
        uid,
        password: hashedPassword,
        isPhoneVerified: true,
        phoneVerifiedAt: new Date(),
      });

      await user.save();
      console.log(`[OK] Created: ${userData.name} (${userData.email}) - UID: ${uid}`);
      created++;
    } catch (error: any) {
      console.log(`[ERROR] Failed: ${userData.name} - ${error.message}`);
      failed++;
    }
  }

  console.log('\n================================');
  console.log(`Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log('================================');

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB');
}

seedUsers().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
