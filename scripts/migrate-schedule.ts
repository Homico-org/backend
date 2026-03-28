/**
 * Migration: Set default weekly schedule for all pro users who don't have one.
 * Default: Mon-Fri 09:00-18:00, Sat-Sun unavailable.
 *
 * Run: npx ts-node scripts/migrate-schedule.ts
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/homi';

const DEFAULT_SCHEDULE = [
  { dayOfWeek: 0, isAvailable: true, startHour: 9, endHour: 18 },  // Mon
  { dayOfWeek: 1, isAvailable: true, startHour: 9, endHour: 18 },  // Tue
  { dayOfWeek: 2, isAvailable: true, startHour: 9, endHour: 18 },  // Wed
  { dayOfWeek: 3, isAvailable: true, startHour: 9, endHour: 18 },  // Thu
  { dayOfWeek: 4, isAvailable: true, startHour: 9, endHour: 18 },  // Fri
  { dayOfWeek: 5, isAvailable: false, startHour: 9, endHour: 18 }, // Sat
  { dayOfWeek: 6, isAvailable: false, startHour: 9, endHour: 18 }, // Sun
];

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database connection');
    process.exit(1);
  }

  const usersCollection = db.collection('users');

  // Find all pro users with empty or missing weeklySchedule
  const filter = {
    role: 'pro',
    $or: [
      { weeklySchedule: { $exists: false } },
      { weeklySchedule: { $size: 0 } },
      { weeklySchedule: null },
    ],
  };

  const count = await usersCollection.countDocuments(filter);
  console.log(`Found ${count} pro users without weekly schedule.`);

  if (count === 0) {
    console.log('Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const result = await usersCollection.updateMany(filter, {
    $set: { weeklySchedule: DEFAULT_SCHEDULE },
  });

  console.log(`Updated ${result.modifiedCount} users with default schedule (Mon-Fri 09:00-18:00).`);

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
