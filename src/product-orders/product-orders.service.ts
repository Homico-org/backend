import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { EmailService } from '../verification/services/email.service';
import { User } from '../users/schemas/user.schema';
import { UserRole } from '../users/schemas/user.schema';
import { SupplierProduct } from '../supplier-catalog/schemas/supplier-product.schema';
import { Order, OrderItem, OrderStatus } from './schemas/order.schema';
import {
  CreateOrderDto,
  DeliveryAddressDto,
  DeliveryMode,
  OrderItemInputDto,
} from './dto/create-order.dto';

interface PricedCart {
  items: OrderItem[];
  subtotalMinor: number;
  feeMinor: number;
  totalMinor: number;
  repriced: boolean;
  unavailable: string[];
}

// Service fee is optional now that delivery is an explicit, mandatory line.
const DEFAULT_SERVICE_FEE_MINOR = 0;
// One flat rate per delivery trip (tetri). The mode decides the trip count, so
// fewer trips is always cheaper: all(1) <= bulk(#shops) <= by_items(#items).
const DEFAULT_DELIVERY_TRIP_MINOR = 1200; // 12 GEL / trip

// Allowed admin status transitions (forward fulfilment + cancel).
const NEXT_STATUSES: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
};

@Injectable()
export class ProductOrdersService {
  private readonly logger = new Logger(ProductOrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(SupplierProduct.name)
    private readonly productModel: Model<SupplierProduct>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly paymentsService: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  private cfgMinor(key: string, fallback: number): number {
    const v = parseInt(this.configService.get<string>(key) || '', 10);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  /** Optional flat Homico service fee (separate from delivery). */
  private get feeMinor(): number {
    return this.cfgMinor('HOMICO_ORDER_FEE_MINOR', DEFAULT_SERVICE_FEE_MINOR);
  }

  /**
   * Delivery fee per mode for a priced cart. Delivery is mandatory; the
   * customer chooses how it arrives and the fee scales with the trip count.
   * - all:      one combined delivery (flat).
   * - bulk:     one delivery per shop  (rate x distinct shops).
   * - by_items: one delivery per item  (rate x line items).
   */
  private deliveryOptions(items: OrderItem[]): Record<DeliveryMode, number> {
    if (items.length === 0) return { all: 0, bulk: 0, by_items: 0 };
    // Free delivery over a configurable subtotal threshold (0 = disabled).
    const freeOver = this.cfgMinor('HOMICO_DELIVERY_FREE_OVER_MINOR', 0);
    const subtotal = items.reduce((s, i) => s + i.lineTotalMinor, 0);
    if (freeOver > 0 && subtotal >= freeOver) {
      return { all: 0, bulk: 0, by_items: 0 };
    }
    const rate = this.cfgMinor(
      'HOMICO_DELIVERY_TRIP_MINOR',
      DEFAULT_DELIVERY_TRIP_MINOR,
    );
    const shops = new Set(items.map((i) => i.supplierKey)).size;
    return {
      all: rate, // one combined trip
      bulk: rate * shops, // one trip per shop
      by_items: rate * items.length, // one trip per product
    };
  }

  /** Re-validate cart against live products; authoritative current prices. */
  private async priceCart(
    inputs: OrderItemInputDto[],
  ): Promise<PricedCart> {
    const ids = inputs
      .map((i) => i.supplierProductId)
      .filter((id) => Types.ObjectId.isValid(id));
    const products = await this.productModel
      .find({ _id: { $in: ids } })
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const items: OrderItem[] = [];
    const unavailable: string[] = [];
    let repriced = false;

    for (const input of inputs) {
      const p = byId.get(input.supplierProductId);
      if (!p || p.isAvailable === false || !p.priceMinor) {
        unavailable.push(input.supplierProductId);
        continue;
      }
      const unitPriceMinor = p.priceMinor;
      if (
        input.expectedUnitPriceMinor != null &&
        input.expectedUnitPriceMinor !== unitPriceMinor
      ) {
        repriced = true;
      }
      const qty = Math.max(1, Math.floor(input.qty));
      items.push({
        supplierProductId: input.supplierProductId,
        supplierKey: p.supplierKey,
        name: p.name,
        nameKa: p.nameKa,
        externalUrl: p.externalUrl,
        imageUrl: p.imageUrl,
        unitPriceMinor,
        qty,
        lineTotalMinor: unitPriceMinor * qty,
      });
    }

    const subtotalMinor = items.reduce((s, i) => s + i.lineTotalMinor, 0);
    const feeMinor = items.length ? this.feeMinor : 0;
    return {
      items,
      subtotalMinor,
      feeMinor,
      totalMinor: subtotalMinor + feeMinor,
      repriced,
      unavailable,
    };
  }

  /** Checkout preview - current prices, totals, reprice/unavailable flags. */
  async quote(dto: CreateOrderDto) {
    const priced = await this.priceCart(dto.items);
    const deliveryMode: DeliveryMode = dto.deliveryMode || 'all';
    const deliveryOptions = this.deliveryOptions(priced.items);
    const deliveryFeeMinor = deliveryOptions[deliveryMode];
    return {
      items: priced.items,
      subtotalMinor: priced.subtotalMinor,
      feeMinor: priced.feeMinor,
      deliveryMode,
      deliveryFeeMinor,
      // Fee for every mode so the UI can price each delivery option.
      deliveryOptions,
      // Subtotal that unlocks free delivery (0 = disabled) for an upsell hint.
      deliveryFreeOverMinor: this.cfgMinor('HOMICO_DELIVERY_FREE_OVER_MINOR', 0),
      totalMinor: priced.subtotalMinor + priced.feeMinor + deliveryFeeMinor,
      currency: 'GEL',
      repriced: priced.repriced,
      unavailable: priced.unavailable,
    };
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    const priced = await this.priceCart(dto.items);
    if (priced.items.length === 0) {
      throw new BadRequestException(
        'None of the cart items are available to order',
      );
    }

    const user = await this.userModel
      .findById(userId)
      .select('email phone')
      .lean<{ email?: string; phone?: string }>();

    const deliveryMode: DeliveryMode = dto.deliveryMode || 'all';
    const deliveryFeeMinor = this.deliveryOptions(priced.items)[deliveryMode];

    const order = await this.orderModel.create({
      orderNumber: this.makeOrderNumber(),
      customerId: new Types.ObjectId(userId),
      items: priced.items,
      subtotalMinor: priced.subtotalMinor,
      feeMinor: priced.feeMinor,
      deliveryMode,
      deliveryFeeMinor,
      totalMinor: priced.subtotalMinor + priced.feeMinor + deliveryFeeMinor,
      currency: 'GEL',
      deliveryAddress: this.snapshotAddress(dto.deliveryAddress),
      customerNote: dto.customerNote,
      status: 'awaiting_payment',
      statusHistory: [{ status: 'awaiting_payment', at: new Date() }],
    });

    const appUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const orderId = String(order._id);

    const intent = await this.paymentsService.createIntentForEntity({
      entityType: 'product_order',
      entityId: orderId,
      amountMinor: order.totalMinor,
      currency: 'GEL',
      description: `Homico order ${order.orderNumber}`,
      payerUserId: userId,
      // No shop user exists; product_order skips escrow, so payee is unused.
      payeeUserId: userId,
      payerEmail: user?.email,
      payerPhone: user?.phone || dto.deliveryAddress.phone,
      returnUrl: `${appUrl}/orders/${orderId}/return`,
      cancelUrl: `${appUrl}/orders/${orderId}`,
      metadata: { orderNumber: order.orderNumber },
    });

    order.paymentId = new Types.ObjectId(intent.paymentId);
    await order.save();

    return {
      order: order.toObject(),
      redirectUrl: intent.redirectUrl,
      repriced: priced.repriced,
    };
  }

  /** Pull-based payment sync (mirrors bookings). Mutates + saves on change. */
  private async syncPaymentStatus(order: Order): Promise<Order> {
    const payment = await this.paymentsService.findLatestPaymentForEntity(
      'product_order',
      String(order._id),
    );
    if (!payment) return order;
    order.paymentStatus = payment.status;

    if (payment.status === 'succeeded' && order.status === 'awaiting_payment') {
      order.status = 'paid';
      order.paidAt = new Date();
      order.statusHistory.push({ status: 'paid', at: new Date() });
      await order.save();
      await this.onOrderPaid(order);
    } else if (
      (payment.status === 'failed' || payment.status === 'cancelled') &&
      order.status === 'awaiting_payment'
    ) {
      order.status = 'payment_failed';
      order.statusHistory.push({ status: 'payment_failed', at: new Date() });
      await order.save();
    }
    return order;
  }

  private async onOrderPaid(order: Order): Promise<void> {
    // Notify all admins (ops) of a new paid order to fulfil.
    try {
      const admins = await this.userModel
        .find({ role: UserRole.ADMIN })
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>();
      await Promise.all(
        admins.map((a) =>
          this.notifications.notify(
            String(a._id),
            NotificationType.NEW_ORDER,
            'New paid order',
            `Order ${order.orderNumber} (${(order.totalMinor / 100).toFixed(0)} ₾) is ready to fulfil`,
            {
              link: `/admin/orders`,
              referenceId: String(order._id),
              referenceModel: 'Order',
            },
          ),
        ),
      );
    } catch (err) {
      this.logger.warn(`admin notify failed: ${(err as Error).message}`);
    }
    // Email the customer their confirmation.
    try {
      const user = await this.userModel
        .findById(order.customerId)
        .select('email')
        .lean<{ email?: string }>();
      if (user?.email) {
        await this.emailService.sendOrderConfirmation(user.email, order);
      }
    } catch (err) {
      this.logger.warn(`order confirmation email failed: ${(err as Error).message}`);
    }
  }

  // === Customer reads ===

  async listMyOrders(userId: string) {
    const orders = await this.orderModel
      .find({ customerId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 });
    // Pull-sync any still-awaiting orders so a just-completed payment shows as
    // paid in the list immediately - not only after the 5-min reconcile cron
    // or after opening the detail (which is the only place that synced before).
    // Cheap: only the awaiting_payment rows hit the payments lookup.
    await Promise.all(
      orders
        .filter((o) => o.status === 'awaiting_payment')
        .map((o) =>
          this.syncPaymentStatus(o).catch((err) => {
            this.logger.warn(
              `list sync ${o.orderNumber} failed: ${(err as Error).message}`,
            );
            return o;
          }),
        ),
    );
    return orders.map((o) => o.toObject());
  }

  async getMyOrder(userId: string, id: string) {
    const order = await this.loadOwned(id, userId);
    await this.syncPaymentStatus(order);
    return order.toObject();
  }

  async reconcile(userId: string, id: string) {
    const order = await this.loadOwned(id, userId);
    if (order.paymentId) {
      try {
        await this.paymentsService.reconcileFromReturnUrl(
          String(order.paymentId),
        );
      } catch (err) {
        this.logger.warn(
          `reconcile ${id} failed: ${(err as Error).message}`,
        );
      }
    }
    await this.syncPaymentStatus(order);
    return order.toObject();
  }

  /**
   * Customer cancels their own order while it is still unpaid. Syncs payment
   * first so we never cancel an order the bank already charged (the money path
   * wins). Paid/processing/shipped orders can't be self-cancelled - those go
   * through the admin refund flow.
   */
  async cancelMyOrder(userId: string, id: string) {
    const order = await this.loadOwned(id, userId);
    await this.syncPaymentStatus(order);
    if (!['awaiting_payment', 'payment_failed'].includes(order.status)) {
      throw new BadRequestException(
        `Order ${order.status} can no longer be cancelled`,
      );
    }
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.statusHistory.push({
      status: 'cancelled',
      at: new Date(),
      byUserId: userId,
      note: 'cancelled by customer',
    });
    await order.save();
    return order.toObject();
  }

  /**
   * Resume payment for an order the customer never finished paying. Re-checks
   * status, then spins up a fresh payment intent and hands back a redirectUrl
   * (mock: the return page; BoG: the hosted gateway), mirroring createOrder.
   */
  async resumePayment(userId: string, id: string) {
    const order = await this.loadOwned(id, userId);
    await this.syncPaymentStatus(order);

    const appUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const orderId = String(order._id);

    // Already settled - just send them to the order page.
    if (order.status !== 'awaiting_payment' && order.status !== 'payment_failed') {
      return { redirectUrl: `${appUrl}/orders/${orderId}`, status: order.status };
    }

    const user = await this.userModel
      .findById(userId)
      .select('email phone')
      .lean<{ email?: string; phone?: string }>();

    const intent = await this.paymentsService.createIntentForEntity({
      entityType: 'product_order',
      entityId: orderId,
      amountMinor: order.totalMinor,
      currency: 'GEL',
      description: `Homico order ${order.orderNumber}`,
      payerUserId: userId,
      payeeUserId: userId,
      payerEmail: user?.email,
      payerPhone: user?.phone || order.deliveryAddress.phone,
      returnUrl: `${appUrl}/orders/${orderId}/return`,
      cancelUrl: `${appUrl}/orders/${orderId}`,
      metadata: { orderNumber: order.orderNumber },
    });

    // A retry resets a failed order back to awaiting so sync can settle it.
    order.paymentId = new Types.ObjectId(intent.paymentId);
    if (order.status === 'payment_failed') {
      order.status = 'awaiting_payment';
      order.statusHistory.push({ status: 'awaiting_payment', at: new Date() });
    }
    await order.save();

    return { redirectUrl: intent.redirectUrl, status: order.status };
  }

  /**
   * Safety net for the money path: a customer can pay at the bank and never
   * return to the app, so the pull-based sync on the return page never fires
   * and the order stays 'awaiting_payment' (ops never notified). Every few
   * minutes, force-reconcile recent unpaid orders straight from the provider;
   * genuinely-paid ones flip to 'paid' and notify ops.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcilePendingOrders(): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pending = await this.orderModel
      .find({ status: 'awaiting_payment', createdAt: { $gte: since } })
      .limit(100);
    for (const order of pending) {
      try {
        if (order.paymentId) {
          await this.paymentsService.reconcileFromReturnUrl(
            String(order.paymentId),
          );
        }
        await this.syncPaymentStatus(order);
      } catch (err) {
        this.logger.warn(
          `order reconcile cron ${order.orderNumber}: ${(err as Error).message}`,
        );
      }
    }
  }

  // === Admin ===

  async listOrders(filters: { status?: string; supplierKey?: string; page?: string }) {
    const page = Math.max(1, parseInt(filters.page ?? '1', 10) || 1);
    const limit = 30;
    const query: Record<string, unknown> = {};
    if (filters.status) query.status = filters.status;
    if (filters.supplierKey) query['items.supplierKey'] = filters.supplierKey;
    const [items, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);
    return { items, total, page, limit, hasMore: page * limit < total };
  }

  async getOrderAdmin(id: string) {
    const order = await this.load(id);
    return order.toObject();
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    adminId: string,
    note?: string,
  ) {
    const order = await this.load(id);
    const allowed = NEXT_STATUSES[order.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot move order from ${order.status} to ${status}`,
      );
    }
    order.status = status;
    if (status === 'cancelled') order.cancelledAt = new Date();
    order.statusHistory.push({ status, at: new Date(), byUserId: adminId, note });
    await order.save();

    // Tell the customer about the fulfilment update.
    try {
      const user = await this.userModel
        .findById(order.customerId)
        .select('email')
        .lean<{ email?: string }>();
      await this.notifications.notify(
        String(order.customerId),
        NotificationType.ORDER_UPDATE,
        'Order update',
        `Order ${order.orderNumber} is now ${status}`,
        { link: `/orders/${order._id}`, referenceId: String(order._id), referenceModel: 'Order' },
      );
      if (user?.email) {
        await this.emailService.sendOrderStatusUpdate(user.email, order, status);
      }
    } catch (err) {
      this.logger.warn(`status-update notify failed: ${(err as Error).message}`);
    }
    return order.toObject();
  }

  async refundOrder(
    id: string,
    adminId: string,
    reason: string,
    amountMinor?: number,
  ) {
    const order = await this.load(id);
    if (!['paid', 'processing', 'shipped', 'delivered'].includes(order.status)) {
      throw new BadRequestException(`Order ${order.status} is not refundable`);
    }
    const amount = amountMinor ?? order.totalMinor - order.refundedAmountMinor;
    const result = await this.paymentsService.refundForEntity(
      'product_order',
      id,
      amount,
      reason,
    );
    order.refundedAmountMinor += amount;
    order.status = 'refunded';
    order.statusHistory.push({
      status: 'refunded',
      at: new Date(),
      byUserId: adminId,
      note: reason,
    });
    await order.save();

    try {
      await this.notifications.notify(
        String(order.customerId),
        NotificationType.ORDER_UPDATE,
        'Order refunded',
        `Order ${order.orderNumber} was refunded`,
        { link: `/orders/${order._id}`, referenceId: String(order._id), referenceModel: 'Order' },
      );
    } catch {
      /* best-effort */
    }
    return { order: order.toObject(), refund: result };
  }

  // === helpers ===

  private async load(id: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Order not found');
    const order = await this.orderModel.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async loadOwned(id: string, userId: string): Promise<Order> {
    const order = await this.load(id);
    if (String(order.customerId) !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return order;
  }

  private snapshotAddress(a: DeliveryAddressDto) {
    return {
      formattedAddress: a.formattedAddress,
      phone: a.phone,
      apartment: a.apartment,
      floor: a.floor,
      entrance: a.entrance,
      notes: a.notes,
      lat: a.lat,
      lng: a.lng,
    };
  }

  private makeOrderNumber(): string {
    const suffix = new Types.ObjectId().toString().slice(-6).toUpperCase();
    return `HO-${suffix}`;
  }
}
