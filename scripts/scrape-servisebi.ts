/**
 * Scrape & normalize listings from servisebi.ge into DB-ready format
 *
 * Outputs:
 *   - scrape-output/providers.json       (deduplicated, normalized, DB-ready)
 *   - scrape-output/professionals.txt    (human-readable)
 *   - scrape-output/services.txt
 *   - scrape-output/tool-rentals.txt
 *   - scrape-output/shops.txt
 *   - scrape-output/other.txt
 *
 * Usage:
 *   npx ts-node scripts/scrape-servisebi.ts [--start=20000] [--end=47500] [--delay=250]
 */

import axios from "axios";
import * as cheerio from "cheerio";
import * as fs from "fs";
import { resolve } from "path";

// --- CLI args ---
const args = process.argv.slice(2);
const getArg = (name: string, def: number) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? parseInt(found.split("=")[1], 10) : def;
};
const startId = getArg("start", 20000);
const endId = getArg("end", 47500);
const delay = getArg("delay", 250);

// ============================================================
// HOMICO TYPE: professional | service | tool-rental | shop
// ============================================================

type HomicoType = "professional" | "service" | "tool-rental" | "shop" | "other";

// ============================================================
// CATEGORY MAPPING: servisebi.ge Georgian keywords → Homico category/subcategory
// ============================================================

interface CategoryMapping {
  homicoType: HomicoType;
  category: string;       // Homico category key
  subcategory: string;    // Homico subcategory key
  categoryKa: string;     // Georgian display name
  skip?: boolean;         // true = not relevant to Homico, skip
  subcategoryKa: string;
}

// Each entry: [keywords[], mapping]
const CATEGORY_MAP: [string[], CategoryMapping][] = [
  // ── RENOVATION / PROFESSIONALS ──────────────────────────

  // Plumbing
  [["სანტექნიკ", "კანალიზაცი"], {
    homicoType: "professional", category: "renovation", subcategory: "plumbing",
    categoryKa: "რემონტი", subcategoryKa: "სანტექნიკა",
  }],

  // Electricity
  [["ელექტრიკ", "ელექტრო"], {
    homicoType: "professional", category: "renovation", subcategory: "electricity",
    categoryKa: "რემონტი", subcategoryKa: "ელექტროობა",
  }],

  // Painting / Mural
  [["მალიარ", "სამღებრო", "შპალერ", "ფითხ", "გაშპაკვლ"], {
    homicoType: "professional", category: "renovation", subcategory: "mural",
    categoryKa: "რემონტი", subcategoryKa: "მალიარი",
  }],

  // Roofing
  [["გადახურვა", "სახურავ", "ტოლით"], {
    homicoType: "professional", category: "renovation", subcategory: "roofing",
    categoryKa: "რემონტი", subcategoryKa: "სახურავი",
  }],

  // Tile / Ceiling
  [["კაფელ", "მეტლახ", "მოზაიკ"], {
    homicoType: "professional", category: "renovation", subcategory: "tiling",
    categoryKa: "რემონტი", subcategoryKa: "კაფელ-მეტლახი",
  }],
  [["გასაჭიმი ჭერ", "ხის ჭერ", "ამსტრონგ", "თაბაშირ", "გიფსოკარდონ"], {
    homicoType: "professional", category: "renovation", subcategory: "tile",
    categoryKa: "რემონტი", subcategoryKa: "ჭერი",
  }],

  // Flooring
  [["იატაკ", "ლამინატ", "პარკეტ", "სტიაშკ", "ციკლოვკ"], {
    homicoType: "professional", category: "renovation", subcategory: "flooring",
    categoryKa: "რემონტი", subcategoryKa: "იატაკი",
  }],

  // Plastering
  [["ლესვა", "მლესავ", "ბრიზგ", "ატკოს"], {
    homicoType: "professional", category: "renovation", subcategory: "plastering",
    categoryKa: "რემონტი", subcategoryKa: "მლესავი",
  }],

  // HVAC
  [["გათბობ", "კონდიციონერ", "გაგრილება"], {
    homicoType: "professional", category: "renovation", subcategory: "hvac",
    categoryKa: "რემონტი", subcategoryKa: "გათბობა/გაგრილება",
  }],

  // Ironwork
  [["ლითონ", "რკინა", "სვარკა", "არგონ"], {
    homicoType: "professional", category: "renovation", subcategory: "iron",
    categoryKa: "რემონტი", subcategoryKa: "რკინის სამუშაოები",
  }],

  // Woodwork
  [["ხის სამუშაო", "დურგალ", "ავეჯის დამზადება", "ავეჯის რესტავრაცი"], {
    homicoType: "professional", category: "renovation", subcategory: "woodwork",
    categoryKa: "რემონტი", subcategoryKa: "ხის სამუშაოები",
  }],

  // Glasswork
  [["მინა", "მინის", "სარკე", "შხაპკაბინა", "ტიხრ"], {
    homicoType: "professional", category: "renovation", subcategory: "glasswork",
    categoryKa: "რემონტი", subcategoryKa: "მინის სამუშაოები",
  }],

  // Walls / Masonry
  [["კედლ", "ბლოკ", "აშენება"], {
    homicoType: "professional", category: "renovation", subcategory: "masonry",
    categoryKa: "რემონტი", subcategoryKa: "კედლის აშენება",
  }],

  // Demolition
  [["დემონტაჟ", "დანგრევა", "პერფორატორ"], {
    homicoType: "professional", category: "renovation", subcategory: "demolition",
    categoryKa: "რემონტი", subcategoryKa: "დემონტაჟი",
  }],

  // Full renovation
  [["სრული სარემონტო", "სრული რემონტ", "გარემონტება"], {
    homicoType: "professional", category: "renovation", subcategory: "full-renovation",
    categoryKa: "რემონტი", subcategoryKa: "სრული რემონტი",
  }],

  // Gas
  [["გაზის"], {
    homicoType: "professional", category: "renovation", subcategory: "gas",
    categoryKa: "რემონტი", subcategoryKa: "გაზის სამუშაოები",
  }],

  // Fireplace
  [["ბუხარ"], {
    homicoType: "professional", category: "renovation", subcategory: "fireplace",
    categoryKa: "რემონტი", subcategoryKa: "ბუხარი",
  }],

  // Windows/Doors
  [["კარ-ფანჯარა", "კარის ხელოსან", "ჟალუზ"], {
    homicoType: "professional", category: "renovation", subcategory: "doors-windows",
    categoryKa: "რემონტი", subcategoryKa: "კარ-ფანჯარა",
  }],

  // House building
  [["სახლ მშენებლობა", "კარკას"], {
    homicoType: "professional", category: "renovation", subcategory: "construction",
    categoryKa: "რემონტი", subcategoryKa: "მშენებლობა",
  }],

  // Measurement
  [["აზომვ", "დაკვალვა"], {
    homicoType: "professional", category: "renovation", subcategory: "measurement",
    categoryKa: "რემონტი", subcategoryKa: "აზომვა",
  }],

  // ── DESIGN ──────────────────────────

  [["ინტერიერ", "დიზაინ"], {
    homicoType: "professional", category: "design", subcategory: "interior",
    categoryKa: "დიზაინი", subcategoryKa: "ინტერიერი",
  }],

  // ── ARCHITECTURE ──────────────────────────

  [["არქიტექტორ", "პროექტირება"], {
    homicoType: "professional", category: "architecture", subcategory: "residential-architecture",
    categoryKa: "არქიტექტურა", subcategoryKa: "საცხოვრებელი",
  }],

  // ── SERVICES ──────────────────────────

  // Cleaning
  [["დამლაგებელ", "დალაგება", "ქიმწმენდა"], {
    homicoType: "service", category: "services", subcategory: "cleaning",
    categoryKa: "სერვისები", subcategoryKa: "დალაგება",
  }],

  // Moving / Transport
  [["გადაზიდვა", "ნარჩენ", "ნაგვის გატანა", "მასალების მიტანა", "სატვირთო", "ტრანსპორტ"], {
    homicoType: "service", category: "services", subcategory: "moving",
    categoryKa: "სერვისები", subcategoryKa: "გადაზიდვა",
  }],

  // Appliance Repair
  [["მაცივარ", "სარეცხი მანქანა", "გაზქურა", "საყოფაცხოვრებო", "ტელევიზორ", "სატელიტურ",
    "კარტრიჯ", "პრინტერ", "კომპიუტერ", "ტელეფონ", "ვინდოუს", "ფლეისთეიშენ",
    "ანტენ"], {
    homicoType: "professional", category: "services", subcategory: "appliance-repair",
    categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება",
  }],

  // Pest control / Disinfection
  [["დეზინფექცი", "დეზინსექცი"], {
    homicoType: "service", category: "services", subcategory: "pest-control",
    categoryKa: "სერვისები", subcategoryKa: "დეზინსექცია",
  }],

  // Photo / Video
  [["ფოტო", "ვიდეო", "დრონ", "გადაღება"], {
    homicoType: "professional", category: "services", subcategory: "photo-video",
    categoryKa: "სერვისები", subcategoryKa: "ფოტო/ვიდეო",
  }],

  // ── VEHICLE SERVICES ──────────────────────────

  [["ევაკუატორ"], {
    homicoType: "service", category: "vehicle-services", subcategory: "evacuation",
    categoryKa: "სატრანსპორტო", subcategoryKa: "ევაკუატორი",
  }],
  [["მინივენ", "მიკროავტობუს", "მარშუტკა", "ავტობუს"], {
    homicoType: "service", category: "vehicle-services", subcategory: "passenger-transport",
    categoryKa: "სატრანსპორტო", subcategoryKa: "მგზავრთა გადაყვანა",
  }],
  [["ტაქსი"], {
    homicoType: "service", category: "vehicle-services", subcategory: "taxi",
    categoryKa: "სატრანსპორტო", subcategoryKa: "ტაქსი",
  }],

  // ── AUTO SERVICES ──────────────────────────

  [["ძრავ", "დიაგნოსტიკა", "გადაცემათა", "სავალი ნაწილ", "ვულკანიზაცია",
    "პოლირება", "მანქანის შეღებვა", "სათუნუქე", "მანქანის კონდიციონერ",
    "კატალიზატორ", "ტურბინ", "რულავო"], {
    homicoType: "service", category: "auto-services", subcategory: "auto-repair",
    categoryKa: "ავტო სერვისი", subcategoryKa: "ავტო შეკეთება",
  }],

  // ── SKIP: NOT RELEVANT TO HOMICO ──────────────────────────

  [["მასწავლებელ", "რეპეტიტორ", "მომზადება", "შესწავლა", "პედაგოგ",
    "კურსები", "ტრენინგ", "ენა", "ენაში", "ენის", "სკოლა", "აკადემია"], {
    homicoType: "service", category: "education", subcategory: "tutoring",
    categoryKa: "განათლება", subcategoryKa: "რეპეტიტორი", skip: true,
  }],
  [["ადვოკატ", "იურისტ", "ნოტარიუს"], {
    homicoType: "service", category: "legal", subcategory: "lawyer",
    categoryKa: "სამართლებრივი", subcategoryKa: "ადვოკატი", skip: true,
  }],
  [["ბუღალტერ", "აუდიტ"], {
    homicoType: "service", category: "legal", subcategory: "accounting",
    categoryKa: "სამართლებრივი", subcategoryKa: "ბუღალტერია", skip: true,
  }],
  [["ვებ", "საიტ", "პროგრამირება", "SEO", "სოც. მედია", "მარკეტინგ", "ქსელურ"], {
    homicoType: "service", category: "digital", subcategory: "web-it",
    categoryKa: "ციფრული", subcategoryKa: "ვებ/IT", skip: true,
  }],
  [["ძაღლ", "კატა", "ცხოველ", "გასეირნება", "ვეტერინარ", "გრუმინგ"], {
    homicoType: "service", category: "pet-services", subcategory: "pet-care",
    categoryKa: "შინაური ცხოველები", subcategoryKa: "ცხოველების მოვლა", skip: true,
  }],
  [["ტურ", "სასტუმრო", "ჰოსტელ", "კოტეჯ", "ავია"], {
    homicoType: "service", category: "tourism", subcategory: "tourism",
    categoryKa: "ტურიზმი", subcategoryKa: "ტურიზმი", skip: true,
  }],
  [["სტომატოლოგ", "კლინიკა", "ექიმ", "მედიცინ", "ფსიქოლოგ", "მასაჟ"], {
    homicoType: "service", category: "healthcare", subcategory: "healthcare",
    categoryKa: "ჯანდაცვა", subcategoryKa: "ჯანდაცვა", skip: true,
  }],
  [["სალონ", "სტილისტ", "მაკიაჟ", "მანიკური", "კოსმეტოლოგ", "ტატუ", "სპა"], {
    homicoType: "shop", category: "beauty", subcategory: "beauty",
    categoryKa: "სილამაზე", subcategoryKa: "სილამაზე", skip: true,
  }],
  [["რესტორან", "კაფე", "ლაუნჯ", "ღამის კლუბ", "კარაოკე", "ბოულინგ"], {
    homicoType: "shop", category: "food", subcategory: "food",
    categoryKa: "კვება", subcategoryKa: "კვება", skip: true,
  }],
  [["დაზღვევა", "დეტექტივ", "ლომბარდ"], {
    homicoType: "service", category: "misc", subcategory: "misc",
    categoryKa: "სხვა", subcategoryKa: "სხვა", skip: true,
  }],

  // ── TOOL RENTALS ──────────────────────────

  [["ქირავდება", "გაქირავება", "დაქირავება"], {
    homicoType: "tool-rental", category: "rentals", subcategory: "equipment",
    categoryKa: "გაქირავება", subcategoryKa: "აღჭურვილობა",
  }],
  [["ამწე", "კრანი", "კალათა"], {
    homicoType: "tool-rental", category: "rentals", subcategory: "crane-lift",
    categoryKa: "გაქირავება", subcategoryKa: "ამწე/კრანი",
  }],
  [["ხარაჩო", "დგარ", "დანკრატ"], {
    homicoType: "tool-rental", category: "rentals", subcategory: "scaffolding",
    categoryKa: "გაქირავება", subcategoryKa: "ხარაჩო",
  }],
  [["ექსკავატორ", "ტრაქტორ", "ბობკატ"], {
    homicoType: "tool-rental", category: "rentals", subcategory: "heavy-equipment",
    categoryKa: "გაქირავება", subcategoryKa: "მძიმე ტექნიკა",
  }],
  [["კომპრესორ"], {
    homicoType: "tool-rental", category: "rentals", subcategory: "compressor",
    categoryKa: "გაქირავება", subcategoryKa: "კომპრესორი",
  }],

  // ── SHOPS ──────────────────────────

  [["სალონ", "სტუდია", "მაღაზია"], {
    homicoType: "shop", category: "shop", subcategory: "general",
    categoryKa: "მაღაზია", subcategoryKa: "ზოგადი",
  }],
];

// ============================================================
// Normalized output type
// ============================================================

interface NormalizedProvider {
  servisebiId: number;
  type: HomicoType;
  name: string;
  phone: string;           // +995XXXXXXXXX
  city: string | null;
  cityKey: string | null;  // tbilisi, batumi, kutaisi...
  category: string;        // Homico category key
  subcategory: string;     // Homico subcategory key
  categoryKa: string;
  subcategoryKa: string;
  originalCategory: string | null;  // servisebi.ge category (for debugging)
  rating: number;
  reviewCount: number;
}

// ============================================================
// City normalization
// ============================================================

const CITY_MAP: Record<string, string> = {
  "თბილისი": "tbilisi",
  "ბათუმი": "batumi",
  "ქუთაისი": "kutaisi",
  "რუსთავი": "rustavi",
  "ზუგდიდი": "zugdidi",
  "გორი": "gori",
  "ფოთი": "poti",
  "თელავი": "telavi",
  "ახალციხე": "akhaltsikhe",
  "მცხეთა": "mtskheta",
  "კობულეთი": "kobuleti",
  "ოზურგეთი": "ozurgeti",
  "სენაკი": "senaki",
  "სამტრედია": "samtredia",
  "ხაშური": "khashuri",
  "ზესტაფონი": "zestafoni",
  "მარნეული": "marneuli",
  "საგარეჯო": "sagarejo",
  "წყალტუბო": "tskaltubo",
};

function normalizeCity(raw: string | null): { city: string | null; cityKey: string | null } {
  if (!raw) return { city: null, cityKey: null };
  const clean = raw.trim();
  for (const [ka, key] of Object.entries(CITY_MAP)) {
    if (clean.includes(ka)) return { city: ka, cityKey: key };
  }
  return { city: clean, cityKey: clean.toLowerCase().replace(/\s+/g, "-") };
}

// ============================================================
// Classification
// ============================================================

function classify(category: string | null, name: string): CategoryMapping | null {
  const text = [category, name].filter(Boolean).join(" ").toLowerCase();

  let bestMapping: CategoryMapping | null = null;
  let bestScore = 0;

  for (const [keywords, mapping] of CATEGORY_MAP) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMapping = mapping;
    }
  }

  // Skip irrelevant categories entirely
  if (!bestMapping || bestMapping.skip) return null;

  return bestMapping;
}

// ============================================================
// Scraper
// ============================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const http = axios.create({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "ka,en;q=0.9",
  },
});

async function scrapePage(productId: number): Promise<Omit<NormalizedProvider, "phone"> & { phone: string | null } | null> {
  try {
    const { data } = await http.get(
      `https://servisebi.ge/ka/product/detail/${productId}/x`,
      { maxRedirects: 5 },
    );

    // Detect redirect to homepage
    if (data.includes("<title>სერვისები | servisebi</title>") || !data.includes("product-card")) {
      return null;
    }

    const $ = cheerio.load(data);

    // Name
    const clientLink = $('a[href^="/client/"]').first();
    const rawName = clientLink.length
      ? clientLink.clone().children().remove().end().text().trim() || clientLink.text().trim()
      : $("h6").first().text().trim();
    const name = rawName.replace(/\s+/g, " ").trim();
    if (!name) return null;

    // City
    const rawCity = $(".product-card-location").first().text().trim() || null;
    const cleanCity = rawCity ? rawCity.replace(/\s+/g, " ").trim().split(",")[0].trim() : null;
    const { city, cityKey } = normalizeCity(cleanCity);

    // Category
    const rawCat = $(".product-card-tag").first().text().trim() || null;
    const originalCategory = rawCat ? rawCat.replace(/\s+/g, " ").trim() : null;

    // Rating
    const ratingText = $(".rating-counter").text().trim();
    const rm = ratingText.match(/([\d.]+)/);
    const rating = rm ? parseFloat(rm[1]) : 0;
    const rvm = ratingText.match(/\((\d+)\)/);
    const reviewCount = rvm ? parseInt(rvm[1], 10) : 0;

    // Classify — skip irrelevant categories
    const mapping = classify(originalCategory, name);
    if (!mapping) return null;

    return {
      servisebiId: productId,
      type: mapping.homicoType,
      name,
      phone: null,
      city,
      cityKey,
      category: mapping.category,
      subcategory: mapping.subcategory,
      categoryKa: mapping.categoryKa,
      subcategoryKa: mapping.subcategoryKa,
      originalCategory,
      rating,
      reviewCount,
    };
  } catch {
    return null;
  }
}

async function revealPhone(productId: number): Promise<string | null> {
  try {
    const { data } = await http.post(
      `https://api.servisebi.ge/v1/call/click?productId=${productId}&test=true&view=1`,
    );
    return data?.status === "success" ? data?.data?.phone || null : null;
  } catch {
    return null;
  }
}

// ============================================================
// Output
// ============================================================

const TYPE_LABELS: Record<HomicoType, string> = {
  professional: "👷 PROFESSIONALS",
  service: "🚗 SERVICES",
  "tool-rental": "🔧 TOOL RENTALS",
  shop: "🏪 SHOPS",
  other: "📋 OTHER",
};

// ============================================================
// Main
// ============================================================

function saveFiles(phoneMap: Map<string, NormalizedProvider>, outputDir: string) {
  const providers = [...phoneMap.values()];
  const byType = new Map<HomicoType, NormalizedProvider[]>();
  for (const p of providers) {
    if (!byType.has(p.type)) byType.set(p.type, []);
    byType.get(p.type)!.push(p);
  }
  for (const [type, items] of byType) {
    const fname = type === "tool-rental" ? "tool-rentals" : `${type}s`;
    fs.writeFileSync(resolve(outputDir, `${fname}.json`), JSON.stringify(items, null, 2), "utf-8");
  }
  return { providers, byType };
}

async function main() {
  console.log(`\n🔍 Scraping servisebi.ge  IDs ${startId}→${endId}  (delay: ${delay}ms)\n`);

  const outputDir = resolve(__dirname, "../scrape-output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Load existing data to avoid duplicates across runs
  const phoneMap = new Map<string, NormalizedProvider>();
  for (const file of fs.readdirSync(outputDir).filter((f) => f.endsWith(".json"))) {
    try {
      const existing: NormalizedProvider[] = JSON.parse(fs.readFileSync(resolve(outputDir, file), "utf-8"));
      for (const p of existing) {
        if (p.phone) phoneMap.set(p.phone, p);
      }
    } catch {}
  }
  if (phoneMap.size > 0) {
    console.log(`  Loaded ${phoneMap.size} existing providers (will skip duplicates)\n`);
  }

  let total = 0;
  let skipped = 0;

  for (let id = startId; id <= endId; id++) {
    const listing = await scrapePage(id);

    if (!listing) {
      skipped++;
      if ((id - startId) % 500 === 0 && id > startId) {
        console.log(`  ... ${id}/${endId} | found: ${total} | unique: ${phoneMap.size} | skipped: ${skipped}`);
      }
      await sleep(80);
      continue;
    }

    // Reveal phone
    const phone = await revealPhone(id);
    if (!phone) {
      skipped++;
      await sleep(delay);
      continue;
    }

    const fullPhone = `+995${phone}`;
    total++;

    // Deduplicate by phone
    if (!phoneMap.has(fullPhone)) {
      phoneMap.set(fullPhone, { ...listing, phone: fullPhone } as NormalizedProvider);
    }

    const typeTag = listing.type.toUpperCase().padEnd(13);
    console.log(
      `[${id}] ${typeTag} ${listing.name} | ${fullPhone} | ${listing.city || "?"} | ${listing.categoryKa}→${listing.subcategoryKa}`,
    );

    // Save every 50 new finds
    if (total % 50 === 0) {
      saveFiles(phoneMap, outputDir);
      console.log(`  💾 Saved ${phoneMap.size} providers to disk`);
    }

    await sleep(delay);
  }

  // Final save
  const { providers, byType } = saveFiles(phoneMap, outputDir);

  // Summary
  const counts: Record<string, number> = {};
  providers.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });

  console.log(`\n✅ DONE\n`);
  console.log(`  Total found:     ${total}`);
  console.log(`  Unique phones:   ${providers.length}`);
  console.log(`  Skipped:         ${skipped}`);
  console.log(`  ─────────────────────────`);
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    console.log(`  ${label}: ${counts[type] || 0}`);
  }
  console.log(`\n  Files saved to: ${outputDir}/`);
  for (const [type, items] of byType) {
    const fname = type === "tool-rental" ? "tool-rentals" : `${type}s`;
    console.log(`  → ${fname}.json (${items.length})`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
