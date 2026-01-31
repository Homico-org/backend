import * as dotenv from "dotenv";
import * as mongoose from "mongoose";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const env = args[0] || "prod";
const phone = args[1] || "+995571072007";

const dbUri =
  env === "prod"
    ? process.env.MONGODB_URI?.replace("/homi?", "/homi_prod?") || ""
    : process.env.MONGODB_URI?.replace("/homi?", "/homi_dev?") || "";

async function main() {
  const connection = await mongoose.createConnection(dbUri).asPromise();
  const User = connection.model(
    "User",
    new mongoose.Schema({}, { strict: false }),
  );

  const user = await User.findOne({ phone }).exec();

  await connection.close();
  process.exit(0);
}

main();
