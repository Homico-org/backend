/**
 * Create OR promote a user to the admin role. Idempotent and safe to re-run.
 *
 * Credentials are NEVER hardcoded in this file - they come from env vars at
 * invocation time. Nothing sensitive enters git.
 *
 * REQUIRED env vars:
 *   MAKE_ADMIN_EMAIL     admin email (used as the login identifier)
 *   MAKE_ADMIN_PASSWORD  admin password (bcrypt-hashed at write time)
 *   MAKE_ADMIN_PHONE     admin phone in E.164 format (e.g. +995599000099)
 *   MAKE_ADMIN_NAME      display name
 *
 * OPTIONAL env vars:
 *   MAKE_ADMIN_CITY      defaults to "tbilisi"
 *   MAKE_ADMIN_DRY_RUN   set to "1" to print actions without writing
 *
 * INHERITED from .env (or shell):
 *   MONGODB_URI          full Mongo connection string of the target environment
 *
 * Usage examples
 * --------------
 * Local laptop against PROD (one-off):
 *   MONGODB_URI='mongodb+srv://.../homi_prod?...' \
 *   MAKE_ADMIN_EMAIL=you@homico.ge \
 *   MAKE_ADMIN_PASSWORD='strong-passphrase-here' \
 *   MAKE_ADMIN_PHONE=+995599000099 \
 *   MAKE_ADMIN_NAME='Your Name' \
 *   npx ts-node scripts/make-admin.ts
 *
 * On Render shell (MONGODB_URI already in env):
 *   MAKE_ADMIN_EMAIL=you@homico.ge \
 *   MAKE_ADMIN_PASSWORD='strong-passphrase' \
 *   MAKE_ADMIN_PHONE=+995599000099 \
 *   MAKE_ADMIN_NAME='Your Name' \
 *   npx ts-node scripts/make-admin.ts
 *
 * Dry run first (recommended):
 *   MAKE_ADMIN_DRY_RUN=1 ...same as above... npx ts-node scripts/make-admin.ts
 *
 * Behavior
 * --------
 * - If a user with this email exists: promote them to role=admin and (if a
 *   new password was passed) overwrite the password. Same goes for name/phone
 *   if those differ.
 * - If no email match but a different user has the same phone: ABORT. The
 *   phone uniqueness index would block the write anyway, and matching by
 *   phone could mistakenly merge two real people.
 * - If neither email nor phone is taken: create a fresh admin with a new UID.
 */

import * as bcrypt from "bcrypt";
import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

// ---- Strongly-typed env reader -------------------------------------------

interface AdminEnv {
  email: string;
  password: string;
  phone: string;
  name: string;
  city: string;
  dryRun: boolean;
  mongoUri: string;
}

function readEnv(): AdminEnv {
  const missing: string[] = [];
  const required = (key: string): string => {
    const v = process.env[key]?.trim();
    if (!v) missing.push(key);
    return v ?? "";
  };

  const email = required("MAKE_ADMIN_EMAIL").toLowerCase();
  const password = required("MAKE_ADMIN_PASSWORD");
  const phone = required("MAKE_ADMIN_PHONE");
  const name = required("MAKE_ADMIN_NAME");
  const mongoUri = required("MONGODB_URI");

  if (missing.length > 0) {
    console.error(
      `\nMissing required env vars: ${missing.join(", ")}\n` +
        `See the file header for usage examples.\n`,
    );
    process.exit(1);
  }

  // Light validation - catches obvious typos before we hit Mongo.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`MAKE_ADMIN_EMAIL is not a valid email: "${email}"`);
    process.exit(1);
  }
  if (!/^\+?\d{8,15}$/.test(phone.replace(/[\s-]/g, ""))) {
    console.error(
      `MAKE_ADMIN_PHONE should be in E.164 format like +995599000099. Got: "${phone}"`,
    );
    process.exit(1);
  }
  if (password.length < 10) {
    console.error(
      `MAKE_ADMIN_PASSWORD is too short (${password.length} chars). Use at least 10.`,
    );
    process.exit(1);
  }

  return {
    email,
    password,
    phone: phone.replace(/[\s-]/g, ""),
    name,
    city: process.env.MAKE_ADMIN_CITY?.trim() || "tbilisi",
    dryRun: process.env.MAKE_ADMIN_DRY_RUN === "1",
    mongoUri,
  };
}

// ---- Minimal User shape matching the live schema --------------------------
//
// We model only the fields we read or write. Everything else stays as the
// schema defaults the application sets on first save.

interface UserShape {
  _id: mongoose.Types.ObjectId;
  uid?: number;
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: "client" | "pro" | "company" | "admin";
  city?: string;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isProfileCompleted?: boolean;
  verificationStatus?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new mongoose.Schema<UserShape>(
  {
    uid: { type: Number, index: true },
    name: { type: String },
    email: { type: String, lowercase: true },
    phone: { type: String },
    password: { type: String },
    role: {
      type: String,
      enum: ["client", "pro", "company", "admin"],
      default: "client",
    },
    city: { type: String },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    isProfileCompleted: { type: Boolean, default: false },
    verificationStatus: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, strict: false }, // strict:false so we don't strip schema fields the app cares about
);

// ---- Main -----------------------------------------------------------------

async function nextUid(model: mongoose.Model<UserShape>): Promise<number> {
  const last = await model
    .findOne({ uid: { $exists: true } })
    .sort({ uid: -1 })
    .exec();
  return last?.uid ? last.uid + 1 : 100001;
}

async function main(): Promise<void> {
  const env = readEnv();
  const safeUri = env.mongoUri.replace(/\/\/[^@]+@/, "//***:***@");
  console.log(`\nConnecting to: ${safeUri}`);

  const connection = await mongoose.createConnection(env.mongoUri).asPromise();
  const User = connection.model<UserShape>("User", userSchema);

  try {
    const byEmail = await User.findOne({ email: env.email }).exec();
    const byPhone = await User.findOne({ phone: env.phone }).exec();

    // Conflict: different user already owns this phone. Refuse rather than
    // mutate someone else's account.
    if (byPhone && (!byEmail || String(byPhone._id) !== String(byEmail._id))) {
      console.error(
        `\nABORT: phone ${env.phone} is already owned by a different user ` +
          `(uid=${byPhone.uid ?? "?"}, email=${byPhone.email ?? "?"}, ` +
          `name=${byPhone.name ?? "?"}). Use a different phone or update that ` +
          `account by its email instead.\n`,
      );
      process.exit(2);
    }

    const passwordHash = await bcrypt.hash(env.password, 10);

    if (byEmail) {
      const updates: Partial<UserShape> = {
        role: "admin",
        password: passwordHash,
        name: env.name,
        phone: env.phone,
        city: env.city,
        isEmailVerified: true,
        isPhoneVerified: true,
        isActive: true,
        verificationStatus: "verified",
      };
      console.log(
        `\nFound existing user uid=${byEmail.uid ?? "?"} (${byEmail.email}). ` +
          `Will promote to admin and refresh password/name/phone.`,
      );
      if (env.dryRun) {
        console.log("DRY RUN - no changes written.\n");
      } else {
        await User.updateOne({ _id: byEmail._id }, { $set: updates }).exec();
        console.log(`Updated user ${byEmail._id} -> role=admin.\n`);
      }
    } else {
      const uid = await nextUid(User);
      const doc: Partial<UserShape> = {
        uid,
        name: env.name,
        email: env.email,
        phone: env.phone,
        password: passwordHash,
        role: "admin",
        city: env.city,
        isEmailVerified: true,
        isPhoneVerified: true,
        isProfileCompleted: true,
        isActive: true,
        verificationStatus: "verified",
      };
      console.log(
        `\nNo existing user. Will create new admin uid=${uid} email=${env.email}.`,
      );
      if (env.dryRun) {
        console.log("DRY RUN - no changes written.\n");
      } else {
        const saved = await User.create(doc);
        console.log(`Created admin ${saved._id} uid=${uid}.\n`);
      }
    }
  } finally {
    await connection.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
