import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const dbUri = process.env.MONGODB_URI?.replace("/homi?", "/homi_dev?") || "";

async function main() {
  const connection = await mongoose.createConnection(dbUri).asPromise();

  await connection.close();
  process.exit(0);
}

main();
