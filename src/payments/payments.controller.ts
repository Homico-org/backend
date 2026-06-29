import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { UserRole } from "../users/schemas/user.schema";
import { PaymentsService } from "./payments.service";
import { PaymentProviderName } from "./providers/payment-provider.interface";

/**
 * Payments API surface. Three distinct callers:
 *   1. Payment providers - hit the webhook endpoint with signed payloads
 *      (public, signature-verified inside the service).
 *   2. The frontend after a user returns to our return URL - hits the
 *      reconcile endpoint to fast-path payment status before webhooks land.
 *   3. Admins - read payment/escrow records via the admin endpoints.
 *
 * Booking-level operations (create intent, refund, raise dispute) live on
 * BookingsController so they're guarded by booking ownership, not exposed
 * as raw payment operations.
 */

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Provider webhook. URL path includes the provider name so we know which
   * implementation to ask for signature verification. Raw body is required
   * by most providers' signature schemes - relies on app-level rawBody
   * support (NestJSFactory.create(..., { rawBody: true }) or per-route
   * middleware).
   */
  @Post("webhooks/:provider")
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: "Payment provider webhook (signature-verified)" })
  async webhook(
    @Param("provider") providerName: PaymentProviderName,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody = req.rawBody?.toString("utf8") ?? JSON.stringify(req.body ?? {});
    const result = await this.paymentsService.handleProviderWebhook(
      providerName,
      rawBody,
      headers,
    );
    return { ok: true, status: result.status };
  }

  /**
   * Frontend calls this when the user lands on the return URL. Forces a
   * status re-fetch from the provider so the UI can show the right state
   * even if the webhook is delayed. Requires login - users can only
   * reconcile their own payments.
   */
  @Get(":id/reconcile")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Force-refresh payment status from the provider" })
  async reconcile(
    @Param("id") paymentId: string,
    @Req() req: { user: { userId: string } },
  ) {
    // Pass the caller so the service enforces ownership BEFORE running any
    // grant/escrow side-effect (it used to grant first, then merely mask the
    // response - letting one user trigger another's grant).
    const payment = await this.paymentsService.reconcileFromReturnUrl(
      paymentId,
      req.user.userId,
    );
    return {
      id: String(payment._id),
      status: payment.status,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      entityType: payment.entityType,
      entityId: payment.entityId,
    };
  }

  // ---- Pro: my pending payout summary ----

  /**
   * Read-only summary for the authenticated pro: how many escrows are
   * sitting in `pending_release` (i.e. waiting on admin to push the
   * payout) and what the total is. The /settings/payouts page uses this
   * to render a "you have X waiting" banner so a pro who hasn't set up
   * their bank account understands what they're missing out on.
   */
  @Get("me/pending-payout-summary")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      "Authenticated pro: count + total of their escrows waiting for payout",
  })
  async myPendingPayoutSummary(@Req() req: { user: { userId: string } }) {
    return this.paymentsService.getPendingPayoutSummaryForPro(req.user.userId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Authenticated user: their payment history" })
  async myPayments(@Req() req: { user: { userId: string } }) {
    return this.paymentsService.getMyPayments(req.user.userId);
  }

  @Post("premium/checkout")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  @ApiOperation({ summary: "Start a premium subscription payment" })
  async premiumCheckout(
    @Req() req: { user: { userId: string } },
    @Body()
    body: { tier: string; period: "monthly" | "yearly"; promoCode?: string },
  ) {
    return this.paymentsService.createPremiumIntent(
      req.user.userId,
      body.tier,
      body.period === "yearly" ? "yearly" : "monthly",
      body.promoCode,
    );
  }

  @Post("premium/preview")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Preview the premium price after a promo code" })
  async premiumPreview(
    @Req() req: { user: { userId: string } },
    @Body()
    body: { tier: string; period: "monthly" | "yearly"; promoCode?: string },
  ) {
    return this.paymentsService.previewPremiumPrice(
      body.tier,
      body.period === "yearly" ? "yearly" : "monthly",
      body.promoCode,
      req.user.userId,
    );
  }

  @Get("admin/premium-purchases")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] List premium purchases (who bought what)" })
  async listPremiumPurchases() {
    return this.paymentsService.listPremiumPurchases();
  }

  @Get("admin/super-pro-content")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Super Pro content pipeline" })
  async listSuperProContentQueue() {
    return this.paymentsService.listSuperProContentQueue();
  }

  @Patch("admin/super-pro-content/:userId")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Update a Super Pro's content status" })
  async setSuperProContentStatus(
    @Param("userId") userId: string,
    @Body("status") status: string,
  ) {
    return this.paymentsService.setSuperProContentStatus(userId, status);
  }

  @Get("admin/promo-codes")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] List promo codes" })
  async listPromoCodes() {
    return this.paymentsService.listPromoCodes();
  }

  @Post("admin/promo-codes")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Create a promo code" })
  async createPromoCode(
    @Body()
    body: {
      code: string;
      discountType: "amount_off" | "percent_off" | "fixed_price";
      value: number;
      applicableTiers?: string[];
      maxUses?: number;
      expiresAt?: string;
      note?: string;
    },
  ) {
    return this.paymentsService.createPromoCode(body);
  }

  @Patch("admin/promo-codes/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Activate / deactivate a promo code" })
  async setPromoCodeActive(
    @Param("id") id: string,
    @Body("active") active: boolean,
  ) {
    return this.paymentsService.setPromoCodeActive(id, !!active);
  }

  @Post("premium/cancel")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  @ApiOperation({
    summary: "Cancel premium within the 3-day money-back window (refunds)",
  })
  async premiumCancel(@Req() req: { user: { userId: string } }) {
    return this.paymentsService.cancelPremiumWithinWindow(req.user.userId);
  }

  // ---- Admin ----

  @Get("admin/escrows/by-entity")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Fetch the escrow for a specific entity" })
  async getEscrowByEntity(
    @Body() body: { entityType: "booking" | "project_milestone"; entityId: string },
  ) {
    return this.paymentsService.findEscrowForEntity(
      body.entityType,
      body.entityId,
    );
  }

  // ---- Admin: disputes ----

  @Get("admin/disputes")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] List disputes (open first by default)" })
  async listDisputes(
    @Req() req: Request,
  ) {
    const url = new URL(req.url, "http://x");
    const status = url.searchParams.get("status") as
      | "open"
      | "resolved_for_client"
      | "resolved_for_pro"
      | "split"
      | "rejected"
      | null;
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    return this.paymentsService.listDisputes({
      status: status ?? undefined,
      page,
      limit,
    });
  }

  @Get("admin/disputes/pending-count")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Open dispute count for nav badge" })
  async pendingDisputeCount() {
    const count = await this.paymentsService.getPendingDisputeCount();
    return { count };
  }

  @Get("admin/disputes/:id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Dispute detail (with escrow context)" })
  async getDispute(@Param("id") id: string) {
    const dispute = await this.paymentsService.findDisputeById(id);
    if (!dispute) {
      return { error: "Dispute not found" };
    }
    const escrow = await this.paymentsService.findEscrowForEntity(
      dispute.entityType,
      dispute.entityId,
    );
    return { dispute, escrow };
  }

  // ---- Admin: payouts ----

  @Get("admin/pending-payouts")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "[admin] Pending payouts grouped by pro (ready-to-pay queue)",
  })
  async pendingPayouts() {
    return this.paymentsService.listPendingPayouts();
  }

  @Post("admin/payouts")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: "[admin] Process a batch payout (marks escrows as released)",
  })
  async processPayout(
    @Req() req: { user: { userId: string } },
    @Body()
    body: {
      proUserId: string;
      escrowIds: string[];
      transferReference?: string;
      notes?: string;
    },
  ) {
    return this.paymentsService.processPayout({
      adminUserId: req.user.userId,
      proUserId: body.proUserId,
      escrowIds: body.escrowIds,
      transferReference: body.transferReference,
      notes: body.notes,
    });
  }

  @Get("admin/payouts")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] List historical payouts" })
  async listPayouts(@Req() req: Request) {
    const url = new URL(req.url, "http://x");
    const proUserId = url.searchParams.get("proUserId") ?? undefined;
    const page = parseInt(url.searchParams.get("page") ?? "1", 10);
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    return this.paymentsService.listPayouts({ proUserId, page, limit });
  }

  @Post("admin/disputes/:id/resolve")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "[admin] Resolve a dispute (moves the money)" })
  async resolveDispute(
    @Param("id") id: string,
    @Req() req: { user: { userId: string } },
    @Body()
    body: {
      resolution: "resolved_for_client" | "resolved_for_pro" | "split" | "rejected";
      refundAmountMinor?: number;
      payoutAmountMinor?: number;
      note?: string;
    },
  ) {
    return this.paymentsService.resolveDispute({
      disputeId: id,
      adminUserId: req.user.userId,
      resolution: body.resolution,
      refundAmountMinor: body.refundAmountMinor,
      payoutAmountMinor: body.payoutAmountMinor,
      note: body.note,
    });
  }
}
