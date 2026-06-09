/**
 * Send a SINGLE test marketing SMS via UBill. For previewing copy on a real
 * handset before any batch. Marketing => stopList: true (respects UBill's
 * opt-out registry, unlike OTP which uses stopList: false).
 *
 *   node scripts/send-test-sms.js [number]
 *   number defaults to 571072007; +995 is added automatically.
 */
const dotenv = require("dotenv");
const { resolve } = require("path");
dotenv.config({ path: resolve(__dirname, "../.env") });

const UBILL_API_KEY = process.env.UBILL_API_KEY || "";
const UBILL_BRAND_ID = parseInt(process.env.UBILL_BRAND_ID || "0", 10);

// Normalize to UBill's expected integer form: 995XXXXXXXXX (no +, no spaces).
function toUbillNumber(raw) {
  const digits = String(raw).replace(/\D/g, "");
  const local9 = digits.slice(-9); // Georgian mobile is 9 digits
  return parseInt(`995${local9}`, 10);
}

const number = toUbillNumber(process.argv[2] || "571072007");

const text =
  "Homico-ზე დაამატეთ თქვენი სერვისები და ფასები - დამკვეთები გეძებენ. რეგისტრაცია უფასოა: www.homico.ge";

async function main() {
  if (!UBILL_API_KEY || !UBILL_BRAND_ID) {
    throw new Error("UBILL_API_KEY / UBILL_BRAND_ID missing in backend/.env");
  }
  console.log(`Sending test SMS to ${number} (${text.length} chars)...`);
  const res = await fetch("https://api.ubill.dev/v1/sms/send", {
    method: "POST",
    headers: { key: UBILL_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      brandID: UBILL_BRAND_ID,
      numbers: [number],
      text,
      stopList: true,
    }),
  });
  const body = await res.text();
  console.log(`HTTP ${res.status}`);
  console.log(body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
