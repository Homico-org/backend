/**
 * Seed realistic Georgian professional + client demo users into MongoDB.
 *
 * Usage:
 *   npx ts-node scripts/seed-demo-pros.ts
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
    customServices: { type: [String], default: [] },
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

// ── Helper: random date within last N months ─────────────────────────────────

function randomDateWithinMonths(months: number): Date {
  const now = Date.now();
  const past = now - months * 30 * 24 * 60 * 60 * 1000;
  return new Date(past + Math.random() * (now - past));
}

// ── Password ─────────────────────────────────────────────────────────────────

const RAW_PASSWORD = "Demo123!";

// ── Professional users ───────────────────────────────────────────────────────

const PROS = [
  {
    name: "გიორგი ბერიძე",
    phone: "+995599000001",
    email: "giorgi@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/men/32.jpg",
    title: "სანტექნიკი",
    bio: "პროფესიონალი სანტექნიკი 12 წლიანი გამოცდილებით. ვასრულებ მილების მონტაჟს, აბაზანის სრულ მოწყობას და გაჟონვის აღმოფხვრას. ვმუშაობ თანამედროვე მასალებით და ვიძლევი გარანტიას ყველა სამუშაოზე.",
    selectedCategories: ["renovation"],
    selectedSubcategories: ["plumbing"],
    categories: ["renovation"],
    subcategories: ["plumbing"],
    selectedServices: [
      { key: "plumbing", categoryKey: "renovation", name: "Plumbing", nameKa: "სანტექნიკა", experience: "10+" },
    ],
    servicePricing: [
      { serviceKey: "pipe-repair", categoryKey: "renovation", subcategoryKey: "plumbing", price: 50, isActive: true, discountTiers: [{ minQuantity: 3, percent: 10 }] },
      { serviceKey: "bathroom-install", categoryKey: "renovation", subcategoryKey: "plumbing", price: 200, isActive: true, discountTiers: [] },
      { serviceKey: "leak-fix", categoryKey: "renovation", subcategoryKey: "plumbing", price: 40, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 40,
    maxPrice: 200,
    serviceAreas: ["თბილისი", "რუსთავი"],
    yearsExperience: 12,
    avgRating: 4.7,
    totalReviews: 34,
    completedJobs: 28,
    customServices: ["გაჟონვის დიაგნოსტიკა", "წყლის ფილტრის მონტაჟი"],
    languages: ["ka", "ru"],
  },
  {
    name: "ნიკა ქუთათელაძე",
    phone: "+995599000002",
    email: "nika.k@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/men/45.jpg",
    title: "ელექტრიკი",
    bio: "სერტიფიცირებული ელექტრიკი, სპეციალიზაცია — საცხოვრებელი და კომერციული ობიექტების ელექტროგაყვანილობა. ვაკეთებ განათების სისტემების დაპროექტებას და მონტაჟს, ასევე ელექტრო პანელის განახლებას. უსაფრთხოება ჩემი პრიორიტეტია.",
    selectedCategories: ["renovation"],
    selectedSubcategories: ["electricity"],
    categories: ["renovation"],
    subcategories: ["electricity"],
    selectedServices: [
      { key: "electricity", categoryKey: "renovation", name: "Electrical Works", nameKa: "ელექტრო სამუშაოები", experience: "5-10" },
    ],
    servicePricing: [
      { serviceKey: "wiring", categoryKey: "renovation", subcategoryKey: "electricity", price: 80, isActive: true, discountTiers: [{ minQuantity: 5, percent: 15 }] },
      { serviceKey: "lighting-install", categoryKey: "renovation", subcategoryKey: "electricity", price: 60, isActive: true, discountTiers: [] },
      { serviceKey: "panel-upgrade", categoryKey: "renovation", subcategoryKey: "electricity", price: 250, isActive: true, discountTiers: [] },
      { serviceKey: "outlet-install", categoryKey: "renovation", subcategoryKey: "electricity", price: 30, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 30,
    maxPrice: 250,
    serviceAreas: ["თბილისი", "მცხეთა"],
    yearsExperience: 8,
    avgRating: 4.8,
    totalReviews: 42,
    completedJobs: 30,
    customServices: ["ჭკვიანი სახლის გაყვანილობა", "ელექტრო დიაგნოსტიკა", "მიწოდების ხაზის მონტაჟი"],
    languages: ["ka", "en"],
  },
  {
    name: "დავით მამულაძე",
    phone: "+995599000003",
    email: "davit.m@demo.ge",
    city: "batumi",
    avatar: "https://randomuser.me/api/portraits/men/61.jpg",
    title: "მხატვარი-მალიარი",
    bio: "ინტერიერის მოხატვა და ტაპეტის დაკვრა — ჩემი სპეციალობაა. 7 წელია ვმუშაობ ბათუმსა და აჭარის რეგიონში. ვიყენებ მაღალი ხარისხის საღებავებს და ვიძლევი სისუფთავის გარანტიას სამუშაოს დასრულების შემდეგ.",
    selectedCategories: ["renovation"],
    selectedSubcategories: ["mural"],
    categories: ["renovation"],
    subcategories: ["mural"],
    selectedServices: [
      { key: "mural", categoryKey: "renovation", name: "Painting", nameKa: "მოხატვა/მალიარობა", experience: "5-10" },
    ],
    servicePricing: [
      { serviceKey: "interior-painting", categoryKey: "renovation", subcategoryKey: "mural", price: 25, isActive: true, discountTiers: [{ minQuantity: 4, percent: 10 }] },
      { serviceKey: "wallpaper", categoryKey: "renovation", subcategoryKey: "mural", price: 35, isActive: true, discountTiers: [] },
      { serviceKey: "ceiling-painting", categoryKey: "renovation", subcategoryKey: "mural", price: 20, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 20,
    maxPrice: 35,
    serviceAreas: ["ბათუმი", "ქობულეთი"],
    yearsExperience: 7,
    avgRating: 4.5,
    totalReviews: 18,
    completedJobs: 15,
    customServices: ["დეკორატიული მოხატვა", "ფასადის შეღებვა"],
    languages: ["ka", "ru", "tr"],
  },
  {
    name: "ანა გოგიჩაშვილი",
    phone: "+995599000004",
    email: "ana.g@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/women/28.jpg",
    title: "დამლაგებელი",
    bio: "პროფესიონალური დასუფთავების სერვისი თბილისსა და რუსთავში. ვთავაზობ სტანდარტულ და ღრმა დასუფთავებას, ასევე რემონტის შემდგომ დალაგებას. ვიყენებ ეკოლოგიურად სუფთა საშუალებებს. გუნდში მყავს 4 გამოცდილი თანამშრომელი.",
    selectedCategories: ["services"],
    selectedSubcategories: ["cleaning"],
    categories: ["services"],
    subcategories: ["cleaning"],
    selectedServices: [
      { key: "cleaning", categoryKey: "services", name: "Cleaning", nameKa: "დასუფთავება", experience: "3-5" },
      { key: "deep-cleaning", categoryKey: "services", name: "Deep Cleaning", nameKa: "ღრმა დასუფთავება", experience: "3-5" },
      { key: "after-renovation", categoryKey: "services", name: "After Renovation Cleaning", nameKa: "სარემონტო დასუფთავება", experience: "3-5" },
    ],
    servicePricing: [
      { serviceKey: "standard-cleaning", categoryKey: "services", subcategoryKey: "cleaning", price: 60, isActive: true, discountTiers: [{ minQuantity: 4, percent: 15 }] },
      { serviceKey: "deep-cleaning", categoryKey: "services", subcategoryKey: "cleaning", price: 120, isActive: true, discountTiers: [{ minQuantity: 2, percent: 10 }] },
      { serviceKey: "after-renovation", categoryKey: "services", subcategoryKey: "cleaning", price: 150, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 60,
    maxPrice: 150,
    serviceAreas: ["თბილისი", "რუსთავი", "მცხეთა"],
    yearsExperience: 5,
    avgRating: 4.9,
    totalReviews: 50,
    completedJobs: 25,
    customServices: ["ფანჯრების რეცხვა", "რბილი ავეჯის დასუფთავება"],
    languages: ["ka", "en", "ru"],
  },
  {
    name: "ლევანი ჯავახიშვილი",
    phone: "+995599000005",
    email: "levani.j@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/men/55.jpg",
    title: "კონდიციონერის/გათბობის სპეციალისტი",
    bio: "კონდიციონერების მონტაჟი, მომსახურება და შეკეთება — ჩემი ძირითადი საქმიანობაა. ვმუშაობ ყველა ცნობილ ბრენდთან. ასევე ვაკეთებ ცენტრალური გათბობის სისტემების დაპროექტებასა და მონტაჟს. 10 წელზე მეტი გამოცდილება.",
    selectedCategories: ["renovation"],
    selectedSubcategories: ["hvac"],
    categories: ["renovation"],
    subcategories: ["hvac"],
    selectedServices: [
      { key: "hvac", categoryKey: "renovation", name: "HVAC", nameKa: "კონდიციონირება/გათბობა", experience: "10+" },
    ],
    servicePricing: [
      { serviceKey: "ac-install", categoryKey: "renovation", subcategoryKey: "hvac", price: 200, isActive: true, discountTiers: [{ minQuantity: 3, percent: 10 }] },
      { serviceKey: "ac-service", categoryKey: "renovation", subcategoryKey: "hvac", price: 80, isActive: true, discountTiers: [] },
      { serviceKey: "heating-install", categoryKey: "renovation", subcategoryKey: "hvac", price: 300, isActive: true, discountTiers: [] },
      { serviceKey: "ac-repair", categoryKey: "renovation", subcategoryKey: "hvac", price: 100, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 80,
    maxPrice: 300,
    serviceAreas: ["თბილისი", "რუსთავი", "მცხეთა"],
    yearsExperience: 11,
    avgRating: 4.6,
    totalReviews: 27,
    completedJobs: 22,
    customServices: ["ვენტილაციის სისტემა", "თბოიზოლაცია"],
    languages: ["ka", "ru"],
  },
  {
    name: "ბექა ნოზაძე",
    phone: "+995599000006",
    email: "beka.n@demo.ge",
    city: "kutaisi",
    avatar: "https://randomuser.me/api/portraits/men/22.jpg",
    title: "ხელოსანი (ჰენდიმენი)",
    bio: "უნივერსალური ხელოსანი ქუთაისში. ვაკეთებ ავეჯის აწყობას, თაროების მონტაჟს, წვრილმანი შეკეთებებს და სხვა საყოფაცხოვრებო სამუშაოებს. სწრაფი, საიმედო და ხელმისაწვდომი ფასებით.",
    selectedCategories: ["services"],
    selectedSubcategories: ["appliance-repair"],
    categories: ["services"],
    subcategories: ["appliance-repair"],
    selectedServices: [
      { key: "appliance-repair", categoryKey: "services", name: "Appliance Repair", nameKa: "ტექნიკის შეკეთება", experience: "3-5" },
    ],
    servicePricing: [
      { serviceKey: "mounting", categoryKey: "services", subcategoryKey: "appliance-repair", price: 30, isActive: true, discountTiers: [] },
      { serviceKey: "furniture-assembly", categoryKey: "services", subcategoryKey: "appliance-repair", price: 50, isActive: true, discountTiers: [{ minQuantity: 3, percent: 10 }] },
      { serviceKey: "minor-repair", categoryKey: "services", subcategoryKey: "appliance-repair", price: 40, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 30,
    maxPrice: 50,
    serviceAreas: ["ქუთაისი", "სამტრედია", "ზესტაფონი"],
    yearsExperience: 4,
    avgRating: 4.3,
    totalReviews: 12,
    completedJobs: 8,
    customServices: ["ავეჯის აწყობა", "სურათების ჩამოკიდება", "პატარა სარემონტო სამუშაოები"],
    languages: ["ka"],
  },
  {
    name: "თემური გელაშვილი",
    phone: "+995599000007",
    email: "temuri.g@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/men/36.jpg",
    title: "კარის/საკეტის სპეციალისტი",
    bio: "კარების მონტაჟი და საკეტების დაყენება — 9 წლიანი გამოცდილებით. ვმუშაობ შესასვლელ, ინტერიერულ და ლითონის კარებთან. ასევე ვაკეთებ საკეტების გამოცვლას, გასაღებების დამზადებას და საგანგებო გახსნას.",
    selectedCategories: ["renovation", "services"],
    selectedSubcategories: ["doors-windows", "locksmith"],
    categories: ["renovation", "services"],
    subcategories: ["doors-windows", "locksmith"],
    selectedServices: [
      { key: "doors-windows", categoryKey: "renovation", name: "Doors & Windows", nameKa: "კარ-ფანჯარა", experience: "5-10" },
      { key: "locksmith", categoryKey: "services", name: "Locksmith", nameKa: "საკეტების მომსახურება", experience: "5-10" },
    ],
    servicePricing: [
      { serviceKey: "door-install", categoryKey: "renovation", subcategoryKey: "doors-windows", price: 150, isActive: true, discountTiers: [{ minQuantity: 3, percent: 12 }] },
      { serviceKey: "lock-change", categoryKey: "services", subcategoryKey: "locksmith", price: 60, isActive: true, discountTiers: [] },
      { serviceKey: "lock-emergency", categoryKey: "services", subcategoryKey: "locksmith", price: 80, isActive: true, discountTiers: [] },
      { serviceKey: "key-making", categoryKey: "services", subcategoryKey: "locksmith", price: 25, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 25,
    maxPrice: 150,
    serviceAreas: ["თბილისი", "რუსთავი"],
    yearsExperience: 9,
    avgRating: 4.4,
    totalReviews: 21,
    completedJobs: 19,
    customServices: ["ჯავშნიანი კარის მონტაჟი", "გასაღების დუბლიკატი"],
    languages: ["ka", "en"],
  },
  {
    name: "მარიამი ლომიძე",
    phone: "+995599000008",
    email: "mariami.l@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    title: "IT სპეციალისტი",
    bio: "კომპიუტერული მომსახურება და ქსელის ადმინისტრირება. ვაკეთებ კომპიუტერის შეკეთებას, ვირუსებისგან გაწმენდას, ქსელის გამართვას და Wi-Fi-ს კონფიგურაციას. ვემსახურები როგორც ფიზიკურ პირებს, ისე მცირე ბიზნესებს.",
    selectedCategories: ["services"],
    selectedSubcategories: ["it-support", "network-admin"],
    categories: ["services"],
    subcategories: ["it-support", "network-admin"],
    selectedServices: [
      { key: "it-support", categoryKey: "services", name: "IT Support", nameKa: "IT მომსახურება", experience: "3-5" },
      { key: "network-admin", categoryKey: "services", name: "Network Administration", nameKa: "ქსელის ადმინისტრირება", experience: "3-5" },
    ],
    servicePricing: [
      { serviceKey: "computer-repair", categoryKey: "services", subcategoryKey: "it-support", price: 50, isActive: true, discountTiers: [] },
      { serviceKey: "virus-removal", categoryKey: "services", subcategoryKey: "it-support", price: 40, isActive: true, discountTiers: [] },
      { serviceKey: "network-setup", categoryKey: "services", subcategoryKey: "network-admin", price: 100, isActive: true, discountTiers: [{ minQuantity: 2, percent: 15 }] },
      { serviceKey: "wifi-config", categoryKey: "services", subcategoryKey: "network-admin", price: 60, isActive: true, discountTiers: [] },
    ],
    pricingModel: "range",
    basePrice: 40,
    maxPrice: 100,
    serviceAreas: ["თბილისი"],
    yearsExperience: 6,
    avgRating: 4.8,
    totalReviews: 15,
    completedJobs: 12,
    customServices: ["მონაცემთა აღდგენა", "ოპერაციული სისტემის ინსტალაცია", "პრინტერის გამართვა"],
    languages: ["ka", "en", "ru"],
  },
];

// ── Client users ─────────────────────────────────────────────────────────────

const CLIENTS = [
  {
    name: "ლუკა წიკლაური",
    phone: "+995599000009",
    email: "luka.ts@demo.ge",
    city: "tbilisi",
    avatar: "https://randomuser.me/api/portraits/men/71.jpg",
  },
  {
    name: "სოფიო მეგრელიშვილი",
    phone: "+995599000010",
    email: "sopio.m@demo.ge",
    city: "batumi",
    avatar: "https://randomuser.me/api/portraits/women/65.jpg",
  },
  {
    name: "ზურაბ ხარაზი",
    phone: "+995599000011",
    email: "zurab.kh@demo.ge",
    city: "kutaisi",
    avatar: "https://randomuser.me/api/portraits/men/18.jpg",
  },
];

// ── Seed logic ───────────────────────────────────────────────────────────────

async function getNextUid(): Promise<number> {
  const last = await User.findOne({ uid: { $exists: true } })
    .sort({ uid: -1 })
    .exec();
  return last?.uid ? (last.uid as number) + 1 : 100001;
}

async function seed() {
  console.log(`Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI!);
  console.log("Connected.\n");

  const hashedPassword = await bcrypt.hash(RAW_PASSWORD, 10);
  let nextUid = await getNextUid();

  const results: { name: string; phone: string; email: string; role: string }[] = [];

  // ── Upsert pros ──────────────────────────────────────────────────────────
  for (let i = 0; i < PROS.length; i++) {
    const p = PROS[i];
    const doc: any = {
      ...p,
      uid: 100001 + i,
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
      createdAt: randomDateWithinMonths(6),
    };

    await User.updateOne(
      { phone: p.phone },
      { $set: doc },
      { upsert: true },
    );
    results.push({ name: p.name, phone: p.phone, email: p.email, role: "pro" });
    console.log(`  ✓ Pro: ${p.name}`);
  }

  // ── Upsert clients ────────────────────────────────────────────────────────
  for (let i = 0; i < CLIENTS.length; i++) {
    const c = CLIENTS[i];
    const doc: any = {
      ...c,
      uid: 100001 + PROS.length + i,
      password: hashedPassword,
      role: "client",
      accountType: "individual",
      isPhoneVerified: true,
      isEmailVerified: true,
      isActive: true,
      registrationStep: 5,
      createdAt: randomDateWithinMonths(6),
    };

    await User.updateOne(
      { phone: c.phone },
      { $set: doc },
      { upsert: true },
    );
    results.push({ name: c.name, phone: c.phone, email: c.email, role: "client" });
    console.log(`  ✓ Client: ${c.name}`);
  }

  // ── Print credentials table ────────────────────────────────────────────────
  console.log("\n" + "=".repeat(90));
  console.log("  DEMO CREDENTIALS");
  console.log("=".repeat(90));
  console.log(
    padRight("Name", 28) +
    " | " + padRight("Phone", 16) +
    " | " + padRight("Email", 22) +
    " | " + padRight("Password", 10) +
    " | Role",
  );
  console.log("-".repeat(90));

  for (const r of results) {
    console.log(
      padRight(r.name, 28) +
      " | " + padRight(r.phone, 16) +
      " | " + padRight(r.email, 22) +
      " | " + padRight(RAW_PASSWORD, 10) +
      " | " + r.role,
    );
  }
  console.log("=".repeat(90));
  console.log(`\nTotal: ${PROS.length} pros + ${CLIENTS.length} clients = ${results.length} users`);

  await mongoose.disconnect();
  console.log("Done.");
}

function padRight(str: string, len: number): string {
  // Georgian characters can be wider — just pad to max
  if (str.length >= len) return str;
  return str + " ".repeat(len - str.length);
}

seed().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
