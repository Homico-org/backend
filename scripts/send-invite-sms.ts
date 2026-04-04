/**
 * Send invite SMS to pending invites via UBill
 *
 * Usage:
 *   npx ts-node scripts/send-invite-sms.ts [prod|dev] [--batch=100] [--delay=500] [--dry-run]
 *
 * Options:
 *   --batch=N    Send N messages per run (default: 100)
 *   --delay=N    Delay between sends in ms (default: 500)
 *   --dry-run    Preview messages without sending
 *
 * Requires UBILL_API_KEY and UBILL_BRAND_ID in .env
 */

import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const targetEnv =
  args.find((a) => a === "prod" || a === "dev") || "prod";
const getArg = (name: string, def: number) => {
  const found = args.find((a) => a.startsWith(`--${name}=`));
  return found ? parseInt(found.split("=")[1], 10) : def;
};
const batchSize = getArg("batch", 100);
const delayMs = getArg("delay", 500);
const dryRun = args.includes("--dry-run");
const phoneFilter = args.find((a) => a.startsWith("--phone="))?.split("=")[1] || "";

const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI?.replace("/homi?", "/homi_prod?") || "",
  dev: process.env.MONGODB_URI?.replace("/homi?", "/homi_dev?") || "",
};
const MONGODB_URI = DB_URIS[targetEnv] || DB_URIS.prod;

const UBILL_API_KEY = process.env.UBILL_API_KEY || "";
const UBILL_BRAND_ID = parseInt(process.env.UBILL_BRAND_ID || "0", 10);
const UBILL_BASE_URL = "https://api.ubill.dev/v1";

const INVITE_BASE_URL =
  process.env.FRONTEND_URL || "https://homico.ge";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI");
  process.exit(1);
}

if (!dryRun && (!UBILL_API_KEY || !UBILL_BRAND_ID)) {
  console.error(
    "Missing UBILL_API_KEY or UBILL_BRAND_ID in .env (use --dry-run to preview)",
  );
  process.exit(1);
}

const inviteTokenSchema = new mongoose.Schema(
  {
    token: String,
    phone: String,
    name: String,
    city: String,
    categoryKa: String,
    subcategoryKa: String,
    status: String,
    smsSentAt: Date,
  },
  { timestamps: true, strict: false },
);

const InviteToken = mongoose.model("InviteToken", inviteTokenSchema);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatPhoneForUbill(phone: string): string {
  return phone.replace(/^\+995/, "").replace(/\D/g, "");
}

// Category-specific SMS templates (Georgian)
// Each template is tailored to the subcategory to feel personal, not generic spam
const SMS_TEMPLATES: Record<string, (name: string, url: string) => string> = {
  // Renovation
  plumbing: (name, url) =>
    `${name}, Homico-ზე კლიენტები სანტექნიკს ეძებენ. თქვენი პროფილი მზადაა — გააქტიურეთ და მიიღეთ შეკვეთები: ${url}`,
  electrical: (name, url) =>
    `${name}, Homico-ზე ელექტრიკოსის მოთხოვნა მაღალია. გააქტიურეთ პროფილი და დაიწყეთ შეკვეთების მიღება: ${url}`,
  painting: (name, url) =>
    `${name}, კლიენტები Homico-ზე მხატვარ-მალიარს ეძებენ. თქვენი პროფილი მზადაა: ${url}`,
  tiling: (name, url) =>
    `${name}, კლიენტები Homico-ზე კაფელ-მეტლახის ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,
  flooring: (name, url) =>
    `${name}, Homico-ზე იატაკის ოსტატს ეძებენ. თქვენი პროფილი მზადაა: ${url}`,
  plastering: (name, url) =>
    `${name}, Homico-ზე სათიხი/საშრავი სამუშაოების ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,
  welding: (name, url) =>
    `${name}, Homico-ზე შემდუღებლის მოთხოვნა მაღალია. გააქტიურეთ პროფილი: ${url}`,
  carpentry: (name, url) =>
    `${name}, Homico-ზე დურგალს ეძებენ. გააქტიურეთ პროფილი და მიიღეთ შეკვეთები: ${url}`,
  demolition: (name, url) =>
    `${name}, კლიენტები Homico-ზე დემონტაჟის სპეციალისტს ეძებენ. გააქტიურეთ: ${url}`,
  insulation: (name, url) =>
    `${name}, Homico-ზე იზოლაციის ოსტატს ეძებენ. თქვენი პროფილი მზადაა: ${url}`,
  drywall: (name, url) =>
    `${name}, Homico-ზე თაბაშირ-მუყაოს ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,
  roofing: (name, url) =>
    `${name}, Homico-ზე სახურავის ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,
  facade: (name, url) =>
    `${name}, Homico-ზე ფასადის სპეციალისტს ეძებენ. თქვენი პროფილი მზადაა: ${url}`,
  general_renovation: (name, url) =>
    `${name}, Homico-ზე სარემონტო ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Cleaning
  apartment_cleaning: (name, url) =>
    `${name}, Homico-ზე ბინის დალაგების მოთხოვნა მაღალია. გააქტიურეთ პროფილი: ${url}`,
  deep_cleaning: (name, url) =>
    `${name}, Homico-ზე გენერალური დალაგების სპეციალისტს ეძებენ. გააქტიურეთ: ${url}`,
  office_cleaning: (name, url) =>
    `${name}, კლიენტები Homico-ზე ოფისის დალაგებას ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Moving
  moving: (name, url) =>
    `${name}, Homico-ზე ტვირთის გადაზიდვის მოთხოვნა მაღალია. გააქტიურეთ პროფილი: ${url}`,
  furniture_moving: (name, url) =>
    `${name}, Homico-ზე ავეჯის გადატანის სპეციალისტს ეძებენ. გააქტიურეთ: ${url}`,

  // HVAC
  ac_installation: (name, url) =>
    `${name}, Homico-ზე კონდიციონერის ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,
  heating: (name, url) =>
    `${name}, Homico-ზე გათბობის სისტემის ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Appliance
  appliance_repair: (name, url) =>
    `${name}, Homico-ზე ტექნიკის შემკეთებელს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Design
  interior_design: (name, url) =>
    `${name}, Homico-ზე ინტერიერის დიზაინერს ეძებენ. გააქტიურეთ პროფილი: ${url}`,
  architecture: (name, url) =>
    `${name}, Homico-ზე არქიტექტორს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Pest control
  pest_control: (name, url) =>
    `${name}, Homico-ზე დეზინსექციის სპეციალისტს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Locksmith
  locksmith: (name, url) =>
    `${name}, Homico-ზე საკეტების ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Glass
  glass_work: (name, url) =>
    `${name}, Homico-ზე მინის ოსტატს ეძებენ. გააქტიურეთ პროფილი: ${url}`,

  // Tool rental
  tool_rental: (name, url) =>
    `${name}, Homico-ზე ინსტრუმენტის გაქირავებას ეძებენ. გააქტიურეთ პროფილი: ${url}`,
};

// Default fallback template
function buildSmsMessage(invite: any, inviteUrl: string): string {
  const name = invite.name?.split(" ")[0] || ""; // First name only
  const subcategory = invite.subcategory || "";
  const template = SMS_TEMPLATES[subcategory];

  if (template) {
    return template(name, inviteUrl);
  }

  // Fallback: uses Georgian subcategory name
  return `${name}, Homico-ზე ${invite.subcategoryKa || invite.categoryKa || "სპეციალისტს"} ეძებენ. გააქტიურეთ პროფილი და მიიღეთ შეკვეთები: ${inviteUrl}`;
}

async function sendSms(phone: string, text: string): Promise<boolean> {
  const ubillNumber = formatPhoneForUbill(phone);

  const response = await fetch(`${UBILL_BASE_URL}/sms/send`, {
    method: "POST",
    headers: {
      key: UBILL_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      brandID: UBILL_BRAND_ID,
      numbers: [ubillNumber],
      text,
      stopList: false,
    }),
  });

  return response.ok;
}

async function main() {
  console.log(`\n📱 Sending invite SMS (${targetEnv})${dryRun ? " [DRY RUN]" : ""}`);
  console.log(`   Batch: ${batchSize} | Delay: ${delayMs}ms\n`);

  await mongoose.connect(MONGODB_URI);

  const query: any = { status: "pending", smsSentAt: null };
  if (phoneFilter) {
    query.phone = phoneFilter.startsWith("+") ? phoneFilter : `+${phoneFilter}`;
  }

  const invites = await InviteToken.find(query)
    .limit(batchSize)
    .exec();

  console.log(`  Found ${invites.length} pending invites to send\n`);

  let sent = 0;
  let failed = 0;

  for (const invite of invites) {
    const inviteUrl = `${INVITE_BASE_URL}/invite/${invite.token}`;
    const message = buildSmsMessage(invite, inviteUrl);

    if (dryRun) {
      console.log(`  [DRY] ${invite.phone} → ${message.substring(0, 80)}...`);
      sent++;
      continue;
    }

    try {
      const ok = await sendSms(invite.phone!, message);
      if (ok) {
        await InviteToken.updateOne(
          { _id: invite._id },
          { status: "sms_sent", smsSentAt: new Date() },
        );
        sent++;
        console.log(`  ✅ ${invite.phone} → sent`);
      } else {
        await InviteToken.updateOne(
          { _id: invite._id },
          { smsFailedAt: new Date(), smsError: "send failed" },
        );
        failed++;
        console.log(`  ❌ ${invite.phone} → failed`);
      }
    } catch (err: any) {
      await InviteToken.updateOne(
        { _id: invite._id },
        { smsFailedAt: new Date(), smsError: err.message },
      );
      failed++;
      console.log(`  ❌ ${invite.phone} → ${err.message}`);
    }

    await sleep(delayMs);
  }

  console.log(`\n--- Done ---`);
  console.log(`  Sent: ${sent}`);
  console.log(`  Failed: ${failed}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
