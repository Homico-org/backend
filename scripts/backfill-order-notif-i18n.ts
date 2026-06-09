/**
 * One-off backfill: existing order notifications were created before the
 * i18n keys existed, so they have no titleKey/messageKey/i18nParams and the
 * bell feed renders the English fallback (and, now that the message keys
 * exist, would show literal {orderNumber} for new_order). This parses the
 * templated English message and stamps the i18n fields so they localize.
 *
 * Dry-run by default; HOMI_CONFIRM=yes applies:
 *   npx ts-node scripts/backfill-order-notif-i18n.ts
 *   HOMI_CONFIRM=yes npx ts-node scripts/backfill-order-notif-i18n.ts
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import mongoose from 'mongoose';

dotenv.config({ path: resolve(__dirname, '../.env') });

interface Patch {
  titleKey: string;
  messageKey: string;
  i18nParams: Record<string, string | number>;
}

function derive(type: string, message: string): Patch | null {
  if (type === 'new_order') {
    const m = message.match(/Order\s+(\S+)\s+\((\d+)\s*₾\)/);
    if (!m) return null;
    return {
      titleKey: 'notifications.types.new_order.title',
      messageKey: 'notifications.types.new_order.message',
      i18nParams: { orderNumber: m[1], amount: m[2] },
    };
  }
  if (type === 'order_update') {
    const refunded = message.match(/Order\s+(\S+)\s+was refunded/);
    if (refunded) {
      return {
        titleKey: 'notifications.types.order_refunded.title',
        messageKey: 'notifications.types.order_refunded.message',
        i18nParams: { orderNumber: refunded[1] },
      };
    }
    const status = message.match(/Order\s+(\S+)\s+is now\s+(\w+)/);
    if (status) {
      return {
        titleKey: 'notifications.types.order_update.title',
        messageKey: `notifications.types.order_status.${status[2]}`,
        i18nParams: { orderNumber: status[1] },
      };
    }
  }
  return null;
}

(async () => {
  const apply = process.env.HOMI_CONFIRM === 'yes';
  await mongoose.connect(process.env.MONGODB_URI as string);
  const col = mongoose.connection.db!.collection('notifications');

  const docs = await col
    .find({
      type: { $in: ['new_order', 'order_update'] },
      titleKey: { $in: [null, undefined] },
    })
    .toArray();

  let patched = 0;
  let skipped = 0;
  for (const d of docs) {
    const patch = derive(d.type, d.message || '');
    if (!patch) {
      skipped++;
      continue;
    }
    patched++;
    console.log(
      `${apply ? 'PATCH' : 'WOULD PATCH'}  ${d.type}  "${(d.message || '').slice(0, 48)}"  -> ${patch.messageKey} ${JSON.stringify(patch.i18nParams)}`,
    );
    if (apply) {
      await col.updateOne({ _id: d._id }, { $set: patch });
    }
  }

  console.log(
    `\n${apply ? 'Patched' : 'Would patch'} ${patched} notification(s), skipped ${skipped} (unparseable).`,
  );
  if (!apply) console.log('Dry run - re-run with HOMI_CONFIRM=yes to apply.');

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
