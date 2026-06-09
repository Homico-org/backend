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
    selectedCategories: ["plumbing"],
    selectedSubcategories: ["plumbing_install"],
    categories: ["plumbing"],
    subcategories: ["plumbing_install"],
    selectedServices: [
      { key: "plumbing_install", categoryKey: "plumbing", name: "Plumbing Installation", nameKa: "სანტექნიკის მონტაჟი", experience: "10+" },
    ],
    servicePricing: [
      { serviceKey: "plumb_faucet_svc", categoryKey: "plumbing", subcategoryKey: "plumbing_install", price: 50, isActive: true, discountTiers: [{ minQuantity: 3, percent: 10 }] },
      { serviceKey: "plumb_toilet_svc", categoryKey: "plumbing", subcategoryKey: "plumbing_install", price: 120, isActive: true, discountTiers: [] },
      { serviceKey: "plumb_sink_svc", categoryKey: "plumbing", subcategoryKey: "plumbing_install", price: 200, isActive: true, discountTiers: [] },
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
    selectedCategories: ["electrical"],
    selectedSubcategories: ["wiring", "lighting"],
    categories: ["electrical"],
    subcategories: ["wiring", "lighting"],
    selectedServices: [
      { key: "wiring", categoryKey: "electrical", name: "Wiring", nameKa: "ელექტროგაყვანილობა", experience: "5-10" },
      { key: "lighting", categoryKey: "electrical", name: "Lighting", nameKa: "განათება", experience: "5-10" },
    ],
    servicePricing: [
      { serviceKey: "wiring_new_svc", categoryKey: "electrical", subcategoryKey: "wiring", price: 80, isActive: true, discountTiers: [{ minQuantity: 5, percent: 15 }] },
      { serviceKey: "wiring_outlet_svc", categoryKey: "electrical", subcategoryKey: "wiring", price: 30, isActive: true, discountTiers: [] },
      { serviceKey: "light_ceiling_svc", categoryKey: "electrical", subcategoryKey: "lighting", price: 60, isActive: true, discountTiers: [] },
      { serviceKey: "light_spot_svc", categoryKey: "electrical", subcategoryKey: "lighting", price: 50, isActive: true, discountTiers: [] },
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
    selectedCategories: ["painters"],
    selectedSubcategories: ["painter"],
    categories: ["painters"],
    subcategories: ["painter"],
    selectedServices: [
      { key: "painter", categoryKey: "painters", name: "Painting", nameKa: "მოხატვა/მალიარობა", experience: "5-10" },
    ],
    servicePricing: [
      { serviceKey: "paint_interior_svc", categoryKey: "painters", subcategoryKey: "painter", price: 25, isActive: true, discountTiers: [{ minQuantity: 4, percent: 10 }] },
      { serviceKey: "paint_wallpaper_svc", categoryKey: "painters", subcategoryKey: "painter", price: 35, isActive: true, discountTiers: [] },
      { serviceKey: "paint_ceiling_svc", categoryKey: "painters", subcategoryKey: "painter", price: 20, isActive: true, discountTiers: [] },
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
    selectedCategories: ["cleaning"],
    selectedSubcategories: ["regular_clean", "deep_clean", "post_renovation_clean"],
    categories: ["cleaning"],
    subcategories: ["regular_clean", "deep_clean", "post_renovation_clean"],
    selectedServices: [
      { key: "regular_clean", categoryKey: "cleaning", name: "Regular Cleaning", nameKa: "სტანდარტული დასუფთავება", experience: "3-5" },
      { key: "deep_clean", categoryKey: "cleaning", name: "Deep Cleaning", nameKa: "ღრმა დასუფთავება", experience: "3-5" },
      { key: "post_renovation_clean", categoryKey: "cleaning", name: "Post-renovation Cleaning", nameKa: "სარემონტო დასუფთავება", experience: "3-5" },
    ],
    servicePricing: [
      { serviceKey: "regular_standard_svc", categoryKey: "cleaning", subcategoryKey: "regular_clean", price: 60, isActive: true, discountTiers: [{ minQuantity: 4, percent: 15 }] },
      { serviceKey: "deep_full_svc", categoryKey: "cleaning", subcategoryKey: "deep_clean", price: 120, isActive: true, discountTiers: [{ minQuantity: 2, percent: 10 }] },
      { serviceKey: "post_reno_full_svc", categoryKey: "cleaning", subcategoryKey: "post_renovation_clean", price: 150, isActive: true, discountTiers: [] },
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
    selectedCategories: ["hvac"],
    selectedSubcategories: ["ac_ventilation"],
    categories: ["hvac"],
    subcategories: ["ac_ventilation"],
    selectedServices: [
      { key: "ac_ventilation", categoryKey: "hvac", name: "AC & Ventilation", nameKa: "კონდიციონერი და ვენტილაცია", experience: "10+" },
    ],
    servicePricing: [
      { serviceKey: "ac_install_svc", categoryKey: "hvac", subcategoryKey: "ac_ventilation", price: 200, isActive: true, discountTiers: [{ minQuantity: 3, percent: 10 }] },
      { serviceKey: "ac_service_svc", categoryKey: "hvac", subcategoryKey: "ac_ventilation", price: 80, isActive: true, discountTiers: [] },
      { serviceKey: "ac_repair_svc", categoryKey: "hvac", subcategoryKey: "ac_ventilation", price: 100, isActive: true, discountTiers: [] },
      { serviceKey: "ventilation_svc", categoryKey: "hvac", subcategoryKey: "ac_ventilation", price: 300, isActive: true, discountTiers: [] },
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
    selectedCategories: ["handyman"],
    selectedSubcategories: ["assembly", "mounting"],
    categories: ["handyman"],
    subcategories: ["assembly", "mounting"],
    selectedServices: [
      { key: "assembly", categoryKey: "handyman", name: "Assembly", nameKa: "აწყობა", experience: "3-5" },
      { key: "mounting", categoryKey: "handyman", name: "Mounting", nameKa: "მონტაჟი", experience: "3-5" },
    ],
    servicePricing: [
      { serviceKey: "mount_tv_svc", categoryKey: "handyman", subcategoryKey: "mounting", price: 30, isActive: true, discountTiers: [] },
      { serviceKey: "assembly_flatpack_svc", categoryKey: "handyman", subcategoryKey: "assembly", price: 50, isActive: true, discountTiers: [{ minQuantity: 3, percent: 10 }] },
      { serviceKey: "mount_shelf_svc", categoryKey: "handyman", subcategoryKey: "mounting", price: 40, isActive: true, discountTiers: [] },
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
    selectedCategories: ["windows-doors"],
    selectedSubcategories: ["windows", "glazing"],
    categories: ["windows-doors"],
    subcategories: ["windows", "glazing"],
    selectedServices: [
      { key: "windows", categoryKey: "windows-doors", name: "Windows", nameKa: "ფანჯრები", experience: "5-10" },
      { key: "glazing", categoryKey: "windows-doors", name: "Glazing", nameKa: "შემინვა", experience: "5-10" },
    ],
    servicePricing: [
      { serviceKey: "wd_pvc_svc", categoryKey: "windows-doors", subcategoryKey: "windows", price: 150, isActive: true, discountTiers: [{ minQuantity: 3, percent: 12 }] },
      { serviceKey: "wd_aluminum_svc", categoryKey: "windows-doors", subcategoryKey: "windows", price: 180, isActive: true, discountTiers: [] },
      { serviceKey: "wd_balcony_svc", categoryKey: "windows-doors", subcategoryKey: "glazing", price: 80, isActive: true, discountTiers: [] },
      { serviceKey: "wd_screen_svc", categoryKey: "windows-doors", subcategoryKey: "windows", price: 25, isActive: true, discountTiers: [] },
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
    title: "ინტერიერის დიზაინერი",
    bio: "ბინების და ოფისების ინტერიერის დიზაინი - 3D ვიზუალიზაცია, მასალების შერჩევა, ფერთა გადაწყვეტა. თითოეულ პროექტს ვუდგები ინდივიდუალურად, კლიენტის სტილისა და ბიუჯეტის გათვალისწინებით. დიპლომი ხელოვნების აკადემიიდან.",
    selectedCategories: ["designers"],
    selectedSubcategories: ["interior_design", "commercial_design"],
    categories: ["designers"],
    subcategories: ["interior_design", "commercial_design"],
    selectedServices: [
      { key: "interior_design", categoryKey: "designers", name: "Interior Design", nameKa: "ინტერიერის დიზაინი", experience: "3-5" },
      { key: "commercial_design", categoryKey: "designers", name: "Commercial Design", nameKa: "კომერციული დიზაინი", experience: "3-5" },
    ],
    servicePricing: [
      { serviceKey: "design_apartment_svc", categoryKey: "designers", subcategoryKey: "interior_design", price: 1500, isActive: true, discountTiers: [] },
      { serviceKey: "design_room_svc", categoryKey: "designers", subcategoryKey: "interior_design", price: 400, isActive: true, discountTiers: [] },
      { serviceKey: "design_office_svc", categoryKey: "designers", subcategoryKey: "commercial_design", price: 2500, isActive: true, discountTiers: [{ minQuantity: 2, percent: 15 }] },
    ],
    pricingModel: "range",
    basePrice: 400,
    maxPrice: 2500,
    serviceAreas: ["თბილისი"],
    yearsExperience: 6,
    avgRating: 4.8,
    totalReviews: 15,
    completedJobs: 12,
    customServices: ["3D ვიზუალიზაცია", "მასალების შერჩევა", "ფერთა გადაწყვეტა"],
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

  // Default working schedule for demo pros: Mon-Sat 9:00-19:00, Sun off.
  // Without this, `getAvailability()` in bookings.service.ts returns
  // "all slots unavailable" because the seeded pro has no
  // `weeklySchedule` entries, which makes the booking modal show "no
  // slots" on every date. dayOfWeek follows JS convention: Sun=0, Mon=1, ... Sat=6.
  const DEMO_WEEKLY_SCHEDULE = [
    { dayOfWeek: 0, isAvailable: false, startHour: 0, endHour: 0 },
    { dayOfWeek: 1, isAvailable: true, startHour: 9, endHour: 19 },
    { dayOfWeek: 2, isAvailable: true, startHour: 9, endHour: 19 },
    { dayOfWeek: 3, isAvailable: true, startHour: 9, endHour: 19 },
    { dayOfWeek: 4, isAvailable: true, startHour: 9, endHour: 19 },
    { dayOfWeek: 5, isAvailable: true, startHour: 9, endHour: 19 },
    { dayOfWeek: 6, isAvailable: true, startHour: 10, endHour: 17 },
  ];

  const results: { name: string; phone: string; email: string; role: string }[] = [];

  // ── Upsert pros ──────────────────────────────────────────────────────────
  //
  // UID handling: split into `$set` (every-run mutable fields) and
  // `$setOnInsert` (the uid + createdAt, which only apply on first
  // insert). Existing users keep their original uid - critical because
  // the uid index is unique, and re-running with a hardcoded `100001+i`
  // collides whenever the DB already has rows at those slots from a
  // prior seed or registration.
  for (let i = 0; i < PROS.length; i++) {
    const p = PROS[i];
    const setDoc: any = {
      ...p,
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
      weeklySchedule: DEMO_WEEKLY_SCHEDULE,
      // Demo bank account so admin payout flow works end-to-end without
      // the pro having to set it up via /settings/payouts. BoG sandbox
      // routing prefix `BG` + the pro's phone tail keeps account
      // numbers unique across the seed.
      bankAccount: {
        bankCode: "BAGAGE22",
        accountNumber: `GE00BG00000000${p.phone.slice(-7)}`,
        holderName: p.name,
        verifiedAt: new Date(),
      },
    };

    await User.updateOne(
      { phone: p.phone },
      {
        $set: setDoc,
        $setOnInsert: {
          uid: nextUid++,
          createdAt: randomDateWithinMonths(6),
        },
      },
      { upsert: true },
    );
    results.push({ name: p.name, phone: p.phone, email: p.email, role: "pro" });
    console.log(`  ✓ Pro: ${p.name}`);
  }

  // ── Upsert clients ────────────────────────────────────────────────────────
  for (let i = 0; i < CLIENTS.length; i++) {
    const c = CLIENTS[i];
    const setDoc: any = {
      ...c,
      password: hashedPassword,
      role: "client",
      accountType: "individual",
      isPhoneVerified: true,
      isEmailVerified: true,
      isActive: true,
      registrationStep: 5,
    };

    await User.updateOne(
      { phone: c.phone },
      {
        $set: setDoc,
        $setOnInsert: {
          uid: nextUid++,
          createdAt: randomDateWithinMonths(6),
        },
      },
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
