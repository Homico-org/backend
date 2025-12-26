/**
 * Seed Admin and Company users for dev and prod environments
 *
 * Usage:
 *   npx ts-node scripts/seed-admin-company.ts dev
 *   npx ts-node scripts/seed-admin-company.ts prod
 *   npx ts-node scripts/seed-admin-company.ts both
 */

import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

// Check for command line argument for database
const args = process.argv.slice(2);
const targetEnv = args[0] || 'both';

// Database URIs
const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI?.replace('/homi?', '/homi_prod?') || '',
  dev: process.env.MONGODB_URI?.replace('/homi?', '/homi_dev?') || ''
};

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
  isEmailVerified: { type: Boolean, default: true },
  isPhoneVerified: { type: Boolean, default: true },
  // PRO/Company-specific fields
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
  premiumTier: { type: String, default: 'none' },
  isProfileCompleted: { type: Boolean, default: true },
  verificationStatus: { type: String, default: 'verified' },
}, { timestamps: true });

// Admin and Company users data
const ADMIN_COMPANY_USERS = [
  // Admin Users
  {
    name: 'Homico Admin',
    email: 'admin@homico.ge',
    password: 'HomAdmin2024!',
    role: 'admin',
    phone: '+995599000001',
    city: 'tbilisi',
    isEmailVerified: true,
    isPhoneVerified: true,
  },
  {
    name: 'Super Admin',
    email: 'superadmin@homico.ge',
    password: 'SuperAdmin2024!',
    role: 'admin',
    phone: '+995599000002',
    city: 'tbilisi',
    isEmailVerified: true,
    isPhoneVerified: true,
  },
  // Company Users - Construction Companies
  {
    name: 'BuildMaster Georgia',
    email: 'info@buildmaster.ge',
    password: 'BuildMaster2024!',
    role: 'company',
    phone: '+995599100001',
    city: 'tbilisi',
    accountType: 'organization',
    companyName: 'BuildMaster Georgia',
    title: 'სამშენებლო კომპანია',
    description: 'სრული სამშენებლო მომსახურება - საცხოვრებელი და კომერციული ობიექტების მშენებლობა 15 წლიანი გამოცდილებით.',
    categories: ['renovation', 'construction'],
    subcategories: ['full-renovation', 'new-construction', 'commercial-construction'],
    yearsExperience: 15,
    serviceAreas: ['tbilisi', 'rustavi', 'mtskheta', 'batumi'],
    pricingModel: 'sqm',
    basePrice: 300,
    maxPrice: 800,
    avgRating: 4.7,
    totalReviews: 89,
    completedJobs: 156,
    isPremium: true,
    premiumTier: 'pro',
    isEmailVerified: true,
    isPhoneVerified: true,
  },
  {
    name: 'რემონტ პლუსი',
    email: 'contact@remontplus.ge',
    password: 'RemontPlus2024!',
    role: 'company',
    phone: '+995599100002',
    city: 'tbilisi',
    accountType: 'organization',
    companyName: 'რემონტ პლუსი',
    title: 'რემონტის სპეციალისტები',
    description: 'ბინებისა და სახლების რემონტი ევროპული ხარისხით. კოსმეტიკური და კაპიტალური რემონტი.',
    categories: ['renovation'],
    subcategories: ['full-renovation', 'cosmetic-repair', 'kitchen-renovation', 'bathroom-renovation'],
    yearsExperience: 8,
    serviceAreas: ['tbilisi', 'rustavi'],
    pricingModel: 'sqm',
    basePrice: 150,
    maxPrice: 500,
    avgRating: 4.5,
    totalReviews: 45,
    completedJobs: 78,
    isPremium: false,
    isEmailVerified: true,
    isPhoneVerified: true,
  },
  // Company Users - Service Agencies
  {
    name: 'HomeServe Georgia',
    email: 'service@homeserve.ge',
    password: 'HomeServe2024!',
    role: 'company',
    phone: '+995599100003',
    city: 'tbilisi',
    accountType: 'organization',
    companyName: 'HomeServe Georgia',
    title: 'სახლის სერვისები',
    description: 'ელექტრიკა, სანტექნიკა, კონდიციონირება და სხვა საყოფაცხოვრებო სერვისები 24/7 რეჟიმში.',
    categories: ['services'],
    subcategories: ['electrical-works', 'plumbing', 'heating-cooling', 'smart-home'],
    yearsExperience: 10,
    serviceAreas: ['tbilisi', 'rustavi', 'mtskheta'],
    pricingModel: 'hourly',
    basePrice: 50,
    maxPrice: 150,
    avgRating: 4.8,
    totalReviews: 234,
    completedJobs: 567,
    isPremium: true,
    premiumTier: 'elite',
    isEmailVerified: true,
    isPhoneVerified: true,
  },
  {
    name: 'Design House Tbilisi',
    email: 'hello@designhouse.ge',
    password: 'DesignHouse2024!',
    role: 'company',
    phone: '+995599100004',
    city: 'tbilisi',
    accountType: 'organization',
    companyName: 'Design House Tbilisi',
    title: 'ინტერიერის დიზაინი',
    description: 'თანამედროვე ინტერიერის დიზაინი, 3D ვიზუალიზაცია და ავტორის ზედამხედველობა.',
    categories: ['design'],
    subcategories: ['interior', '3d-visualization', 'furniture-design'],
    yearsExperience: 12,
    serviceAreas: ['tbilisi', 'batumi'],
    pricingModel: 'sqm',
    basePrice: 80,
    maxPrice: 250,
    avgRating: 4.9,
    totalReviews: 67,
    completedJobs: 98,
    isPremium: true,
    premiumTier: 'pro',
    isEmailVerified: true,
    isPhoneVerified: true,
  },
  {
    name: 'Batumi Builders',
    email: 'info@batumibuilders.ge',
    password: 'BatumiBuilders2024!',
    role: 'company',
    phone: '+995599100005',
    city: 'batumi',
    accountType: 'organization',
    companyName: 'Batumi Builders',
    title: 'ბათუმის სამშენებლო კომპანია',
    description: 'ბათუმსა და აჭარის რეგიონში სამშენებლო და სარემონტო სამუშაოები.',
    categories: ['renovation', 'construction'],
    subcategories: ['full-renovation', 'new-construction', 'facade-works'],
    yearsExperience: 7,
    serviceAreas: ['batumi', 'kobuleti', 'chakvi'],
    pricingModel: 'sqm',
    basePrice: 200,
    maxPrice: 600,
    avgRating: 4.6,
    totalReviews: 34,
    completedJobs: 45,
    isPremium: false,
    isEmailVerified: true,
    isPhoneVerified: true,
  },
];

async function getNextUid(User: mongoose.Model<any>): Promise<number> {
  const lastUser = await User.findOne({ uid: { $exists: true } }).sort({ uid: -1 }).exec();
  return lastUser?.uid ? lastUser.uid + 1 : 100001;
}

async function seedToDatabase(dbUri: string, envName: string) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Seeding ${envName.toUpperCase()} database...`);
  console.log(`${'='.repeat(50)}`);

  // Create a new connection for this database
  const connection = await mongoose.createConnection(dbUri).asPromise();
  const User = connection.model('User', userSchema);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const userData of ADMIN_COMPANY_USERS) {
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
      const uid = await getNextUid(User);
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create user
      const user = new User({
        ...userData,
        uid,
        password: hashedPassword,
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
      });

      await user.save();
      console.log(`[OK] Created: ${userData.name} (${userData.email}) - Role: ${userData.role} - UID: ${uid}`);
      created++;
    } catch (error: any) {
      console.log(`[ERROR] Failed: ${userData.name} - ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${envName.toUpperCase()} Results:`);
  console.log(`Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`);

  await connection.close();
  return { created, skipped, failed };
}

async function main() {
  console.log('Admin & Company Users Seeding Script');
  console.log(`Target: ${targetEnv}`);

  if (!DB_URIS.prod && !DB_URIS.dev) {
    console.error('MONGODB_URI not found in environment variables');
    process.exit(1);
  }

  const results: Record<string, { created: number; skipped: number; failed: number }> = {};

  try {
    if (targetEnv === 'dev' || targetEnv === 'both') {
      if (DB_URIS.dev) {
        results.dev = await seedToDatabase(DB_URIS.dev, 'dev');
      } else {
        console.log('DEV database URI not configured, skipping...');
      }
    }

    if (targetEnv === 'prod' || targetEnv === 'both') {
      if (DB_URIS.prod) {
        results.prod = await seedToDatabase(DB_URIS.prod, 'prod');
      } else {
        console.log('PROD database URI not configured, skipping...');
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(50));

    for (const [env, result] of Object.entries(results)) {
      console.log(`${env.toUpperCase()}: Created ${result.created}, Skipped ${result.skipped}, Failed ${result.failed}`);
    }

    console.log('\n✅ Seeding completed!');
    console.log('\nCredentials for testing:');
    console.log('------------------------');
    console.log('Admin:');
    console.log('  Email: admin@homico.ge');
    console.log('  Password: HomAdmin2024!');
    console.log('\nCompany (Example):');
    console.log('  Email: info@buildmaster.ge');
    console.log('  Password: BuildMaster2024!');

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
