import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import {
  Payment,
  PaymentDoc,
  PaymentEntityType,
  PaymentStatus,
} from "./schemas/payment.schema";
import { Escrow, EscrowDoc } from "./schemas/escrow.schema";
import { Dispute, DisputeDoc, DisputeStatus } from "./schemas/dispute.schema";
import { Payout, PayoutDoc } from "./schemas/payout.schema";
import {
  PromoCode,
  PromoDiscountType,
} from "./schemas/promo-code.schema";
import { User } from "../users/schemas/user.schema";
import { PaymentProviderFactory } from "./providers/payment-provider.factory";
import { PaymentProviderName } from "./providers/payment-provider.interface";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationType } from "../notifications/schemas/notification.schema";
import { EmailService } from "../verification/services/email.service";

/**
 * Orchestration layer between Homico's domain (bookings/projects) and the
 * payment provider abstraction. Consumers (BookingsService etc.) call into
 * this, never the provider directly.
 *
 * Responsibilities:
 *   - createIntentForEntity: spin up a provider intent + persist a Payment row
 *   - handleProviderWebhook: idempotent webhook handler that flips Payment +
 *     Escrow status based on the decoded provider event
 *   - reconcileFromReturnUrl: backup path when user returns to our site
 *     before the webhook arrives - re-checks provider status
 *   - refundForEntity: issue a refund and update Escrow accordingly
 *   - createEscrow: called by handleProviderWebhook on success; consumers
 *     don't call this directly (escrow is a side effect of successful payment)
 *
 * Note on platform fees: Phase 1 hardcodes 5% as PLATFORM_FEE_RATE. Phase 3
 * makes this configurable per-pro (e.g. premium tier gets lower fees).
 */

const PLATFORM_FEE_RATE = 0.05;

export interface CreateIntentForEntityParams {
  entityType: PaymentEntityType;
  entityId: string;
  /** Total to charge in minor units (e.g. tetri for GEL). */
  amountMinor: number;
  /** ISO currency code. GE/GEL is the only live market today. */
  currency: string;
  description: string;
  payerUserId: string;
  /** Who will eventually receive money if escrow releases. */
  payeeUserId: string;
  payerEmail?: string;
  payerPhone?: string;
  /** Where the user is sent back after paying. */
  returnUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreateIntentForEntityResult {
  paymentId: string;
  redirectUrl: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(Escrow.name) private readonly escrowModel: Model<Escrow>,
    @InjectModel(Dispute.name) private readonly disputeModel: Model<Dispute>,
    @InjectModel(Payout.name) private readonly payoutModel: Model<Payout>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(PromoCode.name)
    private readonly promoCodeModel: Model<PromoCode>,
    private readonly providers: PaymentProviderFactory,
    private readonly notifications: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Create a payment intent at the active provider and persist a pending
   * Payment row. Caller (e.g. BookingsService) gets back a redirectUrl to
   * send the user to.
   */
  async createIntentForEntity(
    params: CreateIntentForEntityParams,
  ): Promise<CreateIntentForEntityResult> {
    if (params.amountMinor <= 0) {
      throw new BadRequestException("amountMinor must be > 0");
    }

    const provider = this.providers.get();

    // Merge caller metadata with our entity identifiers so we can correlate
    // webhook payloads back to the right booking/project even if the
    // provider's intentId changes shape.
    const metadata: Record<string, string> = {
      ...params.metadata,
      entityType: params.entityType,
      entityId: params.entityId,
      payerUserId: params.payerUserId,
      payeeUserId: params.payeeUserId,
    };
    if (params.entityType === "booking") {
      metadata.bookingId = params.entityId;
    }

    const { intentId, redirectUrl } = await provider.createIntent({
      amountMinor: params.amountMinor,
      currency: params.currency,
      description: params.description,
      metadata,
      returnUrl: params.returnUrl,
      cancelUrl: params.cancelUrl,
      payerUserId: params.payerUserId,
      payerEmail: params.payerEmail,
      payerPhone: params.payerPhone,
    });

    const payment = await this.paymentModel.create({
      userId: new Types.ObjectId(params.payerUserId),
      payeeUserId: new Types.ObjectId(params.payeeUserId),
      provider: provider.name,
      providerIntentId: intentId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      status: "pending" as PaymentStatus,
      entityType: params.entityType,
      entityId: params.entityId,
      refundedAmountMinor: 0,
      redirectUrl,
      metadata,
    });

    this.logger.log(
      `Created intent ${intentId} for ${params.entityType}:${params.entityId} amount=${params.amountMinor} ${params.currency}`,
    );

    return { paymentId: String(payment._id), redirectUrl };
  }

  /**
   * Start a premium subscription payment. Unlike bookings/jobs this is a
   * platform charge (no pro payee, no escrow) - on success `grantPremium`
   * flips the user's subscription. Server-authoritative pricing so a tampered
   * client can't pay less. tier+period are encoded in the entityId so the
   * grant step can apply the right plan from the Payment doc alone.
   */
  // Per-marketplace pricing. `elite` is sold as "Super Pro". MUST mirror the
  // frontend's data/premium-pricing.ts so the charge matches the displayed
  // price AND currency. The server is authoritative: never derive the amount
  // or currency from the client. Default market is GE (the only live one).
  private static readonly DEFAULT_COUNTRY = "GE";
  private static readonly PREMIUM_PRICES_BY_COUNTRY: Record<
    string,
    Record<string, { monthly: number; yearly: number }>
  > = {
    GE: {
      basic: { monthly: 29, yearly: 290 },
      pro: { monthly: 100, yearly: 1000 },
      elite: { monthly: 250, yearly: 2500 },
    },
    IL: {
      basic: { monthly: 39, yearly: 390 },
      pro: { monthly: 89, yearly: 890 },
      elite: { monthly: 149, yearly: 1490 },
    },
    FR: {
      basic: { monthly: 10, yearly: 99 },
      pro: { monthly: 20, yearly: 199 },
      elite: { monthly: 35, yearly: 349 },
    },
    US: {
      basic: { monthly: 10, yearly: 99 },
      pro: { monthly: 20, yearly: 199 },
      elite: { monthly: 40, yearly: 399 },
    },
    DE: {
      basic: { monthly: 10, yearly: 99 },
      pro: { monthly: 20, yearly: 199 },
      elite: { monthly: 35, yearly: 349 },
    },
    UK: {
      basic: { monthly: 9, yearly: 89 },
      pro: { monthly: 18, yearly: 179 },
      elite: { monthly: 30, yearly: 299 },
    },
  };

  private static readonly CURRENCY_BY_COUNTRY: Record<string, string> = {
    GE: "GEL",
    IL: "ILS",
    FR: "EUR",
    US: "USD",
    DE: "EUR",
    UK: "GBP",
  };

  /**
   * Resolve the price table + currency for a marketplace. Defaults to GE when
   * no country is supplied. Throws on an explicitly-unsupported country so we
   * never charge the wrong amount/currency for a market we don't price.
   */
  private resolveMarket(country?: string): {
    country: string;
    currency: string;
    prices: Record<string, { monthly: number; yearly: number }>;
  } {
    const resolved = (country || PaymentsService.DEFAULT_COUNTRY).toUpperCase();
    const prices = PaymentsService.PREMIUM_PRICES_BY_COUNTRY[resolved];
    const currency = PaymentsService.CURRENCY_BY_COUNTRY[resolved];
    if (!prices || !currency) {
      throw new BadRequestException(`Unsupported country: ${resolved}`);
    }
    return { country: resolved, currency, prices };
  }

  /** Apply a promo's discount to a GEL price, clamped to >= 0 and rounded. */
  private applyPromoDiscount(price: number, promo: PromoCode): number {
    let final = price;
    if (promo.discountType === "amount_off") final = price - promo.value;
    else if (promo.discountType === "percent_off")
      final = price - (price * promo.value) / 100;
    else if (promo.discountType === "fixed_price") final = promo.value;
    return Math.max(0, Math.round(final));
  }

  /**
   * Look up a usable promo code for a tier, throwing a specific BadRequest
   * (INVALID_PROMO / EXPIRED_PROMO / PROMO_USED_UP / PROMO_NOT_FOR_TIER) the
   * frontend can map to a friendly message. Returns the live document.
   */
  private async findValidPromo(
    code: string,
    tier: string,
    userId?: string,
  ): Promise<PromoCode> {
    const promo = await this.promoCodeModel
      .findOne({ code: code.toUpperCase().trim() })
      .exec();
    if (!promo || !promo.active) throw new BadRequestException("INVALID_PROMO");
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date())
      throw new BadRequestException("EXPIRED_PROMO");
    if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses)
      throw new BadRequestException("PROMO_USED_UP");
    if (userId && promo.usedBy?.some((id) => id.toString() === userId))
      throw new BadRequestException("PROMO_ALREADY_USED");
    if (
      promo.applicableTiers?.length &&
      !promo.applicableTiers.includes(tier)
    )
      throw new BadRequestException("PROMO_NOT_FOR_TIER");
    return promo;
  }

  /**
   * Preview the premium price for a tier/period, optionally after a promo
   * code. Read-only - used by the checkout page to show the discount before
   * the user pays. Throws the same coded errors as findValidPromo.
   */
  async previewPremiumPrice(
    tier: string,
    period: "monthly" | "yearly",
    code?: string,
    userId?: string,
    country?: string,
  ): Promise<{
    originalAmount: number;
    finalAmount: number;
    discounted: boolean;
    currency: string;
    code?: string;
  }> {
    const { currency, prices: table } = this.resolveMarket(country);
    const prices = table[tier];
    if (!prices) throw new BadRequestException(`Unknown premium tier: ${tier}`);
    const base = period === "yearly" ? prices.yearly : prices.monthly;
    if (!code?.trim()) {
      return {
        originalAmount: base,
        finalAmount: base,
        discounted: false,
        currency,
      };
    }
    const promo = await this.findValidPromo(code, tier, userId);
    const final = this.applyPromoDiscount(base, promo);
    return {
      originalAmount: base,
      finalAmount: final,
      discounted: final < base,
      currency,
      code: promo.code,
    };
  }

  async createPremiumIntent(
    userId: string,
    tier: string,
    period: "monthly" | "yearly",
    promoCode?: string,
    country?: string,
  ): Promise<{ paymentId: string; redirectUrl: string }> {
    // Allow-list: only the plans the UI actually sells may be purchased. The
    // app offers Pro and Super Pro (elite) on a MONTHLY basis only. Without
    // this, a crafted request could buy an off-menu plan (e.g. `basic`, or
    // `yearly` at 10x the price). Keep in sync with data/premium-pricing.ts.
    const OFFERED_TIERS = new Set(["pro", "elite"]);
    if (!OFFERED_TIERS.has(tier)) {
      throw new BadRequestException(`Unknown premium tier: ${tier}`);
    }
    if (period !== "monthly") {
      throw new BadRequestException("Only monthly billing is available");
    }
    const { currency, prices: table } = this.resolveMarket(country);
    const prices = table[tier];
    if (!prices) {
      throw new BadRequestException(`Unknown premium tier: ${tier}`);
    }
    // One active subscription at a time: block a new purchase while the user
    // still has premium running. They can buy again once it expires. Prevents
    // accidental double-buys stacking the expiry years into the future.
    const current = await this.userModel
      .findById(userId)
      .select("premiumExpiresAt")
      .lean<{ premiumExpiresAt?: Date }>()
      .exec();
    if (
      current?.premiumExpiresAt &&
      new Date(current.premiumExpiresAt) > new Date()
    ) {
      throw new BadRequestException("ALREADY_PREMIUM");
    }
    // Monthly-only today (guarded above), optionally discounted by a promo.
    let amount = prices.monthly;
    let appliedCode: string | undefined;
    if (promoCode?.trim()) {
      const promo = await this.findValidPromo(promoCode, tier, userId);
      amount = this.applyPromoDiscount(amount, promo);
      appliedCode = promo.code;
    }
    const amountMinor = Math.round(amount * 100);

    const appUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return this.createIntentForEntity({
      entityType: "premium",
      entityId: `${userId}:${tier}:${period}`,
      amountMinor,
      currency,
      description: `Homico ${tier} (${period})`,
      payerUserId: userId,
      // No real payee for a platform charge - self-reference satisfies the
      // Payment schema; no escrow is created for the premium entity type.
      payeeUserId: userId,
      returnUrl: `${appUrl}/pro/premium/return?tier=${tier}`,
      cancelUrl: `${appUrl}/pro/premium`,
      metadata: { tier, period, kind: "premium", promoCode: appliedCode },
    });
  }

  // ---- Promo code admin ----

  async createPromoCode(input: {
    code: string;
    discountType: PromoDiscountType;
    value: number;
    applicableTiers?: string[];
    maxUses?: number;
    expiresAt?: string;
    note?: string;
  }): Promise<PromoCode> {
    const code = input.code?.toUpperCase().trim();
    if (!code) throw new BadRequestException("Code is required");
    if (!["amount_off", "percent_off", "fixed_price"].includes(input.discountType))
      throw new BadRequestException("Invalid discountType");
    if (typeof input.value !== "number" || input.value < 0)
      throw new BadRequestException("Invalid value");
    if (input.discountType === "percent_off" && input.value > 100)
      throw new BadRequestException("percent_off cannot exceed 100");
    const exists = await this.promoCodeModel.findOne({ code }).lean().exec();
    if (exists) throw new BadRequestException("Code already exists");
    return this.promoCodeModel.create({
      code,
      discountType: input.discountType,
      value: input.value,
      applicableTiers: input.applicableTiers || [],
      maxUses: input.maxUses || 0,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      note: input.note,
    });
  }

  async listPromoCodes(): Promise<PromoCode[]> {
    return this.promoCodeModel.find().sort({ createdAt: -1 }).lean().exec();
  }

  async setPromoCodeActive(id: string, active: boolean): Promise<PromoCode> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException("Promo code not found");
    const promo = await this.promoCodeModel
      .findByIdAndUpdate(id, { active }, { new: true })
      .exec();
    if (!promo) throw new NotFoundException("Promo code not found");
    return promo;
  }

  /**
   * Admin: who bought premium, what, and for how much. Newest first. Reads
   * tier/promo from the persisted Payment metadata (falling back to entityId
   * for older rows that predate the metadata field).
   */
  async listPremiumPurchases(): Promise<
    Array<{
      id: string;
      buyerName: string;
      buyerEmail: string;
      tier: string;
      tierLabel: string;
      amount: number;
      currency: string;
      promoCode: string | null;
      status: string;
      refunded: boolean;
      createdAt: Date;
    }>
  > {
    const payments = await this.paymentModel
      .find({ entityType: "premium" })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean<
        Array<{
          _id: Types.ObjectId;
          userId: Types.ObjectId;
          entityId: string;
          amountMinor: number;
          currency: string;
          status: string;
          refundedAmountMinor: number;
          metadata?: Record<string, string>;
          createdAt: Date;
        }>
      >()
      .exec();
    const userIds = [...new Set(payments.map((p) => String(p.userId)))];
    const users = await this.userModel
      .find({ _id: { $in: userIds } })
      .select("name email")
      .lean<Array<{ _id: Types.ObjectId; name?: string; email?: string }>>()
      .exec();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return payments.map((p) => {
      const meta = p.metadata || {};
      const tier = meta.tier || (p.entityId || "").split(":")[1] || "";
      const u = byId.get(String(p.userId));
      return {
        id: String(p._id),
        buyerName: u?.name || "",
        buyerEmail: u?.email || "",
        tier,
        tierLabel:
          tier === "elite" ? "Super Pro" : tier === "pro" ? "Pro" : tier,
        amount: p.amountMinor / 100,
        currency: p.currency,
        promoCode: meta.promoCode || null,
        status: p.status,
        refunded: p.refundedAmountMinor > 0,
        createdAt: p.createdAt,
      };
    });
  }

  /**
   * Admin: the Super Pro social-promo pipeline. Lists every active Super Pro
   * (elite) sub with a `ready` flag once it's past the 3-day refund window -
   * i.e. the charge is committed and the content team can safely start FB/
   * Instagram content + storytelling.
   */
  async listSuperProContentQueue(): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
      startedAt?: Date;
      expiresAt?: Date;
      ready: boolean;
      contentStatus: string;
    }>
  > {
    const windowMs =
      PaymentsService.PREMIUM_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const readyCutoff = Date.now() - windowMs;
    const users = await this.userModel
      .find({ isPremium: true, premiumTier: "elite" })
      .select("name email premiumStartedAt premiumExpiresAt superProContentStatus")
      .sort({ premiumStartedAt: 1 })
      .lean<
        Array<{
          _id: Types.ObjectId;
          name?: string;
          email?: string;
          premiumStartedAt?: Date;
          premiumExpiresAt?: Date;
          superProContentStatus?: string;
        }>
      >()
      .exec();
    return users.map((u) => ({
      id: String(u._id),
      name: u.name || "",
      email: u.email || "",
      startedAt: u.premiumStartedAt,
      expiresAt: u.premiumExpiresAt,
      ready: u.premiumStartedAt
        ? new Date(u.premiumStartedAt).getTime() <= readyCutoff
        : false,
      contentStatus: u.superProContentStatus || "pending",
    }));
  }

  async setSuperProContentStatus(
    userId: string,
    status: string,
  ): Promise<{ id: string; contentStatus: string }> {
    if (!["pending", "in_progress", "done"].includes(status))
      throw new BadRequestException("Invalid status");
    if (!Types.ObjectId.isValid(userId))
      throw new NotFoundException("User not found");
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { superProContentStatus: status },
        { new: true },
      )
      .select("superProContentStatus")
      .lean<{ _id: Types.ObjectId; superProContentStatus?: string }>()
      .exec();
    if (!user) throw new NotFoundException("User not found");
    return { id: String(user._id), contentStatus: user.superProContentStatus || status };
  }

  /**
   * Grant (or extend) a premium subscription after a successful premium
   * payment. Renewals stack on any remaining time. entityId carries the plan.
   */
  private async grantPremium(payment: Payment): Promise<void> {
    const parts = (payment.entityId || "").split(":");
    const tier = parts[1] || "pro";
    const period = parts[2] === "yearly" ? "yearly" : "monthly";
    const userId = payment.userId.toString();
    const now = new Date();
    const existing = await this.userModel
      .findById(userId)
      .select("premiumExpiresAt name email")
      .lean<{ premiumExpiresAt?: Date; name?: string; email?: string }>()
      .exec();
    const base =
      existing?.premiumExpiresAt && new Date(existing.premiumExpiresAt) > now
        ? new Date(existing.premiumExpiresAt)
        : now;
    const days = period === "yearly" ? 365 : 30;
    const premiumExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await this.userModel.findByIdAndUpdate(userId, {
      isPremium: true,
      premiumTier: tier,
      premiumExpiresAt,
      // Stamp the start of THIS paid period so the 3-day money-back
      // cancellation window is measured from the charge, not the expiry.
      premiumStartedAt: now,
      // New paid period - clear the "expiring soon" nudge flag so the
      // renewal cron can remind again as THIS period nears its end.
      $unset: { premiumRenewalRemindedAt: "" },
    });
    // Count the promo redemption once the charge actually cleared.
    const promoCode = (payment as { metadata?: Record<string, string> })
      .metadata?.promoCode;
    if (promoCode) {
      await this.promoCodeModel
        .updateOne(
          { code: promoCode },
          { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } },
        )
        .exec()
        .catch(() => undefined);
    }
    this.logger.log(
      `Granted premium (${tier}/${period}) to user ${userId} until ${premiumExpiresAt.toISOString()}`,
    );
    // Fire-and-forget notifications (never let a notify/email error undo the grant).
    const amountGel = Math.round(((payment.amountMinor as number) || 0) / 100);
    void this.notifyPremiumPurchase(
      userId,
      existing?.name || "",
      existing?.email || "",
      tier,
      amountGel,
    );
  }

  /**
   * After a successful premium charge: confirm to the buyer (in-app + email)
   * and alert every admin (in-app + email) so the team sees revenue in real
   * time. Best-effort: any failure here is logged, never thrown.
   */
  private async notifyPremiumPurchase(
    buyerId: string,
    buyerName: string,
    buyerEmail: string,
    tier: string,
    amountGel: number,
  ): Promise<void> {
    const tierLabel = tier === "elite" ? "Super Pro" : "Pro";

    // 1) Confirm to the buyer.
    try {
      await this.notifications.notify(
        buyerId,
        NotificationType.PREMIUM_PURCHASED,
        "Premium activated",
        `Your ${tierLabel} plan is now active.`,
        {
          link: "/pro/premium",
          i18n: {
            titleKey: "notifications.types.premium_purchased.title",
            messageKey: "notifications.types.premium_purchased.message",
            params: { tier: tierLabel },
          },
        },
      );
    } catch (err) {
      this.logger.warn(`buyer premium notify failed: ${(err as Error).message}`);
    }
    if (buyerEmail) {
      await this.emailService
        .sendPremiumPurchaseConfirmation(buyerEmail, { tierLabel, amountGel })
        .catch((err) =>
          this.logger.warn(`buyer premium email failed: ${err?.message}`),
        );
    }

    // 2) Alert all admins (in-app + email).
    try {
      const admins = await this.userModel
        .find({ role: "admin" })
        .select("_id email")
        .lean<Array<{ _id: Types.ObjectId; email?: string }>>();
      const who = buyerName || "A pro";
      await Promise.all(
        admins.map((a) =>
          this.notifications.notify(
            String(a._id),
            NotificationType.ADMIN_PREMIUM_PURCHASE,
            "New premium purchase",
            `${who} bought ${tierLabel} (${amountGel} ₾)`,
            {
              link: "/admin/premium-purchases",
              i18n: {
                titleKey: "notifications.types.admin_premium_purchase.title",
                messageKey: "notifications.types.admin_premium_purchase.message",
                params: { name: who, tier: tierLabel, amount: amountGel },
              },
            },
          ),
        ),
      );
      await Promise.all(
        admins
          .filter((a) => a.email)
          .map((a) =>
            this.emailService
              .sendPremiumPurchaseAdminAlert(a.email as string, {
                tierLabel,
                amountGel,
                buyerName: who,
                buyerEmail,
              })
              .catch((err) =>
                this.logger.warn(`admin premium email failed: ${err?.message}`),
              ),
          ),
      );
    } catch (err) {
      this.logger.warn(`admin premium notify failed: ${(err as Error).message}`);
    }
  }

  // A premium plan can be cancelled for a full refund only within this many
  // days of starting it. After that it simply runs to expiry (no auto-renew).
  private static readonly PREMIUM_REFUND_WINDOW_DAYS = 3;

  /**
   * Cancel an active premium subscription within the money-back window.
   * Refunds the latest premium charge (if any - manual grants have none) and
   * revokes premium immediately. Rejects once the window has passed, since a
   * non-renewing plan has nothing left to cancel.
   */
  async cancelPremiumWithinWindow(
    userId: string,
  ): Promise<{ refunded: boolean }> {
    const user = await this.userModel
      .findById(userId)
      .select("isPremium premiumStartedAt")
      .lean<{ isPremium?: boolean; premiumStartedAt?: Date }>()
      .exec();
    if (!user || !user.isPremium) {
      throw new BadRequestException("No active premium subscription");
    }

    const windowMs =
      PaymentsService.PREMIUM_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const startedAt = user.premiumStartedAt
      ? new Date(user.premiumStartedAt).getTime()
      : NaN;
    if (Number.isNaN(startedAt) || Date.now() - startedAt > windowMs) {
      throw new BadRequestException(
        "The cancellation window has passed. Your plan stays active until it expires and will not renew.",
      );
    }

    // Refund the most recent premium charge, if there is one. Wrapped so a
    // provider hiccup never blocks the revoke - ops reconciles a failed
    // refund manually rather than leaving the pro paying for a cancelled plan.
    let refunded = false;
    const payment = await this.paymentModel
      .findOne({
        userId: new Types.ObjectId(userId),
        entityType: "premium",
        status: { $in: ["succeeded", "partially_refunded"] },
      })
      .sort({ createdAt: -1 })
      .exec();
    if (payment) {
      const remaining = payment.amountMinor - payment.refundedAmountMinor;
      if (remaining > 0) {
        try {
          const provider = this.providers.getByName(payment.provider);
          await provider.refund({
            intentId: payment.providerIntentId,
            amountMinor: remaining,
            reason: "premium_cancel_within_window",
          });
          payment.refundedAmountMinor += remaining;
          payment.status = "refunded";
          await payment.save();
          refunded = true;
        } catch (err) {
          this.logger.error(
            `Premium refund failed for user ${userId}; revoking anyway: ${err}`,
          );
        }
      }
    }

    await this.userModel.findByIdAndUpdate(userId, {
      isPremium: false,
      premiumTier: "none",
      premiumExpiresAt: new Date(),
      $unset: { premiumStartedAt: "", premiumRenewalRemindedAt: "" },
    });
    this.logger.log(
      `Cancelled premium for user ${userId} (refunded=${refunded})`,
    );
    return { refunded };
  }

  /**
   * Webhook handler entry point. The controller has already pulled the raw
   * body + headers and provider name from the URL; we verify the signature
   * via the matching provider, then update Payment + create Escrow on
   * success.
   *
   * Idempotent: re-processing the same webhook is safe. Returns the final
   * Payment state.
   */
  async handleProviderWebhook(
    providerName: PaymentProviderName,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<{ paymentId: string; status: PaymentStatus }> {
    const provider = this.providers.getByName(providerName);
    const decoded = await provider.verifyAndDecodeWebhook(rawBody, headers);

    const payment = await this.paymentModel
      .findOne({
        provider: providerName,
        providerIntentId: decoded.intentId,
      })
      .exec();

    if (!payment) {
      // Unknown intent. Could be a stray webhook from a deleted record or
      // a different environment - log and drop rather than 500.
      this.logger.warn(
        `Webhook for unknown intent: ${providerName}:${decoded.intentId}`,
      );
      throw new NotFoundException("Payment intent not found");
    }

    if (payment.status === "succeeded" || payment.status === "failed") {
      // Already in terminal state from a prior webhook. Idempotent no-op.
      this.logger.log(
        `Webhook re-delivery for ${decoded.intentId} (status=${payment.status}), ignoring`,
      );
      return { paymentId: String(payment._id), status: payment.status };
    }

    if (decoded.status === "succeeded") {
      // Atomically claim the pending->succeeded transition so a concurrent
      // reconcile (return page) can't also run the grant/escrow. Only the
      // caller that wins the claim runs the side-effects; the loser is a no-op.
      const claimed = await this.paymentModel.findOneAndUpdate(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            status: "succeeded",
            succeededAt: new Date(),
            providerRawData: decoded.rawProviderData,
          },
        },
        { new: true },
      );
      if (claimed) {
        // Premium and product_order are platform charges (no pro payee / escrow).
        // Premium grants the subscription; product_order is handled by the orders
        // module's own syncPaymentStatus. Everything else holds money in escrow.
        if (claimed.entityType === "premium") {
          await this.grantPremium(claimed);
        } else if (claimed.entityType !== "product_order") {
          await this.createEscrow(claimed);
        }
        this.logger.log(`Webhook processed: ${decoded.intentId} -> succeeded`);
        return { paymentId: String(claimed._id), status: claimed.status };
      }
      // Lost the race: another path already finalized it. Idempotent no-op.
      const latest = await this.paymentModel.findById(payment._id).exec();
      this.logger.log(
        `Webhook re-entry for ${decoded.intentId}: already finalized, skipping grant`,
      );
      return {
        paymentId: String(payment._id),
        status: (latest ?? payment).status,
      };
    } else {
      payment.status = decoded.status === "cancelled" ? "cancelled" : "failed";
      payment.providerRawData = decoded.rawProviderData;
      await payment.save();
    }

    this.logger.log(
      `Webhook processed: ${decoded.intentId} -> ${payment.status}`,
    );

    return { paymentId: String(payment._id), status: payment.status };
  }

  /**
   * Reconciliation path. When a user returns to our site at the returnUrl,
   * the webhook may not have arrived yet (network delay, ngrok in dev,
   * etc). The frontend calls this to ask the provider's API directly and
   * update our records.
   */
  async reconcileFromReturnUrl(
    paymentId: string,
    requestingUserId?: string,
  ): Promise<PaymentDoc> {
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment) throw new NotFoundException("Payment not found");

    // Ownership gate BEFORE any side-effect. When called from the user-facing
    // controller, `requestingUserId` is set and a user may only reconcile their
    // OWN payment. Internal server callers (bookings/jobs/orders/milestones)
    // omit it and are trusted. Without this, anyone could drive another user's
    // pending payment to "succeeded" and trigger the grant/escrow on them.
    if (requestingUserId && String(payment.userId) !== requestingUserId) {
      throw new ForbiddenException("Not your payment");
    }

    if (payment.status !== "pending") {
      // Already in terminal state - just record the return.
      payment.returnedAt = new Date();
      await payment.save();
      return payment.toObject() as PaymentDoc;
    }

    const provider = this.providers.getByName(payment.provider);
    const status = await provider.fetchIntentStatus(payment.providerIntentId);

    if (status.status === "succeeded") {
      // Atomically claim the pending->succeeded transition so a concurrent
      // webhook + reconcile (or double reconcile) can't both run the grant -
      // which would double-charge-grant / stack the premium expiry. Only the
      // caller that wins the claim runs the side-effects.
      const claimed = await this.paymentModel.findOneAndUpdate(
        { _id: payment._id, status: "pending" },
        { $set: { status: "succeeded", succeededAt: new Date(), returnedAt: new Date() } },
        { new: true },
      );
      if (claimed) {
        // premium + product_order are platform charges (no escrow).
        if (claimed.entityType === "premium") {
          await this.grantPremium(claimed);
        } else if (claimed.entityType !== "product_order") {
          await this.createEscrow(claimed);
        }
        return claimed.toObject() as PaymentDoc;
      }
      // Lost the race: another path already finalized it. Return the latest.
      const latest = await this.paymentModel.findById(payment._id).exec();
      return (latest ?? payment).toObject() as PaymentDoc;
    } else if (status.status === "failed" || status.status === "cancelled") {
      payment.status = status.status;
      payment.returnedAt = new Date();
      await payment.save();
    } else {
      // Still pending - frontend will retry.
      payment.returnedAt = new Date();
      await payment.save();
    }

    return payment.toObject() as PaymentDoc;
  }

  /**
   * Issue a refund. Caller specifies the amount; for a full refund pass
   * the original amountMinor. The Escrow + Payment are updated atomically.
   *
   * NB: this only initiates the refund at the provider. The actual money
   * movement happens on the provider's side (usually 3-5 business days).
   */
  async refundForEntity(
    entityType: PaymentEntityType,
    entityId: string,
    amountMinor: number,
    reason: string,
  ): Promise<{ refundId: string; remainingMinor: number }> {
    if (amountMinor <= 0) {
      throw new BadRequestException("amountMinor must be > 0");
    }

    const payment = await this.paymentModel
      .findOne({ entityType, entityId, status: { $in: ["succeeded", "partially_refunded"] } })
      .exec();
    if (!payment) {
      throw new NotFoundException(
        `No succeeded payment found for ${entityType}:${entityId}`,
      );
    }

    const remaining = payment.amountMinor - payment.refundedAmountMinor;
    if (amountMinor > remaining) {
      throw new BadRequestException(
        `Refund ${amountMinor} exceeds remaining ${remaining}`,
      );
    }

    const provider = this.providers.getByName(payment.provider);
    const { refundId } = await provider.refund({
      intentId: payment.providerIntentId,
      amountMinor,
      reason,
    });

    payment.refundedAmountMinor += amountMinor;
    payment.status =
      payment.refundedAmountMinor >= payment.amountMinor
        ? "refunded"
        : "partially_refunded";
    await payment.save();

    // Mirror onto the escrow.
    const escrow = await this.escrowModel
      .findOne({ entityType, entityId })
      .exec();
    if (escrow) {
      escrow.refundedAmountMinor += amountMinor;
      if (escrow.refundedAmountMinor >= escrow.amountHeldMinor) {
        escrow.status = "refunded";
      } else {
        escrow.status = "partially_refunded";
      }
      escrow.refundedAt = new Date();
      await escrow.save();
    }

    this.logger.log(
      `Refunded ${amountMinor} from payment ${payment._id} (${entityType}:${entityId}). Reason: ${reason}`,
    );

    return {
      refundId,
      remainingMinor: payment.amountMinor - payment.refundedAmountMinor,
    };
  }

  /**
   * Find the latest Payment for an entity. Used by callers (BookingsService)
   * that need to render payment status alongside the entity.
   */
  async findLatestPaymentForEntity(
    entityType: PaymentEntityType,
    entityId: string,
  ): Promise<PaymentDoc | null> {
    return this.paymentModel
      .findOne({ entityType, entityId })
      .sort({ createdAt: -1 })
      .lean<PaymentDoc>()
      .exec();
  }

  /**
   * Compact projection for the frontend pay page. Returns just what the UI
   * needs to render the "Pay X with [provider]" button - no internal IDs,
   * no provider raw data. Returns null when no payment intent exists yet.
   */
  async findPaymentSummaryForEntity(
    entityType: PaymentEntityType,
    entityId: string,
  ): Promise<{
    paymentId: string;
    status: PaymentStatus;
    amountMinor: number;
    currency: string;
    provider: string;
    redirectUrl?: string;
  } | null> {
    const payment = await this.findLatestPaymentForEntity(entityType, entityId);
    if (!payment) return null;
    return {
      paymentId: String(payment._id),
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      provider: payment.provider,
      redirectUrl: payment.redirectUrl,
    };
  }

  async findEscrowForEntity(
    entityType: PaymentEntityType,
    entityId: string,
  ): Promise<EscrowDoc | null> {
    return this.escrowModel
      .findOne({ entityType, entityId })
      .lean<EscrowDoc>()
      .exec();
  }

  /**
   * Flip a held escrow to PENDING_RELEASE - signals the admin payouts UI
   * (Task #6) that this money is ready to be batched into a payout to the
   * pro. Idempotent: re-calling on an already-pending escrow is a no-op.
   * Refuses to transition from any state other than `held` to avoid
   * accidentally re-releasing a refunded/disputed escrow.
   */
  async markEscrowPendingRelease(escrowId: string): Promise<void> {
    if (!Types.ObjectId.isValid(escrowId)) {
      throw new BadRequestException('Invalid escrowId');
    }
    const escrow = await this.escrowModel.findById(escrowId).exec();
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.status === 'pending_release') return;
    // Allow transition from `held` (normal completion) AND from
    // `partially_refunded` (cancellation 50/50 split: client refund
    // already issued, remaining portion is owed to the pro).
    if (escrow.status !== 'held' && escrow.status !== 'partially_refunded') {
      throw new BadRequestException(
        `Cannot mark escrow as pending_release from status ${escrow.status}`,
      );
    }
    escrow.status = 'pending_release';
    await escrow.save();
    this.logger.log(`Escrow ${escrowId} -> pending_release`);
  }

  /**
   * Freeze an escrow because a dispute was raised. Used by BookingsService
   * when either party presses "report issue". The escrow is unfrozen by
   * the admin resolving the dispute via the admin dispute UI (Task #5).
   *
   * Allowed from any non-terminal state: `held` (during work) and
   * `pending_release` (between client-confirm and payout - rare but
   * possible if client confirms then changes mind within minutes).
   */
  async markEscrowInDispute(
    escrowId: string,
    disputeId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(escrowId)) {
      throw new BadRequestException('Invalid escrowId');
    }
    const escrow = await this.escrowModel.findById(escrowId).exec();
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.status === 'in_dispute') return;
    if (escrow.status !== 'held' && escrow.status !== 'pending_release') {
      throw new BadRequestException(
        `Cannot dispute escrow from status ${escrow.status}`,
      );
    }
    escrow.status = 'in_dispute';
    escrow.disputeId = new Types.ObjectId(disputeId);
    await escrow.save();
    this.logger.log(`Escrow ${escrowId} -> in_dispute (dispute ${disputeId})`);
  }

  // ---- Dispute admin operations ----

  /**
   * List disputes for the admin queue. Default sort: open disputes first
   * (so the oldest unresolved ones are most visible), then resolved/rejected
   * in reverse-chronological order.
   *
   * Phase 1 takes no filtering beyond status. As volume grows (Phase 3)
   * add type / raisedBy / amount filters.
   */
  async listDisputes(opts: {
    status?: DisputeStatus;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: DisputeDoc[];
    total: number;
    openCount: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;

    const filter: { status?: DisputeStatus } = {};
    if (opts.status) filter.status = opts.status;

    const [data, total, openCount] = await Promise.all([
      this.disputeModel
        .find(filter)
        .sort({ status: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<DisputeDoc[]>()
        .exec(),
      this.disputeModel.countDocuments(filter).exec(),
      this.disputeModel.countDocuments({ status: 'open' }).exec(),
    ]);

    return { data, total, openCount, page, limit };
  }

  async findDisputeById(disputeId: string): Promise<DisputeDoc | null> {
    if (!Types.ObjectId.isValid(disputeId)) return null;
    return this.disputeModel.findById(disputeId).lean<DisputeDoc>().exec();
  }

  async getPendingDisputeCount(): Promise<number> {
    return this.disputeModel.countDocuments({ status: 'open' }).exec();
  }

  /**
   * Admin resolves a dispute. The resolution determines how the escrow
   * money moves:
   *
   *   resolved_for_client -> full refund, escrow status: refunded
   *   resolved_for_pro    -> escrow -> pending_release (full payout to pro)
   *   split               -> partial refund + remaining to pro (admin
   *                          specifies amounts; sum must equal amountHeld)
   *   rejected            -> no client refund, escrow -> pending_release
   *                          (treated like a no-op dispute that should not
   *                          have been raised)
   *
   * Returns the updated Dispute doc. Booking-side reflection (status:
   * COMPLETED or PARTIALLY_REFUNDED, paymentStatus updates) is handled by
   * BookingsService.syncPaymentStatus on next fetch.
   */
  async resolveDispute(opts: {
    disputeId: string;
    adminUserId: string;
    resolution: 'resolved_for_client' | 'resolved_for_pro' | 'split' | 'rejected';
    refundAmountMinor?: number;
    payoutAmountMinor?: number;
    note?: string;
  }): Promise<DisputeDoc> {
    const { disputeId, adminUserId, resolution, refundAmountMinor, payoutAmountMinor, note } = opts;

    if (!Types.ObjectId.isValid(disputeId)) {
      throw new BadRequestException('Invalid disputeId');
    }
    if (!Types.ObjectId.isValid(adminUserId)) {
      throw new BadRequestException('Invalid adminUserId');
    }
    // Cap the resolution note so an admin can't paste a 100KB document
    // that ends up rendered on the user-visible dispute history view.
    if (note && note.length > 2000) {
      throw new BadRequestException(
        'Resolution note is too long (max 2000 characters)',
      );
    }

    const dispute = await this.disputeModel.findById(disputeId).exec();
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== 'open') {
      throw new BadRequestException(
        `Dispute already resolved (status: ${dispute.status})`,
      );
    }

    const escrow = await this.escrowModel.findById(dispute.escrowId).exec();
    if (!escrow) throw new NotFoundException('Escrow not found');
    if (escrow.status !== 'in_dispute') {
      throw new BadRequestException(
        `Escrow is not in dispute (status: ${escrow.status}) - cannot resolve`,
      );
    }

    // Compute the final money split based on resolution + admin inputs.
    const totalHeld = escrow.amountHeldMinor;
    let finalRefundMinor = 0;
    let finalPayoutMinor = 0;

    switch (resolution) {
      case 'resolved_for_client':
        finalRefundMinor = totalHeld;
        finalPayoutMinor = 0;
        break;
      case 'resolved_for_pro':
      case 'rejected':
        finalRefundMinor = 0;
        finalPayoutMinor = totalHeld;
        break;
      case 'split':
        // Admin provides the explicit split; we enforce that it sums to the
        // total held so the books always balance.
        if (refundAmountMinor === undefined || payoutAmountMinor === undefined) {
          throw new BadRequestException(
            'Split resolution requires refundAmountMinor + payoutAmountMinor',
          );
        }
        if (refundAmountMinor < 0 || payoutAmountMinor < 0) {
          throw new BadRequestException('Split amounts must be non-negative');
        }
        if (refundAmountMinor + payoutAmountMinor !== totalHeld) {
          throw new BadRequestException(
            `Split amounts (${refundAmountMinor} + ${payoutAmountMinor}) must sum to ${totalHeld}`,
          );
        }
        finalRefundMinor = refundAmountMinor;
        finalPayoutMinor = payoutAmountMinor;
        break;
    }

    // 1. Issue refund if any. We need to lift the escrow out of in_dispute
    //    BEFORE refundForEntity touches it (that method expects refundable
    //    payment status), so we transition to a temporary state by direct
    //    update.
    if (finalRefundMinor > 0) {
      // refundForEntity reads the Payment (not the escrow status) to decide
      // if a refund is allowed. It'll succeed because Payment.status is
      // 'succeeded'. The mirror onto Escrow updates refundedAmount + status.
      // Reset escrow status briefly so refundForEntity's mirror succeeds.
      escrow.status = finalRefundMinor === totalHeld ? 'held' : 'held';
      await escrow.save();
      try {
        await this.refundForEntity(
          escrow.entityType,
          escrow.entityId,
          finalRefundMinor,
          `Dispute resolution (${resolution}): ${note ?? 'no note'}`,
        );
      } catch (err) {
        // Re-flag dispute on refund failure so admin sees + can retry.
        escrow.status = 'in_dispute';
        await escrow.save();
        this.logger.error(
          `Dispute ${disputeId} refund failed: ${(err as Error).message}`,
        );
        throw err;
      }
    }

    // 2. Move remaining money to pending_release if pro should be paid.
    if (finalPayoutMinor > 0) {
      const fresh = await this.escrowModel.findById(escrow._id).exec();
      if (fresh) {
        // refundForEntity may have transitioned escrow to partially_refunded
        // or left it at 'held' if no refund happened. Both are valid sources
        // for markEscrowPendingRelease.
        if (fresh.status === 'held' || fresh.status === 'partially_refunded') {
          fresh.status = 'pending_release';
          await fresh.save();
          this.logger.log(
            `Escrow ${fresh._id} -> pending_release (dispute resolution ${resolution})`,
          );
        }
      }
    }

    // 3. Record the resolution on the dispute doc.
    dispute.status = resolution;
    dispute.refundAmountMinor = finalRefundMinor;
    dispute.payoutAmountMinor = finalPayoutMinor;
    dispute.resolution = note;
    dispute.resolvedByUserId = new Types.ObjectId(adminUserId);
    dispute.resolvedAt = new Date();
    await dispute.save();

    this.logger.log(
      `Dispute ${disputeId} resolved (${resolution}) by admin ${adminUserId}: refund=${finalRefundMinor} payout=${finalPayoutMinor}`,
    );

    return dispute.toObject() as DisputeDoc;
  }

  // ---- Payouts (admin batches escrows -> Pro payout) ----

  /**
   * Compute the pro's net payout from an escrow. Platform fee is applied
   * proportionally to what wasn't refunded - so if 50% was refunded on a
   * cancellation, Homico's fee is also halved. This is fairer than the
   * "keep full fee" policy at the cost of admin reporting clarity.
   *
   * Math: pro receives (held - refunded) * (1 - feeRate), floored to the
   * nearest minor unit (fractional tetri goes to Homico).
   */
  private computeProPayoutMinor(escrow: {
    amountHeldMinor: number;
    refundedAmountMinor: number;
  }): number {
    const proGross = escrow.amountHeldMinor - escrow.refundedAmountMinor;
    if (proGross <= 0) return 0;
    return Math.floor(proGross * (1 - PLATFORM_FEE_RATE));
  }

  /**
   * A user's own payment history (payments they made as the payer - bookings,
   * job hires, premium). Read-only; the frontend renders amount/status/date.
   * Capped at 100, newest first.
   */
  async getMyPayments(userId: string): Promise<
    Array<{
      id: string;
      amountMinor: number;
      currency: string;
      status: PaymentStatus;
      entityType: PaymentEntityType;
      entityId: string;
      refundedAmountMinor: number;
      createdAt: Date;
      succeededAt?: Date;
    }>
  > {
    const payments = await this.paymentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean<PaymentDoc[]>()
      .exec();
    return payments.map((p) => ({
      id: String(p._id),
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      entityType: p.entityType,
      entityId: p.entityId,
      refundedAmountMinor: p.refundedAmountMinor ?? 0,
      createdAt: p.createdAt,
      succeededAt: p.succeededAt,
    }));
  }

  /**
   * Pro-side summary: how many escrows the authenticated pro has waiting
   * for payout and the total amount they'll receive once admin
   * processes the batch. Used by /settings/payouts to show a "you have
   * X GEL waiting" banner that nudges the pro to set up their bank
   * account if they haven't yet - silent escrows are a UX dead-end.
   */
  async getPendingPayoutSummaryForPro(proUserId: string): Promise<{
    count: number;
    totalPayoutMinor: number;
    currency: string;
    oldestEscrowAt: Date | null;
  }> {
    const escrows = await this.escrowModel
      .find({
        payeeUserId: new Types.ObjectId(proUserId),
        status: "pending_release",
      })
      .sort({ createdAt: 1 })
      .lean<EscrowDoc[]>()
      .exec();

    if (escrows.length === 0) {
      return {
        count: 0,
        totalPayoutMinor: 0,
        currency: "GEL",
        oldestEscrowAt: null,
      };
    }

    const totalPayoutMinor = escrows.reduce(
      (acc, e) => acc + this.computeProPayoutMinor(e),
      0,
    );
    return {
      count: escrows.length,
      totalPayoutMinor,
      currency: escrows[0].currency ?? "GEL",
      oldestEscrowAt: escrows[0].createdAt ?? null,
    };
  }

  /**
   * Admin view: all escrows in pending_release status, grouped by pro,
   * with the pro's bank account snapshot and computed payout amount per
   * escrow. Frontend renders this as one card per pro with a "Process
   * payout" button that batches all the pro's escrows into a Payout.
   */
  async listPendingPayouts(): Promise<{
    pros: Array<{
      proUserId: string;
      name: string;
      phone?: string;
      uid?: number;
      bankAccount: {
        bankCode: string;
        accountNumber: string;
        holderName: string;
        verifiedAt?: Date;
      } | null;
      escrows: Array<{
        escrowId: string;
        entityType: PaymentEntityType;
        entityId: string;
        amountHeldMinor: number;
        refundedAmountMinor: number;
        payoutAmountMinor: number;
        currency: string;
        createdAt: Date;
      }>;
      totalPayoutMinor: number;
      currency: string;
    }>;
  }> {
    const escrows = await this.escrowModel
      .find({ status: "pending_release" })
      .sort({ createdAt: 1 })
      .lean<EscrowDoc[]>()
      .exec();

    if (escrows.length === 0) return { pros: [] };

    // Group by payeeUserId in one pass.
    const byPro = new Map<string, EscrowDoc[]>();
    for (const e of escrows) {
      const key = String(e.payeeUserId);
      const bucket = byPro.get(key) ?? [];
      bucket.push(e);
      byPro.set(key, bucket);
    }

    // Hydrate pro user info in one query (avoid N+1).
    const proIds = Array.from(byPro.keys()).map((id) => new Types.ObjectId(id));
    const proDocs = await this.userModel
      .find({ _id: { $in: proIds } })
      .select("name phone uid bankAccount")
      .lean<
        Array<{
          _id: Types.ObjectId;
          name?: string;
          phone?: string;
          uid?: number;
          bankAccount?: {
            bankCode: string;
            accountNumber: string;
            holderName: string;
            verifiedAt?: Date;
          };
        }>
      >()
      .exec();
    const proById = new Map(proDocs.map((p) => [String(p._id), p]));

    const pros = Array.from(byPro.entries()).map(([proUserId, proEscrows]) => {
      const proInfo = proById.get(proUserId);
      const escrowsOut = proEscrows.map((e) => ({
        escrowId: String(e._id),
        entityType: e.entityType,
        entityId: e.entityId,
        amountHeldMinor: e.amountHeldMinor,
        refundedAmountMinor: e.refundedAmountMinor,
        payoutAmountMinor: this.computeProPayoutMinor(e),
        currency: e.currency,
        createdAt: e.createdAt,
      }));
      const totalPayoutMinor = escrowsOut.reduce(
        (sum, e) => sum + e.payoutAmountMinor,
        0,
      );
      return {
        proUserId,
        name: proInfo?.name ?? "Unknown pro",
        phone: proInfo?.phone,
        uid: proInfo?.uid,
        bankAccount: proInfo?.bankAccount ?? null,
        escrows: escrowsOut,
        totalPayoutMinor,
        currency: escrowsOut[0]?.currency ?? "GEL",
      };
    });

    // Stable sort: pros with verified bank accounts first, then by total
    // payout desc. Surfaces what's actually actionable to the admin.
    pros.sort((a, b) => {
      const aReady = a.bankAccount?.verifiedAt ? 1 : 0;
      const bReady = b.bankAccount?.verifiedAt ? 1 : 0;
      if (aReady !== bReady) return bReady - aReady;
      return b.totalPayoutMinor - a.totalPayoutMinor;
    });

    return { pros };
  }

  /**
   * Process a batch payout for one pro: validates that all escrows are in
   * pending_release status and owned by the pro, snapshots the pro's bank
   * account, creates a Payout doc, and flips all escrows to released.
   *
   * Phase 1: admin manually performs the actual bank transfer externally
   * and pastes the transfer reference here. Phase 3 automates via Flitt's
   * outgoing-transfer API.
   */
  async processPayout(opts: {
    adminUserId: string;
    proUserId: string;
    escrowIds: string[];
    transferReference?: string;
    notes?: string;
  }): Promise<PayoutDoc> {
    if (opts.escrowIds.length === 0) {
      throw new BadRequestException("At least one escrow is required");
    }
    // Validate every escrow id BEFORE constructing ObjectIds so a stray
    // non-hex value returns a clean 400 instead of a CastError 500.
    // Same defensive validation we added on other admin endpoints.
    for (const id of opts.escrowIds) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid escrow id: ${id}`);
      }
    }
    if (!Types.ObjectId.isValid(opts.proUserId)) {
      throw new BadRequestException("Invalid pro id");
    }
    // Cap optional metadata so an admin can't paste a 100KB note that
    // bloats every payout document and breaks the admin queue render.
    if (opts.transferReference && opts.transferReference.length > 200) {
      throw new BadRequestException(
        "Transfer reference is too long (max 200 characters)",
      );
    }
    if (opts.notes && opts.notes.length > 2000) {
      throw new BadRequestException(
        "Payout notes are too long (max 2000 characters)",
      );
    }

    const pro = await this.userModel.findById(opts.proUserId).exec();
    if (!pro) throw new NotFoundException("Pro not found");
    if (!pro.bankAccount) {
      throw new BadRequestException(
        "Pro has not provided bank account - cannot process payout",
      );
    }

    const escrowObjectIds = opts.escrowIds.map((id) => new Types.ObjectId(id));
    const escrows = await this.escrowModel
      .find({ _id: { $in: escrowObjectIds } })
      .exec();

    if (escrows.length !== opts.escrowIds.length) {
      throw new BadRequestException("One or more escrows not found");
    }

    // Defensive checks: all escrows must be pending_release AND belong
    // to this pro. Catches admin mistakes (pasted wrong proId, stale UI).
    for (const e of escrows) {
      if (e.status !== "pending_release") {
        throw new BadRequestException(
          `Escrow ${e._id} is in status ${e.status}, not pending_release`,
        );
      }
      if (String(e.payeeUserId) !== opts.proUserId) {
        throw new BadRequestException(
          `Escrow ${e._id} belongs to a different pro`,
        );
      }
    }

    const totalPayoutMinor = escrows.reduce(
      (sum, e) => sum + this.computeProPayoutMinor(e),
      0,
    );
    const currency = escrows[0]?.currency ?? "GEL";

    // Snapshot the bank account at processing time so historical payouts
    // are reproducible even if the pro changes their bank later.
    const snapshot = {
      bankCode: pro.bankAccount.bankCode,
      accountNumber: pro.bankAccount.accountNumber,
      holderName: pro.bankAccount.holderName,
    };

    const payout = await this.payoutModel.create({
      proUserId: new Types.ObjectId(opts.proUserId),
      escrowIds: escrowObjectIds,
      totalAmountMinor: totalPayoutMinor,
      currency,
      status: "processed",
      proBankAccountSnapshot: snapshot,
      transferReference: opts.transferReference,
      processedByUserId: new Types.ObjectId(opts.adminUserId),
      processedAt: new Date(),
      notes: opts.notes,
    });

    // Flip all escrows to released + link the payout id.
    await Promise.all(
      escrows.map((e) => {
        e.status = "released";
        e.releasedAt = new Date();
        e.releasedToPayoutId = payout._id as Types.ObjectId;
        return e.save();
      }),
    );

    this.logger.log(
      `Payout ${payout._id} processed: pro=${opts.proUserId} total=${totalPayoutMinor} ${currency} escrows=${opts.escrowIds.length}`,
    );

    return payout.toObject() as PayoutDoc;
  }

  /**
   * List recent payouts for admin history view. Admin can also filter by
   * pro (for support: "show me all payouts to pro X").
   */
  async listPayouts(opts: {
    proUserId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    data: PayoutDoc[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;

    const filter: { proUserId?: Types.ObjectId } = {};
    if (opts.proUserId) {
      filter.proUserId = new Types.ObjectId(opts.proUserId);
    }

    const [data, total] = await Promise.all([
      this.payoutModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<PayoutDoc[]>()
        .exec(),
      this.payoutModel.countDocuments(filter).exec(),
    ]);

    return { data, total, page, limit };
  }

  // ---- internals ----

  private async createEscrow(payment: Payment): Promise<EscrowDoc> {
    // Idempotent - if escrow already exists for this entity, return it.
    const existing = await this.escrowModel
      .findOne({ entityType: payment.entityType, entityId: payment.entityId })
      .exec();
    if (existing) {
      return existing.toObject() as EscrowDoc;
    }

    const platformFeeMinor = Math.round(payment.amountMinor * PLATFORM_FEE_RATE);

    let escrow;
    try {
      escrow = await this.escrowModel.create({
        entityType: payment.entityType,
        entityId: payment.entityId,
        paymentId: payment._id,
        payerUserId: payment.userId,
        payeeUserId: payment.payeeUserId,
        amountHeldMinor: payment.amountMinor,
        platformFeeMinor,
        currency: payment.currency,
        status: "held",
        refundedAmountMinor: 0,
      });
    } catch (err) {
      // Lost a race with a concurrent payment-success path - the unique index
      // on (entityType, entityId) rejected the second insert. Resolve to the
      // escrow the winner created instead of erroring.
      if ((err as { code?: number })?.code === 11000) {
        const existing = await this.escrowModel
          .findOne({ entityType: payment.entityType, entityId: payment.entityId })
          .exec();
        if (existing) return existing.toObject() as EscrowDoc;
      }
      throw err;
    }

    this.logger.log(
      `Escrow created for ${payment.entityType}:${payment.entityId} amount=${payment.amountMinor} fee=${platformFeeMinor}`,
    );

    return escrow.toObject() as EscrowDoc;
  }
}
