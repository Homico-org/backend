/**
 * Scrape & normalize listings from servisebi.ge into DB-ready format
 *
 * Outputs:
 *   - scrape-output/professionals.json
 *   - scrape-output/services.json
 *   - scrape-output/tool-rentals.json
 *   - scrape-output/shops.json
 *   - scrape-output/others.json
 *
 * Usage:
 *   npx ts-node scripts/scrape-servisebi.ts [--mode=all|categories|ids] [--start=20000] [--end=47500] [--delay=250]
 *
 *   --mode=categories  Only crawl category pages
 *   --mode=ids         Only iterate product IDs (legacy behavior)
 *   --mode=all         First crawl categories, then iterate IDs (default)
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
const getStringArg = (name: string, def: string) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : def;
};
const startId = getArg("start", 20000);
const endId = getArg("end", 47500);
const delay = getArg("delay", 250);
const mode = getStringArg("mode", "all") as "all" | "categories" | "ids";

// ============================================================
// HOMICO TYPE: professional | service | tool-rental | shop
// ============================================================

type HomicoType = "professional" | "service" | "tool-rental" | "shop" | "other";

// ============================================================
// CATEGORY MAPPING: servisebi.ge Georgian keywords -> Homico category/subcategory
// ============================================================

interface CategoryMapping {
  homicoType: HomicoType;
  category: string;
  subcategory: string;
  categoryKa: string;
  skip?: boolean;
  subcategoryKa: string;
}

// Each entry: [keywords[], mapping]
const CATEGORY_MAP: [string[], CategoryMapping][] = [
  // ── RENOVATION / PROFESSIONALS ──────────────────────────

  // Plumbing
  [["სანტექნიკ", "კანალიზაცი", "წყალი", "მილ", "ონკანი", "წყალგაყვანილობ"], {
    homicoType: "professional", category: "renovation", subcategory: "plumbing",
    categoryKa: "რემონტი", subcategoryKa: "სანტექნიკა",
  }],

  // Electricity
  [["ელექტრიკ", "ელექტრო", "გაყვანილობ", "სადენ", "ავტომატი", "შუქ", "განათებ"], {
    homicoType: "professional", category: "renovation", subcategory: "electricity",
    categoryKa: "რემონტი", subcategoryKa: "ელექტროობა",
  }],

  // Painting / Mural
  [["მალიარ", "სამღებრო", "შპალერ", "ფითხ", "გაშპაკვლ", "საღებავ"], {
    homicoType: "professional", category: "renovation", subcategory: "mural",
    categoryKa: "რემონტი", subcategoryKa: "მალიარი",
  }],

  // Roofing
  [["გადახურვა", "სახურავ", "ტოლით", "ჰიდროიზოლაცი", "თბოიზოლაცი"], {
    homicoType: "professional", category: "renovation", subcategory: "roofing",
    categoryKa: "რემონტი", subcategoryKa: "სახურავი",
  }],

  // Tile / Tiling
  [["კაფელ", "მეტლახ", "მოზაიკ"], {
    homicoType: "professional", category: "renovation", subcategory: "tiling",
    categoryKa: "რემონტი", subcategoryKa: "კაფელ-მეტლახი",
  }],

  // Ceiling / Drywall
  [["გასაჭიმი ჭერ", "ხის ჭერ", "ამსტრონგ", "თაბაშირ", "გიფსოკარდონ", "გასაჭიმ"], {
    homicoType: "professional", category: "renovation", subcategory: "tile",
    categoryKa: "რემონტი", subcategoryKa: "ჭერი",
  }],

  // Flooring
  [["იატაკ", "ლამინატ", "პარკეტ", "სტიაშკ", "ციკლოვკ", "მოპირკეთება"], {
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
  [["ლითონ", "რკინა", "სვარკა", "არგონ", "ლითონის ნაკეთობ"], {
    homicoType: "professional", category: "renovation", subcategory: "iron",
    categoryKa: "რემონტი", subcategoryKa: "რკინის სამუშაოები",
  }],

  // Woodwork
  [["ხის სამუშაო", "დურგალ", "ავეჯის დამზადება", "ავეჯის რესტავრაცი", "ხის კარ"], {
    homicoType: "professional", category: "renovation", subcategory: "woodwork",
    categoryKa: "რემონტი", subcategoryKa: "ხის სამუშაოები",
  }],

  // Glasswork
  [["მინა", "მინის", "სარკე", "შხაპკაბინა", "ტიხრ", "მინაზე"], {
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
    categoryKa: "რემონტი", subcategoryKa: "სრული რემონტი", skip: true,
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
  [["კარ-ფანჯარა", "კარის ხელოსან", "ჟალუზ", "მეტალოპლასტმას", "ფანჯარ", "კარის მონტაჟ"], {
    homicoType: "professional", category: "renovation", subcategory: "doors-windows",
    categoryKa: "რემონტი", subcategoryKa: "კარ-ფანჯარა",
  }],

  // House building / Construction
  [["სახლ მშენებლობა", "კარკას", "მშენებლობ"], {
    homicoType: "professional", category: "renovation", subcategory: "construction",
    categoryKa: "რემონტი", subcategoryKa: "მშენებლობა",
  }],

  // Measurement
  [["აზომვ", "დაკვალვა", "ნახაზ"], {
    homicoType: "professional", category: "renovation", subcategory: "measurement",
    categoryKa: "რემონტი", subcategoryKa: "აზომვა",
  }],

  // High-rise work
  [["სიმაღლეზე მუშაობ", "სიმაღლეზე სამუშაო", "ალპინისტ"], {
    homicoType: "professional", category: "renovation", subcategory: "high-rise",
    categoryKa: "რემონტი", subcategoryKa: "სიმაღლეზე მუშაობა",
  }],

  // Lift installation
  [["ლიფტის მონტაჟ", "ლიფტის"], {
    homicoType: "professional", category: "renovation", subcategory: "lift-installation",
    categoryKa: "რემონტი", subcategoryKa: "ლიფტის მონტაჟი",
  }],

  // Lathe work
  [["გაჩარხვა", "ტოკარ"], {
    homicoType: "professional", category: "renovation", subcategory: "lathe-work",
    categoryKa: "რემონტი", subcategoryKa: "გაჩარხვა/ტოკარი",
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
  [["დამლაგებელ", "დალაგება", "ქიმწმენდ", "დასუფთავება", "სველი წმენდა", "მოწესრიგება"], {
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
    "კარტრიჯ", "პრინტერ", "კომპიუტერ", "ტელეფონ", "ფლეისთეიშენ",
    "ანტენ", "ტექნიკის შეკეთება"], {
    homicoType: "professional", category: "services", subcategory: "appliance-repair",
    categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება",
  }],

  // IT Support
  [["ვინდოუს", "ვინდოუსის გადაყენება"], {
    homicoType: "professional", category: "services", subcategory: "it-support",
    categoryKa: "სერვისები", subcategoryKa: "IT მხარდაჭერა",
  }],

  // Pest control / Disinfection
  [["დეზინფექცი", "დეზინსექცი", "მავნებელ"], {
    homicoType: "service", category: "services", subcategory: "pest-control",
    categoryKa: "სერვისები", subcategoryKa: "დეზინსექცია",
  }],

  // Photo / Video
  [["ფოტო", "ვიდეო", "დრონ", "გადაღება"], {
    homicoType: "professional", category: "services", subcategory: "photo-video",
    categoryKa: "სერვისები", subcategoryKa: "ფოტო/ვიდეო", skip: true,
  }],

  // Security
  [["დაცვის სამსახურ", "კერძო დაცვ", "უსაფრთხოებ", "დაცვა"], {
    homicoType: "service", category: "services", subcategory: "security",
    categoryKa: "სერვისები", subcategoryKa: "დაცვა",
  }],

  // Smart home
  [["ჭკვიანი სახლ", "სმარტ"], {
    homicoType: "professional", category: "services", subcategory: "smart-home",
    categoryKa: "სერვისები", subcategoryKa: "ჭკვიანი სახლი",
  }],

  // Gardening / Landscaping
  [["ეზოს მოწყობა", "ბაღ", "გამწვანება", "ლანდშაფტ"], {
    homicoType: "service", category: "services", subcategory: "gardening",
    categoryKa: "სერვისები", subcategoryKa: "ბაღი/ეზო",
  }],

  // Housekeeper
  [["დიასახლის"], {
    homicoType: "service", category: "services", subcategory: "housekeeper",
    categoryKa: "სერვისები", subcategoryKa: "დიასახლისი", skip: true,
  }],

  // Nanny
  [["ძიძა", "მომვლელ"], {
    homicoType: "service", category: "services", subcategory: "nanny",
    categoryKa: "სერვისები", subcategoryKa: "ძიძა", skip: true,
  }],

  // Elderly care
  [["მოხუცის მოვლა", "მწოლიარის მოვლა", "მოხუც", "მწოლიარ"], {
    homicoType: "service", category: "services", subcategory: "elderly-care",
    categoryKa: "სერვისები", subcategoryKa: "მოხუცის მოვლა", skip: true,
  }],

  // Courier
  [["საკურიერო", "კურიერ"], {
    homicoType: "service", category: "services", subcategory: "courier",
    categoryKa: "სერვისები", subcategoryKa: "საკურიერო", skip: true,
  }],

  // Tailor
  [["კერვა", "თეთრეულ", "ფარდ", "ტანსაცმლ"], {
    homicoType: "service", category: "services", subcategory: "tailor",
    categoryKa: "სერვისები", subcategoryKa: "კერვა", skip: true,
  }],

  // Locksmith
  [["გასაღებ", "საკეტ"], {
    homicoType: "service", category: "services", subcategory: "locksmith",
    categoryKa: "სერვისები", subcategoryKa: "გასაღებების დამზადება",
  }],

  // Labor hire
  [["მუშების დაქირავება", "მუშა", "მოსამსახურე"], {
    homicoType: "service", category: "services", subcategory: "labor-hire",
    categoryKa: "სერვისები", subcategoryKa: "მუშების დაქირავება",
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
// CATEGORY PAGES: servisebi.ge category pages to crawl
// ============================================================

interface CategoryPageEntry {
  categoryId: number;
  slug: string;
  homicoCategory: string;
  homicoSubcategory: string;
  categoryKa: string;
  subcategoryKa: string;
  homicoType: HomicoType;
}

const CATEGORY_PAGES: CategoryPageEntry[] = [
  // ── RENOVATION ──────────────────────────

  // Plumbing
  { categoryId: 33, slug: "სანტექნიკი-გამოძახებით", homicoCategory: "renovation", homicoSubcategory: "plumbing", categoryKa: "რემონტი", subcategoryKa: "სანტექნიკა", homicoType: "professional" },
  { categoryId: 383, slug: "კანალიზაციის-გაწმენდა", homicoCategory: "renovation", homicoSubcategory: "plumbing", categoryKa: "რემონტი", subcategoryKa: "სანტექნიკა", homicoType: "professional" },

  // Electricity
  { categoryId: 70, slug: "ელექტრიკი", homicoCategory: "renovation", homicoSubcategory: "electricity", categoryKa: "რემონტი", subcategoryKa: "ელექტროობა", homicoType: "professional" },

  // Mural / Painting
  { categoryId: 127, slug: "ფითხის-შპალერის-და-სამღებრო-სამუშაოები", homicoCategory: "renovation", homicoSubcategory: "mural", categoryKa: "რემონტი", subcategoryKa: "მალიარი", homicoType: "professional" },

  // Roofing
  { categoryId: 126, slug: "გადახურვა-ჰიდრო-და-თბოიზოლაცია", homicoCategory: "renovation", homicoSubcategory: "roofing", categoryKa: "რემონტი", subcategoryKa: "სახურავი", homicoType: "professional" },

  // Tiling
  { categoryId: 134, slug: "კაფელმეტლახი-მოზაიკა", homicoCategory: "renovation", homicoSubcategory: "tiling", categoryKa: "რემონტი", subcategoryKa: "კაფელ-მეტლახი", homicoType: "professional" },

  // Drywall / Ceiling
  { categoryId: 124, slug: "თაბაშირ-მუყაოს-ხელოსანი", homicoCategory: "renovation", homicoSubcategory: "tile", categoryKa: "რემონტი", subcategoryKa: "ჭერი", homicoType: "professional" },
  { categoryId: 392, slug: "ხის-ჭერის-გაკვრა", homicoCategory: "renovation", homicoSubcategory: "tile", categoryKa: "რემონტი", subcategoryKa: "ჭერი", homicoType: "professional" },
  { categoryId: 393, slug: "ამსტრონგის-ჭერის-მონტაჟი", homicoCategory: "renovation", homicoSubcategory: "tile", categoryKa: "რემონტი", subcategoryKa: "ჭერი", homicoType: "professional" },
  { categoryId: 395, slug: "გასაჭიმი-ჭერი", homicoCategory: "renovation", homicoSubcategory: "tile", categoryKa: "რემონტი", subcategoryKa: "ჭერი", homicoType: "professional" },

  // Flooring
  { categoryId: 29, slug: "იატაკი-მოპირკეთება", homicoCategory: "renovation", homicoSubcategory: "flooring", categoryKa: "რემონტი", subcategoryKa: "იატაკი", homicoType: "professional" },

  // Plastering / Masonry
  { categoryId: 101, slug: "კედლების-აშენება-ლესვა-ბრიზგი", homicoCategory: "renovation", homicoSubcategory: "plastering", categoryKa: "რემონტი", subcategoryKa: "მლესავი", homicoType: "professional" },

  // HVAC
  { categoryId: 28, slug: "გათბობის-ხელოსანი", homicoCategory: "renovation", homicoSubcategory: "hvac", categoryKa: "რემონტი", subcategoryKa: "გათბობა/გაგრილება", homicoType: "professional" },
  { categoryId: 182, slug: "კონდიციონერის-ხელოსანი", homicoCategory: "renovation", homicoSubcategory: "hvac", categoryKa: "რემონტი", subcategoryKa: "გათბობა/გაგრილება", homicoType: "professional" },

  // Ironwork
  { categoryId: 32, slug: "ლითონის-ნაკეთობები", homicoCategory: "renovation", homicoSubcategory: "iron", categoryKa: "რემონტი", subcategoryKa: "რკინის სამუშაოები", homicoType: "professional" },
  { categoryId: 109, slug: "არგონის-სვარკა", homicoCategory: "renovation", homicoSubcategory: "iron", categoryKa: "რემონტი", subcategoryKa: "რკინის სამუშაოები", homicoType: "professional" },

  // Woodwork
  { categoryId: 68, slug: "ავეჯის-დამზადება", homicoCategory: "renovation", homicoSubcategory: "woodwork", categoryKa: "რემონტი", subcategoryKa: "ხის სამუშაოები", homicoType: "professional" },
  { categoryId: 398, slug: "ავეჯის-რესტავრაცია", homicoCategory: "renovation", homicoSubcategory: "woodwork", categoryKa: "რემონტი", subcategoryKa: "ხის სამუშაოები", homicoType: "professional" },

  // Doors / Windows
  { categoryId: 115, slug: "კარის-ხელოსანი", homicoCategory: "renovation", homicoSubcategory: "doors-windows", categoryKa: "რემონტი", subcategoryKa: "კარ-ფანჯარა", homicoType: "professional" },
  { categoryId: 35, slug: "მეტალოპლასტმასის-კარ-ფანჯარა", homicoCategory: "renovation", homicoSubcategory: "doors-windows", categoryKa: "რემონტი", subcategoryKa: "კარ-ფანჯარა", homicoType: "professional" },
  { categoryId: 420, slug: "ჟალუზები", homicoCategory: "renovation", homicoSubcategory: "doors-windows", categoryKa: "რემონტი", subcategoryKa: "კარ-ფანჯარა", homicoType: "professional" },

  // Glasswork
  { categoryId: 137, slug: "მინაზე-სამუშაოები", homicoCategory: "renovation", homicoSubcategory: "glasswork", categoryKa: "რემონტი", subcategoryKa: "მინის სამუშაოები", homicoType: "professional" },

  // Demolition
  { categoryId: 130, slug: "დემონტაჟი", homicoCategory: "renovation", homicoSubcategory: "demolition", categoryKa: "რემონტი", subcategoryKa: "დემონტაჟი", homicoType: "professional" },

  // Gas
  { categoryId: 14, slug: "გაზის-მონტაჟი", homicoCategory: "renovation", homicoSubcategory: "gas", categoryKa: "რემონტი", subcategoryKa: "გაზის სამუშაოები", homicoType: "professional" },

  // Fireplace
  { categoryId: 128, slug: "ბუხრის-აშენება-გაწმენდა-მოპირკეთება", homicoCategory: "renovation", homicoSubcategory: "fireplace", categoryKa: "რემონტი", subcategoryKa: "ბუხარი", homicoType: "professional" },

  // Construction
  { categoryId: 196, slug: "სახლების-მშენებლობა", homicoCategory: "renovation", homicoSubcategory: "construction", categoryKa: "რემონტი", subcategoryKa: "მშენებლობა", homicoType: "professional" },

  // Measurement
  { categoryId: 27, slug: "აზომვითი-ნახაზები", homicoCategory: "renovation", homicoSubcategory: "measurement", categoryKa: "რემონტი", subcategoryKa: "აზომვა", homicoType: "professional" },

  // High-rise work
  { categoryId: 136, slug: "სიმაღლეზე-მუშაობა", homicoCategory: "renovation", homicoSubcategory: "high-rise", categoryKa: "რემონტი", subcategoryKa: "სიმაღლეზე მუშაობა", homicoType: "professional" },

  // Lift installation
  { categoryId: 400, slug: "ლიფტის-მონტაჟი", homicoCategory: "renovation", homicoSubcategory: "lift-installation", categoryKa: "რემონტი", subcategoryKa: "ლიფტის მონტაჟი", homicoType: "professional" },

  // Lathe work
  { categoryId: 95, slug: "გაჩარხვა-ტოკარი", homicoCategory: "renovation", homicoSubcategory: "lathe-work", categoryKa: "რემონტი", subcategoryKa: "გაჩარხვა/ტოკარი", homicoType: "professional" },

  // Landscaping / Gardening
  { categoryId: 30, slug: "ეზოს-მოწყობა", homicoCategory: "services", homicoSubcategory: "gardening", categoryKa: "სერვისები", subcategoryKa: "ბაღი/ეზო", homicoType: "service" },

  // ── DESIGN ──────────────────────────

  { categoryId: 208, slug: "ინტერიერის-დიზაინი", homicoCategory: "design", homicoSubcategory: "interior", categoryKa: "დიზაინი", subcategoryKa: "ინტერიერი", homicoType: "professional" },

  // ── ARCHITECTURE ──────────────────────────

  { categoryId: 31, slug: "არქიტექტორის-მომსახურება", homicoCategory: "architecture", homicoSubcategory: "residential-architecture", categoryKa: "არქიტექტურა", subcategoryKa: "საცხოვრებელი", homicoType: "professional" },

  // ── SERVICES ──────────────────────────

  // Cleaning
  { categoryId: 17, slug: "დამლაგებელი", homicoCategory: "services", homicoSubcategory: "cleaning", categoryKa: "სერვისები", subcategoryKa: "დალაგება", homicoType: "service" },
  { categoryId: 119, slug: "ავეჯის-ქიმწმენდა", homicoCategory: "services", homicoSubcategory: "cleaning", categoryKa: "სერვისები", subcategoryKa: "დალაგება", homicoType: "service" },
  { categoryId: 347, slug: "ტანსაცმლის-ქიმწმენდა", homicoCategory: "services", homicoSubcategory: "cleaning", categoryKa: "სერვისები", subcategoryKa: "დალაგება", homicoType: "service" },
  { categoryId: 350, slug: "თეთრეულის-და-ტანსაცმლის-სამრეცხაო", homicoCategory: "services", homicoSubcategory: "cleaning", categoryKa: "სერვისები", subcategoryKa: "დალაგება", homicoType: "service" },
  { categoryId: 411, slug: "ქიმწმენდა", homicoCategory: "services", homicoSubcategory: "cleaning", categoryKa: "სერვისები", subcategoryKa: "დალაგება", homicoType: "service" },
  { categoryId: 92, slug: "მანქანის-ქიმწმენდა", homicoCategory: "services", homicoSubcategory: "cleaning", categoryKa: "სერვისები", subcategoryKa: "დალაგება", homicoType: "service" },

  // Moving
  { categoryId: 26, slug: "ავეჯის-გადაზიდვა", homicoCategory: "services", homicoSubcategory: "moving", categoryKa: "სერვისები", subcategoryKa: "გადაზიდვა", homicoType: "service" },
  { categoryId: 19, slug: "სამშენებლო-ნარჩენების-გატანა", homicoCategory: "services", homicoSubcategory: "moving", categoryKa: "სერვისები", subcategoryKa: "გადაზიდვა", homicoType: "service" },

  // Labor hire
  { categoryId: 387, slug: "მუშების-დაქირავება", homicoCategory: "services", homicoSubcategory: "labor-hire", categoryKa: "სერვისები", subcategoryKa: "მუშების დაქირავება", homicoType: "service" },

  // Appliance repair
  { categoryId: 174, slug: "სარეცხი-მანქანის-ხელოსანი", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 112, slug: "მაცივრის-შეკეთება", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 201, slug: "გაზქურის-ხელოსანი", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 405, slug: "ტელევიზორის-ხელოსანი", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 194, slug: "წვრილი-საყოფაცხოვრებო-ტექნიკის-შეკეთება", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 46, slug: "კომპიუტერების-ტელეფონების-შეკეთება", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 191, slug: "სატელიტური-ანტენების-შეკეთებამონტაჟი", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },
  { categoryId: 197, slug: "ტელევიზორის-მონტაჟი", homicoCategory: "services", homicoSubcategory: "appliance-repair", categoryKa: "სერვისები", subcategoryKa: "ტექნიკის შეკეთება", homicoType: "professional" },

  // IT Support
  { categoryId: 388, slug: "ვინდოუსის-გადაყენება", homicoCategory: "services", homicoSubcategory: "it-support", categoryKa: "სერვისები", subcategoryKa: "IT მხარდაჭერა", homicoType: "professional" },

  // Pest control
  { categoryId: 346, slug: "დეზინფექცია", homicoCategory: "services", homicoSubcategory: "pest-control", categoryKa: "სერვისები", subcategoryKa: "დეზინსექცია", homicoType: "service" },

  // Security
  { categoryId: 320, slug: "დაცვის-სამსახურის-მომსახურება", homicoCategory: "services", homicoSubcategory: "security", categoryKa: "სერვისები", subcategoryKa: "დაცვა", homicoType: "service" },
  { categoryId: 321, slug: "კერძო-დაცვა", homicoCategory: "services", homicoSubcategory: "security", categoryKa: "სერვისები", subcategoryKa: "დაცვა", homicoType: "service" },

  // Smart home
  { categoryId: 399, slug: "ჭკვიანი-სახლი", homicoCategory: "services", homicoSubcategory: "smart-home", categoryKa: "სერვისები", subcategoryKa: "ჭკვიანი სახლი", homicoType: "professional" },

  // Locksmith
  { categoryId: 180, slug: "მანქანის-გასაღების-დამზადება", homicoCategory: "services", homicoSubcategory: "locksmith", categoryKa: "სერვისები", subcategoryKa: "გასაღებების დამზადება", homicoType: "service" },

  // ── TOOL RENTALS ──────────────────────────

  { categoryId: 16, slug: "ტრაქტორის-დაქირავება", homicoCategory: "rentals", homicoSubcategory: "heavy-equipment", categoryKa: "გაქირავება", subcategoryKa: "მძიმე ტექნიკა", homicoType: "tool-rental" },
  { categoryId: 22, slug: "ამწე-ლიფტი", homicoCategory: "rentals", homicoSubcategory: "crane-lift", categoryKa: "გაქირავება", subcategoryKa: "ამწე/კრანი", homicoType: "tool-rental" },
  { categoryId: 202, slug: "ამწე-კალათა", homicoCategory: "rentals", homicoSubcategory: "crane-lift", categoryKa: "გაქირავება", subcategoryKa: "ამწე/კრანი", homicoType: "tool-rental" },
  { categoryId: 406, slug: "ელექტრო-ამწე-კალათა", homicoCategory: "rentals", homicoSubcategory: "crane-lift", categoryKa: "გაქირავება", subcategoryKa: "ამწე/კრანი", homicoType: "tool-rental" },
  { categoryId: 408, slug: "ამწე-კრანი", homicoCategory: "rentals", homicoSubcategory: "crane-lift", categoryKa: "გაქირავება", subcategoryKa: "ამწე/კრანი", homicoType: "tool-rental" },
  { categoryId: 203, slug: "კომპრესორის-გაქირავება", homicoCategory: "rentals", homicoSubcategory: "compressor", categoryKa: "გაქირავება", subcategoryKa: "კომპრესორი", homicoType: "tool-rental" },
  { categoryId: 195, slug: "სატვირთოს-გაქირავება", homicoCategory: "rentals", homicoSubcategory: "equipment", categoryKa: "გაქირავება", subcategoryKa: "აღჭურვილობა", homicoType: "tool-rental" },
  { categoryId: 200, slug: "სამშენებლოსარემონტო-ინვენტარის-გაქირავება", homicoCategory: "rentals", homicoSubcategory: "equipment", categoryKa: "გაქირავება", subcategoryKa: "აღჭურვილობა", homicoType: "tool-rental" },
  { categoryId: 366, slug: "ტექნიკის-გაქირავება", homicoCategory: "rentals", homicoSubcategory: "equipment", categoryKa: "გაქირავება", subcategoryKa: "აღჭურვილობა", homicoType: "tool-rental" },
  { categoryId: 199, slug: "სამედიცინო-ინვენტარის-გაქირავება", homicoCategory: "rentals", homicoSubcategory: "equipment", categoryKa: "გაქირავება", subcategoryKa: "აღჭურვილობა", homicoType: "tool-rental" },
  { categoryId: 312, slug: "ბიო-ტულატების-გაქირავება", homicoCategory: "rentals", homicoSubcategory: "equipment", categoryKa: "გაქირავება", subcategoryKa: "აღჭურვილობა", homicoType: "tool-rental" },
];

// ============================================================
// Normalized output type
// ============================================================

interface NormalizedProvider {
  servisebiId: number;
  type: HomicoType;
  name: string;
  phone: string;
  city: string | null;
  cityKey: string | null;
  category: string;
  subcategory: string;
  categoryKa: string;
  subcategoryKa: string;
  originalCategory: string | null;
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

async function scrapePage(productId: number, allowUnclassified = false): Promise<Omit<NormalizedProvider, "phone"> & { phone: string | null } | null> {
  try {
    const { data } = await http.get(
      `https://servisebi.ge/ka/product/detail/${productId}/x`,
      { maxRedirects: 5 },
    );

    if (data.includes("<title>სერვისები | servisebi</title>") || !data.includes("product-card")) {
      return null;
    }

    const $ = cheerio.load(data);

    const clientLink = $('a[href^="/client/"]').first();
    const rawName = clientLink.length
      ? clientLink.clone().children().remove().end().text().trim() || clientLink.text().trim()
      : $("h6").first().text().trim();
    const name = rawName.replace(/\s+/g, " ").trim();
    if (!name) return null;

    const rawCity = $(".product-card-location").first().text().trim() || null;
    const cleanCity = rawCity ? rawCity.replace(/\s+/g, " ").trim().split(",")[0].trim() : null;
    const { city, cityKey } = normalizeCity(cleanCity);

    const rawCat = $(".product-card-tag").first().text().trim() || null;
    const originalCategory = rawCat ? rawCat.replace(/\s+/g, " ").trim() : null;

    const ratingText = $(".rating-counter").text().trim();
    const rm = ratingText.match(/([\d.]+)/);
    const rating = rm ? parseFloat(rm[1]) : 0;
    const rvm = ratingText.match(/\((\d+)\)/);
    const reviewCount = rvm ? parseInt(rvm[1], 10) : 0;

    const mapping = classify(originalCategory, name);
    if (!mapping && !allowUnclassified) return null;

    return {
      servisebiId: productId,
      type: mapping?.homicoType || "professional",
      name,
      phone: null,
      city,
      cityKey,
      category: mapping?.category || "unknown",
      subcategory: mapping?.subcategory || "unknown",
      categoryKa: mapping?.categoryKa || "",
      subcategoryKa: mapping?.subcategoryKa || "",
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
// Category page crawler
// ============================================================

interface CategoryCard {
  productId: number;
  name: string;
  city: string | null;
  cityKey: string | null;
  rating: number;
  reviewCount: number;
}

function scrapeCategoryPageCards(html: string): CategoryCard[] {
  const $ = cheerio.load(html);
  const cards: CategoryCard[] = [];
  const seen = new Set<number>();

  $(".product-card").each((_: number, card: any) => {
    // Get product ID from phone button or view link
    const phoneBtn = $(card).find("[data-product-id]").first();
    const viewLink = $(card).find("a[href*='/product/view/']").first();

    let productId = 0;
    if (phoneBtn.length) {
      productId = parseInt(phoneBtn.attr("data-product-id") || "0", 10);
    } else if (viewLink.length) {
      const m = (viewLink.attr("href") || "").match(/\/product\/view\/(\d+)/);
      if (m) productId = parseInt(m[1], 10);
    }
    if (!productId || seen.has(productId)) return;
    seen.add(productId);

    // Provider name from data attribute or client name element
    const name = phoneBtn.attr("data-product-client-name")
      || $(card).find(".product-card-client-name").first().text().trim()
      || "";
    if (!name) return;

    // City
    const rawCity = $(card).find(".product-card-location").first().text().trim() || null;
    const cleanCity = rawCity ? rawCity.replace(/\s+/g, " ").trim().split(",")[0].trim() : null;
    const { city, cityKey } = normalizeCity(cleanCity);

    // Rating
    const ratingText = $(card).find(".rating-counter").text().trim();
    const rm = ratingText.match(/([\d.]+)/);
    const rating = rm ? parseFloat(rm[1]) : 0;
    const rvm = ratingText.match(/\((\d+)\)/);
    const reviewCount = rvm ? parseInt(rvm[1], 10) : 0;

    cards.push({ productId, name, city, cityKey, rating, reviewCount });
  });

  return cards;
}

async function fetchCategoryPage(categoryId: number, slug: string): Promise<CategoryCard[]> {
  try {
    const url = `https://servisebi.ge/ka/product/${categoryId}/${slug}`;
    const { data } = await http.get(url, { maxRedirects: 5 });
    if (!data || typeof data !== "string") return [];
    return scrapeCategoryPageCards(data);
  } catch {
    return [];
  }
}

async function processProduct(
  productId: number,
  phoneMap: Map<string, NormalizedProvider>,
  seenIds: Set<number>,
  categoryOverride: CategoryPageEntry | null,
): Promise<{ found: boolean; skipped: boolean }> {
  if (seenIds.has(productId)) return { found: false, skipped: true };
  seenIds.add(productId);

  const listing = await scrapePage(productId, !!categoryOverride);
  if (!listing) return { found: false, skipped: true };

  const phone = await revealPhone(productId);
  if (!phone) return { found: false, skipped: true };

  const fullPhone = `+995${phone}`;

  // Apply category override from CATEGORY_PAGES if available (takes priority over keyword classify)
  let finalListing = listing;
  if (categoryOverride) {
    finalListing = {
      ...listing,
      type: categoryOverride.homicoType,
      category: categoryOverride.homicoCategory,
      subcategory: categoryOverride.homicoSubcategory,
      categoryKa: categoryOverride.categoryKa,
      subcategoryKa: categoryOverride.subcategoryKa,
    };
  }

  const isNew = !phoneMap.has(fullPhone);

  if (isNew) {
    phoneMap.set(fullPhone, { ...finalListing, phone: fullPhone } as NormalizedProvider);
  } else if (categoryOverride) {
    // Category page crawl: update existing provider's category to match the category page
    const existing = phoneMap.get(fullPhone)!;
    existing.type = categoryOverride.homicoType as any;
    existing.category = categoryOverride.homicoCategory;
    existing.subcategory = categoryOverride.homicoSubcategory;
    existing.categoryKa = categoryOverride.categoryKa;
    existing.subcategoryKa = categoryOverride.subcategoryKa;
  }

  const typeTag = finalListing.type.toUpperCase().padEnd(13);
  const marker = isNew ? "" : " (reclassified)";
  console.log(
    `[${productId}] ${typeTag} ${finalListing.name} | ${fullPhone} | ${finalListing.city || "?"} | ${finalListing.categoryKa}->${finalListing.subcategoryKa}${marker}`,
  );

  return { found: isNew, skipped: false };
}

async function crawlCategory(
  entry: CategoryPageEntry,
  phoneMap: Map<string, NormalizedProvider>,
  seenIds: Set<number>,
  stats: { total: number; skipped: number },
  outputDir: string,
): Promise<void> {
  console.log(`\n  -- Crawling category ${entry.categoryId}: ${entry.slug} (${entry.homicoCategory}/${entry.homicoSubcategory})`);

  const cards = await fetchCategoryPage(entry.categoryId, entry.slug);

  if (cards.length === 0) {
    console.log(`     No listings found, skipping`);
    return;
  }

  console.log(`     Found ${cards.length} listings`);
  let newCount = 0;
  let reclassCount = 0;

  for (const card of cards) {
    if (seenIds.has(card.productId)) {
      stats.skipped++;
      continue;
    }
    seenIds.add(card.productId);

    // Reveal phone
    const phone = await revealPhone(card.productId);
    if (!phone) {
      await sleep(delay);
      continue;
    }
    const fullPhone = `+995${phone}`;

    const provider: NormalizedProvider = {
      servisebiId: card.productId,
      type: entry.homicoType as any,
      name: card.name,
      phone: fullPhone,
      city: card.city,
      cityKey: card.cityKey,
      category: entry.homicoCategory,
      subcategory: entry.homicoSubcategory,
      categoryKa: entry.categoryKa,
      subcategoryKa: entry.subcategoryKa,
      originalCategory: entry.slug,
      rating: card.rating,
      reviewCount: card.reviewCount,
    };

    if (!phoneMap.has(fullPhone)) {
      phoneMap.set(fullPhone, provider);
      stats.total++;
      newCount++;
      console.log(`[${card.productId}] ${entry.homicoType.toUpperCase().padEnd(13)} ${card.name} | ${fullPhone} | ${card.city || "?"} | ${entry.categoryKa}->${entry.subcategoryKa}`);
    } else {
      // Reclassify existing provider to this category
      const existing = phoneMap.get(fullPhone)!;
      existing.type = entry.homicoType as any;
      existing.category = entry.homicoCategory;
      existing.subcategory = entry.homicoSubcategory;
      existing.categoryKa = entry.categoryKa;
      existing.subcategoryKa = entry.subcategoryKa;
      reclassCount++;
    }

    if (stats.total > 0 && stats.total % 50 === 0) {
      saveFiles(phoneMap, outputDir);
      console.log(`  -- Saved ${phoneMap.size} providers to disk`);
    }

    await sleep(delay);
  }

  if (newCount > 0 || reclassCount > 0) {
    console.log(`     → ${newCount} new, ${reclassCount} reclassified`);
  }
}

// ============================================================
// Output
// ============================================================

const TYPE_LABELS: Record<HomicoType, string> = {
  professional: "PROFESSIONALS",
  service: "SERVICES",
  "tool-rental": "TOOL RENTALS",
  shop: "SHOPS",
  other: "OTHER",
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

function loadExisting(outputDir: string): Map<string, NormalizedProvider> {
  const phoneMap = new Map<string, NormalizedProvider>();
  if (!fs.existsSync(outputDir)) return phoneMap;
  for (const file of fs.readdirSync(outputDir).filter((f) => f.endsWith(".json"))) {
    try {
      const existing: NormalizedProvider[] = JSON.parse(fs.readFileSync(resolve(outputDir, file), "utf-8"));
      for (const p of existing) {
        if (p.phone) phoneMap.set(p.phone, p);
      }
    } catch {}
  }
  return phoneMap;
}

async function main() {
  console.log(`\nScraping servisebi.ge  mode=${mode}  delay=${delay}ms\n`);

  const outputDir = resolve(__dirname, "../scrape-output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Load existing data to resume / avoid duplicates
  const phoneMap = loadExisting(outputDir);
  if (phoneMap.size > 0) {
    console.log(`  Loaded ${phoneMap.size} existing providers (will skip duplicates)\n`);
  }

  // Track already-processed product IDs to avoid re-scraping within this run
  const seenIds = new Set<number>();

  // Pre-populate seenIds from existing data
  for (const p of phoneMap.values()) {
    seenIds.add(p.servisebiId);
  }

  const stats = { total: 0, skipped: 0 };

  // ── Phase 1: Category-based crawling ──
  if (mode === "categories" || mode === "all") {
    console.log(`=== PHASE 1: Crawling ${CATEGORY_PAGES.length} category pages ===\n`);

    for (const entry of CATEGORY_PAGES) {
      await crawlCategory(entry, phoneMap, seenIds, stats, outputDir);
    }

    // Save after all categories
    saveFiles(phoneMap, outputDir);
    console.log(`\n  Category crawl complete. Total: ${stats.total} | Unique phones: ${phoneMap.size}\n`);
  }

  // ── Phase 2: ID-based iteration (legacy) ──
  if (mode === "ids" || mode === "all") {
    console.log(`=== PHASE 2: Iterating IDs ${startId} -> ${endId} ===\n`);

    for (let id = startId; id <= endId; id++) {
      if (seenIds.has(id)) {
        if ((id - startId) % 500 === 0 && id > startId) {
          console.log(`  ... ${id}/${endId} | found: ${stats.total} | unique: ${phoneMap.size} | skipped: ${stats.skipped}`);
        }
        await sleep(80);
        continue;
      }

      const result = await processProduct(id, phoneMap, seenIds, null);
      if (result.found) {
        stats.total++;
      } else {
        stats.skipped++;
      }

      if ((id - startId) % 500 === 0 && id > startId) {
        console.log(`  ... ${id}/${endId} | found: ${stats.total} | unique: ${phoneMap.size} | skipped: ${stats.skipped}`);
      }

      // Save every 50 new finds
      if (stats.total > 0 && stats.total % 50 === 0) {
        saveFiles(phoneMap, outputDir);
        console.log(`  -- Saved ${phoneMap.size} providers to disk`);
      }

      await sleep(result.found ? delay : 80);
    }
  }

  // Final save
  const { providers, byType } = saveFiles(phoneMap, outputDir);

  // Summary
  const counts: Record<string, number> = {};
  providers.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });

  console.log(`\nDONE\n`);
  console.log(`  Total found:     ${stats.total}`);
  console.log(`  Unique phones:   ${providers.length}`);
  console.log(`  Skipped:         ${stats.skipped}`);
  console.log(`  ─────────────────────────`);
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    console.log(`  ${label}: ${counts[type] || 0}`);
  }
  console.log(`\n  Files saved to: ${outputDir}/`);
  for (const [type, items] of byType) {
    const fname = type === "tool-rental" ? "tool-rentals" : `${type}s`;
    console.log(`  -> ${fname}.json (${items.length})`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
