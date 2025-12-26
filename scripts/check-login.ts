import * as mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const env = args[0] || 'prod';
const phone = args[1] || '+995571072007';

const dbUri = env === 'prod'
  ? process.env.MONGODB_URI?.replace('/homi?', '/homi_prod?') || ''
  : process.env.MONGODB_URI?.replace('/homi?', '/homi_dev?') || '';

async function main() {
  console.log(`Checking ${env} database for phone: ${phone}`);

  const connection = await mongoose.createConnection(dbUri).asPromise();
  const User = connection.model('User', new mongoose.Schema({}, { strict: false }));

  // Find user by exact phone
  const userExact = await User.findOne({ phone }).exec();
  console.log('\nExact match:', userExact ? 'FOUND' : 'NOT FOUND');

  if (userExact) {
    console.log('User:', (userExact as any).name);
    console.log('Phone in DB:', (userExact as any).phone);
    console.log('Has password:', !!(userExact as any).password);
    console.log('Role:', (userExact as any).role);

    // Test password
    const testPassword = 'javaxaa1';
    if ((userExact as any).password) {
      const isValid = await bcrypt.compare(testPassword, (userExact as any).password);
      console.log(`Password '${testPassword}' valid:`, isValid);
    }
  }

  // Find all users with similar phone
  const normalizedPhone = phone.replace(/[\s\-]/g, '');
  console.log('\nSearching for phones containing:', normalizedPhone.slice(-9));

  const allUsers = await User.find({
    phone: { $exists: true, $ne: null }
  }).select('name phone password role').exec();

  const matches = allUsers.filter((u: any) => {
    if (!u.phone) return false;
    const stored = u.phone.replace(/[\s\-]/g, '');
    return stored.includes(normalizedPhone.slice(-9)) || normalizedPhone.includes(stored.slice(-9));
  });

  console.log(`Found ${matches.length} similar phones:`);
  for (const u of matches) {
    console.log(`  - ${(u as any).name}: ${(u as any).phone} (has password: ${!!(u as any).password})`);
  }

  await connection.close();
  process.exit(0);
}

main();
