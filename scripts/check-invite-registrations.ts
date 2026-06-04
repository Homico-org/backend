import * as dotenv from "dotenv";
import * as fs from "fs";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

// READ-ONLY. Cross-references invitetokens.phone against users.phone to find
// which of the seeded "potential users" (invites) have actually registered -
// matched by phone, so it also catches people who signed up independently
// (invite still "pending"/"opened"), which invite.status / userId alone miss.
//
// Usage:
//   ts-node -r tsconfig-paths/register scripts/check-invite-registrations.ts [prod|dev]
// Defaults to prod. Writes a CSV of the matched (registered) invites.

const env = (process.argv[2] || "prod").toLowerCase();
const targetDb = env === "dev" ? "homi_dev" : "homi_prod";

// Force the db name in the URI to the target, regardless of what .env carries
// (the .env URI points at homi_dev). Replaces the /<db>? path segment.
const baseUri = process.env.MONGODB_URI || "";
const dbUri = baseUri.replace(/\/[^/?]+(\?|$)/, `/${targetDb}$1`);

// Georgian mobile numbers are 9 digits (5XXXXXXXX). Normalize any stored
// format (+995 555 12 34 56, 995555123456, 0555123456, etc.) down to the
// last 9 digits so prefix differences don't cause false negatives.
function normalize(phone: unknown): string | null {
  if (!phone || typeof phone !== "string") return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

async function main() {
  if (!dbUri) throw new Error("MONGODB_URI is empty - check backend/.env");
  console.log(`Connecting to ${targetDb} ...`);
  const conn = await mongoose.createConnection(dbUri).asPromise();

  const invitesCol = conn.collection("invitetokens");
  const usersCol = conn.collection("users");

  // 1. All registered user phones -> Set of normalized last-9 digits
  const users = await usersCol
    .find({ phone: { $exists: true, $ne: null } }, { projection: { phone: 1 } })
    .toArray();
  const registered = new Set<string>();
  for (const u of users) {
    const n = normalize((u as any).phone);
    if (n) registered.add(n);
  }

  // 2. All invites
  const invites = await invitesCol
    .find(
      {},
      {
        projection: {
          phone: 1,
          name: 1,
          status: 1,
          category: 1,
          city: 1,
          userId: 1,
        },
      },
    )
    .toArray();

  // 3. Cross-reference
  const matched: any[] = [];
  let unparseable = 0;
  const byStatus: Record<string, { total: number; registered: number }> = {};

  for (const inv of invites) {
    const status = (inv as any).status || "unknown";
    byStatus[status] ??= { total: 0, registered: 0 };
    byStatus[status].total++;

    const n = normalize((inv as any).phone);
    if (!n) {
      unparseable++;
      continue;
    }
    if (registered.has(n)) {
      byStatus[status].registered++;
      matched.push({
        name: (inv as any).name ?? "",
        phone: (inv as any).phone ?? "",
        status,
        category: (inv as any).category ?? "",
        city: (inv as any).city ?? "",
        linkedViaInvite: !!(inv as any).userId, // userId set = registered THROUGH the invite flow
      });
    }
  }

  // 4. Report
  const totalInvites = invites.length;
  const totalRegistered = matched.length;
  console.log("\n========================================");
  console.log(`Total registered users in DB:        ${users.length}`);
  console.log(`Total invites (potential users):     ${totalInvites}`);
  console.log(`Invites with a REGISTERED phone:     ${totalRegistered}`);
  console.log(
    `  - of those, registered VIA invite: ${matched.filter((m) => m.linkedViaInvite).length}`,
  );
  console.log(
    `  - registered INDEPENDENTLY:        ${matched.filter((m) => !m.linkedViaInvite).length}`,
  );
  console.log(`Invites with unparseable phone:      ${unparseable}`);
  console.log("\nBreakdown by invite status (registered / total):");
  for (const [status, s] of Object.entries(byStatus).sort()) {
    console.log(`  ${status.padEnd(12)} ${s.registered} / ${s.total}`);
  }
  console.log("========================================\n");

  // 5. CSV of the matched ones
  const outPath = resolve(__dirname, `invite-registrations-${targetDb}.csv`);
  const header = "name,phone,invite_status,category,city,registered_via_invite";
  const rows = matched.map(
    (m) =>
      [
        `"${String(m.name).replace(/"/g, '""')}"`,
        `"${m.phone}"`,
        m.status,
        `"${String(m.category).replace(/"/g, '""')}"`,
        `"${String(m.city).replace(/"/g, '""')}"`,
        m.linkedViaInvite ? "yes" : "no",
      ].join(","),
  );
  fs.writeFileSync(outPath, [header, ...rows].join("\n"), "utf8");
  console.log(`Wrote ${matched.length} matched rows -> ${outPath}`);

  await conn.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
