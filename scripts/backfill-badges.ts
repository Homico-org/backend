/**
 * Retroactively award badges to existing users based on their current state.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-badges.ts
 *
 * Boots the real Nest app context and runs BadgesService.evaluate() for every
 * user against ALL triggers, with notifications disabled (no spam). Awarding is
 * idempotent (unique index on userId+badgeKey), so this script is safe to run
 * repeatedly — already-unlocked badges are skipped.
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { BadgesService } from '../src/badges/badges.service';
import { User } from '../src/users/schemas/user.schema';

dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  const log = new Logger('backfill-badges');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const badges = app.get(BadgesService);
    const userModel = app.get<Model<User>>(getModelToken(User.name));

    const cursor = userModel.find({}, { _id: 1 }).lean().cursor();
    let processed = 0;
    for await (const u of cursor) {
      await badges.evaluate(String(u._id), BadgesService.ALL_TRIGGERS, {
        notify: false,
      });
      processed++;
      if (processed % 50 === 0) log.log(`...processed ${processed} users`);
    }
    log.log(`Done. Evaluated ${processed} users.`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
