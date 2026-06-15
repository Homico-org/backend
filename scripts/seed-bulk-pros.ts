/**
 * Seed a bulk batch of throwaway professional demo users into MongoDB.
 *
 * Unlike seed-demo-pros.ts (8 hand-written realistic profiles), this one
 * generates N minimal-but-listable pros so paginated surfaces (infinite
 * scroll, page restore on back navigation) can be tested on a dev DB that
 * only has a handful of real pros.
 *
 * Every generated user is tagged with a `bulkpro-N@demo.ge` email and a
 * `+9955990100NN` phone so the batch is easy to find and remove.
 *
 * Usage:
 *   npx ts-node scripts/seed-bulk-pros.ts            # seed 40 pros
 *   npx ts-node scripts/seed-bulk-pros.ts 60         # seed a custom count
 *   npx ts-node scripts/seed-bulk-pros.ts --remove   # delete the whole batch
 */

import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

// ── Mongoose schema (minimal, matching main app) ─────────────────────────────

const userSchema = new mongoose.Schema(
  {
    uid: { type: Number, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true, lowercase: true },
    password: { type: String },
    role: { type: String, enum: ["client", "pro", "admin"], default: "client" },
    phone: { type: String, unique: true, sparse: true },
    city: { type: String },
    avatar: { type: String },
    bio: { type: String },
    title: { type: String },
    accountType: { type: String, enum: ["individual", "organization"], default: "individual" },
    isActive: { type: Boolean, default: true },
    isProfileCompleted: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isAdminApproved: { type: Boolean, default: false },
    verificationStatus: { type: String, default: "pending" },
    registrationStep: { type: Number, default: 0 },
    selectedCategories: { type: [String], default: [] },
    selectedSubcategories: { type: [String], default: [] },
    selectedServices: { type: [Object], default: [] },
    servicePricing: { type: [Object], default: [] },
    pricingModel: { type: String },
    basePrice: { type: Number },
    maxPrice: { type: Number },
    currency: { type: String, default: "GEL" },
    serviceAreas: { type: [String], default: [] },
    nationwide: { type: Boolean, default: false },
    yearsExperience: { type: Number, default: 0 },
    avgRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },
    isAvailable: { type: Boolean, default: true },
    status: { type: String, enum: ["active", "busy", "away"], default: "active" },
    languages: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    subcategories: { type: [String], default: [] },
  },
  { timestamps: true },
);

const User = mongoose.model("User", userSchema);

const RAW_PASSWORD = "Demo123!";
const EMAIL_PATTERN = /^bulkpro-\d+@demo\.ge$/;

// One template per category. Each carries a priced service so the pro
// passes the browse "quality floor" (completeOnly needs portfolio,
// pricing OR reviews - pricing is the cheapest signal to fake).
const TEMPLATES = [
  {
    title: "სანტექნიკი",
    category: "plumbing",
    subcategory: "plumbing_install",
    serviceKey: "plumb_faucet_svc",
    price: 50,
  },
  {
    title: "ელექტრიკი",
    category: "electrical",
    subcategory: "wiring",
    serviceKey: "wiring_outlet_svc",
    price: 30,
  },
  {
    title: "მხატვარი-მალიარი",
    category: "painters",
    subcategory: "painter",
    serviceKey: "paint_interior_svc",
    price: 25,
  },
  {
    title: "დამლაგებელი",
    category: "cleaning",
    subcategory: "regular_clean",
    serviceKey: "regular_standard_svc",
    price: 60,
  },
  {
    title: "კონდიციონერის სპეციალისტი",
    category: "hvac",
    subcategory: "ac_ventilation",
    serviceKey: "ac_service_svc",
    price: 80,
  },
  {
    title: "ხელოსანი (ჰენდიმენი)",
    category: "handyman",
    subcategory: "mounting",
    serviceKey: "mount_tv_svc",
    price: 30,
  },
];

const CITIES = ["tbilisi", "batumi", "kutaisi", "rustavi"];
const CITY_AREAS: Record<string, string[]> = {
  tbilisi: ["თბილისი"],
  batumi: ["ბათუმი"],
  kutaisi: ["ქუთაისი"],
  rustavi: ["რუსთავი"],
};

function randomDateWithinMonths(months: number): Date {
  const now = Date.now();
  const past = now - months * 30 * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

async function getNextUid(): Promise<number> {
  const last = await User.findOne({ uid: { $exists: true } })
    .sort({ uid: -1 })
    .exec();
  return last?.uid ? (last.uid as number) + 1 : 100001;
}

async function remove() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI!);
  const res = await User.deleteMany({ email: EMAIL_PATTERN });
  console.log(`Removed ${res.deletedCount} bulk demo pros.`);
  await mongoose.disconnect();
}

async function seed(count: number) {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected.\n");

  const hashedPassword = await bcrypt.hash(RAW_PASSWORD, 10);
  let nextUid = await getNextUid();

  for (let i = 1; i <= count; i++) {
    const t = TEMPLATES[i % TEMPLATES.length];
    const city = CITIES[i % CITIES.length];
    const num = String(i).padStart(2, "0");
    // Gendered portrait pools on randomuser cap at 99 - cycle within it.
    const gender = i % 3 === 0 ? "women" : "men";

    const setDoc: any = {
      name: `Demo Pro ${num}`,
      title: t.title,
      bio: `სატესტო პროფილი #${num} — ${t.title}. შექმნილია გვერდების ტესტირებისთვის (bulk seed).`,
      city,
      avatar: `https://randomuser.me/api/portraits/${gender}/${(i % 99) + 1}.jpg`,
      email: `bulkpro-${i}@demo.ge`,
      password: hashedPassword,
      role: "pro",
      accountType: "individual",
      isProfileCompleted: true,
      isPhoneVerified: true,
      isEmailVerified: true,
      isAdminApproved: true,
      verificationStatus: "verified",
      registrationStep: 5,
      nationwide: false,
      isAvailable: true,
      isActive: true,
      status: "active",
      currency: "GEL",
      selectedCategories: [t.category],
      selectedSubcategories: [t.subcategory],
      categories: [t.category],
      subcategories: [t.subcategory],
      selectedServices: [
        { key: t.subcategory, categoryKey: t.category, experience: "3-5" },
      ],
      servicePricing: [
        {
          serviceKey: t.serviceKey,
          categoryKey: t.category,
          subcategoryKey: t.subcategory,
          price: t.price,
          isActive: true,
          discountTiers: [],
        },
      ],
      pricingModel: "range",
      basePrice: t.price,
      maxPrice: t.price * 3,
      serviceAreas: CITY_AREAS[city],
      yearsExperience: 2 + (i % 12),
      avgRating: Math.round((3.5 + (i % 15) * 0.1) * 10) / 10,
      totalReviews: 5 + (i % 40),
      completedJobs: 3 + (i % 30),
      languages: ["ka"],
    };

    await User.updateOne(
      { phone: `+9955990100${num}` },
      {
        $set: { ...setDoc, phone: `+9955990100${num}` },
        $setOnInsert: {
          uid: nextUid++,
          createdAt: randomDateWithinMonths(6),
        },
      },
      { upsert: true },
    );
    console.log(`  ✓ Demo Pro ${num} (${t.title}, ${city})`);
  }

  console.log(`\nTotal: ${count} bulk pros (password: ${RAW_PASSWORD})`);
  console.log("Remove the batch with: npx ts-node scripts/seed-bulk-pros.ts --remove");
  await mongoose.disconnect();
  console.log("Done.");
}

const arg = process.argv[2];
if (arg === "--remove") {
  remove().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
} else {
  const count = Math.min(parseInt(arg || "40", 10) || 40, 200);
  seed(count).catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
