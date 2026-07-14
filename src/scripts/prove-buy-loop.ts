/**
 * End-to-end proof of the marketplace buy loop for a SELF-SERVE manual shop
 * (kasco-independent). Seeds a seller + approved shop + stocked product + a
 * buyer, then drives: create order -> reconcile (mock payment succeeds) ->
 * order paid -> stock decremented + seller notified + seller/buyer see it.
 *
 * Run with the mock provider (instant success, dev/CI path):
 *   PAYMENT_PROVIDER=mock npx ts-node -r tsconfig-paths/register src/scripts/prove-buy-loop.ts
 *
 * All seeded docs are tagged with a unique run id and removed in `finally`.
 */
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { ProductOrdersService } from '../product-orders/product-orders.service';

const TAG = `e2e-buyloop-${Date.now()}`;
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  ok ? pass++ : fail++;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const userModel = app.get<Model<any>>(getModelToken('User'));
  const supplierModel = app.get<Model<any>>(getModelToken('Supplier'));
  const productModel = app.get<Model<any>>(getModelToken('SupplierProduct'));
  const orderModel = app.get<Model<any>>(getModelToken('Order'));
  const notifModel = app.get<Model<any>>(getModelToken('Notification'));
  const paymentModel = app.get<Model<any>>(getModelToken('Payment'));
  const orders = app.get(ProductOrdersService);

  const created: { model: Model<any>; ids: Types.ObjectId[] }[] = [];
  const track = (model: Model<any>, id: Types.ObjectId) => {
    const e = created.find((c) => c.model === model);
    e ? e.ids.push(id) : created.push({ model, ids: [id] });
  };
  let orderId: string | null = null;

  try {
    // ── seed ──
    const uidBase = Number(TAG.replace(/\D/g, '').slice(-12));
    const seller = await userModel.create({
      email: `${TAG}-seller@test.local`, uid: uidBase, role: 'client', name: 'E2E Seller',
    });
    track(userModel, seller._id);
    const buyer = await userModel.create({
      email: `${TAG}-buyer@test.local`, uid: uidBase + 1, role: 'client', name: 'E2E Buyer',
      phone: '+995555000000',
    });
    track(userModel, buyer._id);

    const shopKey = TAG;
    const shop = await supplierModel.create({
      key: shopKey, name: 'E2E Test Shop', baseUrl: 'https://homico.ge',
      sourceType: 'manual', status: 'approved', isActive: true,
      ownerUserId: seller._id, deliveryFeeMinor: 0,
    });
    track(supplierModel, shop._id);

    const START_STOCK = 10;
    const UNIT_MINOR = 5000; // 50 GEL
    const BUY_QTY = 3;
    const product = await productModel.create({
      supplierKey: shopKey, externalId: `${TAG}-p1`,
      externalUrl: 'https://homico.ge/shop', name: 'E2E Widget', nameKa: 'ვიჯეტი',
      searchText: 'e2e widget ვიჯეტი', priceMinor: UNIT_MINOR, currency: 'GEL',
      imageUrls: [], category: 'test', categoryLabel: 'Test',
      isAvailable: true, inStock: true, stockQty: START_STOCK, lastSeenAt: new Date(),
    });
    track(productModel, product._id);

    console.log(`\n[seed] shop=${shopKey} product=${product._id} stock=${START_STOCK}\n`);

    // ── quote ──
    const dto = {
      items: [{ supplierProductId: String(product._id), qty: BUY_QTY }],
      deliveryAddress: { formattedAddress: 'Tbilisi, Vake, Chavchavadze 1', phone: '+995555000000' },
      deliveryMode: 'all' as const,
    };
    const quote = await orders.quote(dto);
    check('quote prices the cart', quote.subtotalMinor === UNIT_MINOR * BUY_QTY,
      `subtotal=${quote.subtotalMinor}`);
    check('quote finds nothing unavailable', quote.unavailable.length === 0);

    // ── create order ──
    const { order } = await orders.createOrder(String(buyer._id), dto);
    orderId = String(order._id);
    track(orderModel, order._id as Types.ObjectId);
    check('order created awaiting_payment', order.status === 'awaiting_payment',
      `#${order.orderNumber} status=${order.status}`);

    // ── reconcile (mock payment auto-succeeds) ──
    const reconciled = await orders.reconcile(String(buyer._id), String(order._id));
    check('order flips to paid after reconcile', reconciled.status === 'paid',
      `status=${reconciled.status}`);

    // ── stock decremented ──
    const afterProduct = (await productModel.findById(product._id).lean()) as any;
    check('stock decremented by qty', afterProduct.stockQty === START_STOCK - BUY_QTY,
      `${START_STOCK} -> ${afterProduct.stockQty}`);
    check('inStock still true (stock remains)', afterProduct.inStock === true);

    // ── seller sees the order ──
    const shopOrders = await orders.listShopOrders(String(seller._id), {});
    const mine = shopOrders.items.find((o: any) => String(o._id) === String(order._id));
    check('seller sees the order in /orders/my-shop', !!mine);
    check('seller subtotal = their line items only',
      mine?.shopSubtotalMinor === UNIT_MINOR * BUY_QTY, `shopSubtotal=${mine?.shopSubtotalMinor}`);
    check('seller item count correct', mine?.itemCount === BUY_QTY, `itemCount=${mine?.itemCount}`);

    // ── buyer sees the order ──
    const myOrders = await orders.listMyOrders(String(buyer._id));
    const buyerList = Array.isArray(myOrders) ? myOrders : (myOrders as any).items || [];
    check('buyer sees the order in /orders',
      buyerList.some((o: any) => String(o._id) === String(order._id)));

    // ── seller notified ──
    const sellerNotifs = (await notifModel.find({ userId: seller._id }).lean()) as any[];
    const notif = sellerNotifs.find(
      (n) => n.type === 'new_order' && String(n.referenceId) === String(order._id),
    );
    check('seller received a new_order notification', !!notif,
      notif ? `"${notif.message}"` : 'none');

    console.log(`\n[result] ${pass} passed, ${fail} failed\n`);
  } finally {
    // ── cleanup ──
    let removed = 0;
    // Side-effect docs first, scoped strictly to THIS order's refs so no real
    // homi_dev data is touched.
    if (orderId) {
      // referenceId is a dynamic-refPath ObjectId; Mongoose won't cast a string
      // for it, so pass an ObjectId instance or the delete silently matches 0.
      const n = await notifModel
        .deleteMany({ referenceId: new Types.ObjectId(orderId) })
        .catch(() => ({ deletedCount: 0 }));
      const p = await paymentModel
        .deleteMany({ entityType: 'product_order', entityId: orderId })
        .catch(() => ({ deletedCount: 0 }));
      removed += (n.deletedCount || 0) + (p.deletedCount || 0);
    }
    // Then the seeded docs (reverse order).
    for (const { model, ids } of created.reverse()) {
      const r = await model.deleteMany({ _id: { $in: ids } });
      removed += r.deletedCount || 0;
    }
    console.log(`[cleanup] removed ${removed} docs (seeded + this order's side-effects)`);
    await app.close();
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
