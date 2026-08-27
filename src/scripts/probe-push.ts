import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AppModule } from '../app.module';
import { ExpoPushService } from '../notifications/expo-push.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { User } from '../users/schemas/user.schema';

const USER = '6a0f62c2bf2f9e5cad5ba5c8';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const push = app.get(ExpoPushService);
  const userModel = app.get<Model<User>>(getModelToken(User.name));

  const original = await userModel.findById(USER).select('pushTokens notificationPreferences').lean<any>();
  console.log('existing tokens:', (original?.pushTokens ?? []).length);

  // 1. No tokens -> no-op
  await userModel.updateOne({ _id: USER }, { $set: { pushTokens: [] } });
  console.log('1. no tokens        ->', await push.sendToUser(USER, {
    title: 'x', body: 'y', type: NotificationType.BOOKING_CANCELLED,
  }), '(expect 0)');

  // 2. Non-Expo token (raw FCM) must be filtered out, not sent
  await userModel.updateOne({ _id: USER }, { $set: { pushTokens: [{ token: 'raw-fcm-abc', platform: 'android', updatedAt: new Date() }] } });
  console.log('2. non-expo token   ->', await push.sendToUser(USER, {
    title: 'x', body: 'y', type: NotificationType.BOOKING_CANCELLED,
  }), '(expect 0)');

  // 3. Well-formed but fake Expo token -> real API call, ticket error, pruned
  const fake = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
  await userModel.updateOne({ _id: USER }, { $set: { pushTokens: [{ token: fake, platform: 'ios', updatedAt: new Date() }] } });
  console.log('3. fake expo token  ->', await push.sendToUser(USER, {
    title: 'Homico', body: 'probe', type: NotificationType.BOOKING_CANCELLED,
  }), '(expect 0, real HTTP round-trip)');
  const after = await userModel.findById(USER).select('pushTokens').lean<any>();
  console.log('   tokens after     :', (after?.pushTokens ?? []).length, '(pruned if Expo said DeviceNotRegistered)');

  // 4. push.enabled = false -> short-circuits before any HTTP
  await userModel.updateOne({ _id: USER }, {
    $set: {
      pushTokens: [{ token: fake, platform: 'ios', updatedAt: new Date() }],
      notificationPreferences: {
        email: { enabled: true, newJobs: true, proposals: true, messages: true, marketing: false },
        push: { enabled: false, newJobs: true, proposals: true, messages: true },
        sms: { enabled: false, proposals: false, messages: false },
      },
    },
  });
  console.log('4. push disabled    ->', await push.sendToUser(USER, {
    title: 'x', body: 'y', type: NotificationType.BOOKING_CANCELLED,
  }), '(expect 0)');

  // 5. category toggle off -> messages blocked, transactional still allowed
  await userModel.updateOne({ _id: USER }, {
    $set: {
      'notificationPreferences.push': { enabled: true, newJobs: true, proposals: true, messages: false },
    },
  });
  console.log('5. messages=false, NEW_MESSAGE ->', await push.sendToUser(USER, {
    title: 'x', body: 'y', type: NotificationType.NEW_MESSAGE,
  }), '(expect 0 - blocked before HTTP)');

  // restore
  await userModel.updateOne({ _id: USER }, {
    $set: { pushTokens: original?.pushTokens ?? [], notificationPreferences: original?.notificationPreferences ?? null },
  });
  console.log('restored original user state');

  await app.close();
  process.exit(0);
}
main();
