/**
 * Migrate portfolio projects from User documents to PortfolioItem collection
 *
 * Usage:
 *   npx ts-node scripts/migrate-portfolio-projects.ts dev
 *   npx ts-node scripts/migrate-portfolio-projects.ts prod
 */

import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

// Load environment variables
dotenv.config({ path: resolve(__dirname, "../.env") });

// Check for command line argument for database
const args = process.argv.slice(2);
const targetEnv = args[0] || "dev";

// Database URIs
const DB_URIS: Record<string, string> = {
  prod: process.env.MONGODB_URI?.replace("/homi?", "/homi_prod?") || "",
  dev: process.env.MONGODB_URI?.replace("/homi?", "/homi_dev?") || "",
};

// Portfolio item schema
const portfolioItemSchema = new mongoose.Schema(
  {
    proId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String },
    imageUrl: { type: String, required: true },
    images: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    projectDate: { type: Date },
    completedDate: { type: Date },
    location: { type: String },
    displayOrder: { type: Number, default: 0 },
    projectType: {
      type: String,
      enum: ["quick", "project", "job"],
      default: "project",
    },
    status: {
      type: String,
      enum: ["completed", "in_progress"],
      default: "completed",
    },
    source: { type: String, enum: ["external", "homico"], default: "external" },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
  },
  { timestamps: true },
);

// User schema (minimal for this migration)
const userSchema = new mongoose.Schema({
  role: { type: String },
  portfolioProjects: { type: Array, default: [] },
});

async function migratePortfolioProjects(dbUri: string, envName: string) {
  const connection = await mongoose.createConnection(dbUri).asPromise();
  const User = connection.model("User", userSchema);
  const PortfolioItem = connection.model("PortfolioItem", portfolioItemSchema);

  // Find all pros with portfolioProjects
  const prosWithPortfolio = await User.find({
    role: "pro",
    portfolioProjects: { $exists: true, $ne: [] },
  }).exec();

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const pro of prosWithPortfolio) {
    try {
      const existingItems = await PortfolioItem.countDocuments({
        proId: pro._id,
      });

      if (existingItems > 0) {
        skipped++;
        continue;
      }

      const portfolioItems = pro.portfolioProjects.map(
        (project: any, index: number) => ({
          proId: pro._id,
          title: project.title || `Project ${index + 1}`,
          description: project.description || "",
          imageUrl: project.images?.[0] || "",
          images: project.images || [],
          source: "external",
          status: "completed",
          projectType: "project",
          displayOrder: index,
        }),
      );

      if (portfolioItems.length > 0) {
        await PortfolioItem.insertMany(portfolioItems);
        migrated++;
      }
    } catch (error: any) {
      failed++;
    }
  }

  await connection.close();
  return { migrated, skipped, failed };
}

async function main() {
  const dbUri = DB_URIS[targetEnv];

  if (!dbUri) {
    process.exit(1);
  }

  try {
    await migratePortfolioProjects(dbUri, targetEnv);
  } catch (error) {
    process.exit(1);
  }

  process.exit(0);
}

main();
