import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const dbUri = process.env.MONGODB_URI?.replace('/homi?', '/homi_dev?') || '';

async function main() {
  const connection = await mongoose.createConnection(dbUri).asPromise();
  const User = connection.model('User', new mongoose.Schema({}, { strict: false }));

  // Find the most recently created pro users
  const users = await User.find({ role: 'pro' }).sort({ createdAt: -1 }).limit(5).exec();

  console.log('Recent pro users:');
  for (const user of users) {
    console.log(`- ${(user as any).name} (${(user as any).email}) - role: ${(user as any).role}`);
  }

  // Check the specific user
  const userId = '694d246b41d3c74aa70c84c2';
  const specificUser = await User.findById(userId).exec();
  if (specificUser) {
    console.log('\nSpecific user:', (specificUser as any).name);
    console.log('Role:', (specificUser as any).role);
  }

  await connection.close();
  process.exit(0);
}

main();
