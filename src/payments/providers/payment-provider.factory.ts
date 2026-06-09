import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BogPaymentProvider } from "./bog-payment.provider";
import { MockPaymentProvider } from "./mock-payment.provider";
import { DisabledPaymentProvider } from "./disabled-payment.provider";
import {
  PaymentProvider,
  PaymentProviderName,
} from "./payment-provider.interface";

/**
 * Resolves which PaymentProvider implementation to use based on the
 * PAYMENT_PROVIDER env var.
 *
 * Defaults: non-production -> "mock" (instant success, for dev/CI).
 * Production -> "disabled" (boots, but refuses every payment op) when
 * PAYMENT_PROVIDER is unset, so the app can ship to prod BEFORE a real
 * provider (BoG) is configured without crashing at boot.
 *
 * Why a factory instead of letting NestJS's DI inject the chosen provider
 * directly? Because adding a new provider shouldn't require editing every
 * consumer - they ask the factory, the factory returns the right thing.
 *
 * Safety: production REFUSES the mock provider (mock fakes instant success and
 * must never reach real users). Set PAYMENT_PROVIDER=bog (+ BOG_* env) when the
 * merchant account is live; until then leave it unset (or "disabled") on prod.
 */

@Injectable()
export class PaymentProviderFactory implements OnModuleInit {
  private readonly logger = new Logger(PaymentProviderFactory.name);
  private active!: PaymentProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockPaymentProvider,
    private readonly bogProvider: BogPaymentProvider,
    private readonly disabledProvider: DisabledPaymentProvider,
    // Future: TbcPaymentProvider, etc.
  ) {}

  onModuleInit() {
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    const isProd = nodeEnv === "production";
    // Unset -> "mock" in dev (instant success), "disabled" in prod (no crash,
    // no fake payments). Both are safe defaults for their environment.
    const requested = (
      this.configService.get<string>("PAYMENT_PROVIDER") ||
      (isProd ? "disabled" : "mock")
    ).toLowerCase() as PaymentProviderName;

    if (isProd && requested === "mock") {
      throw new Error(
        "PAYMENT_PROVIDER=mock is not allowed in production. " +
          "Use a real provider (bog) when live, or 'disabled'/unset until then.",
      );
    }

    switch (requested) {
      case "mock":
        this.active = this.mockProvider;
        break;
      case "bog":
        this.active = this.bogProvider;
        break;
      case "disabled":
      case "none" as PaymentProviderName:
        this.active = this.disabledProvider;
        break;
      default:
        throw new Error(
          `PAYMENT_PROVIDER="${requested}" is not implemented yet. ` +
            `Available: mock, bog, disabled. Coming later: tbc, pay-ge, stripe.`,
        );
    }

    this.logger.log(`Active payment provider: ${this.active.name}`);
  }

  /** Returns the active provider for outbound operations (createIntent, refund, status). */
  get(): PaymentProvider {
    return this.active;
  }

  /**
   * Returns a specific provider by name. Used by the webhook handler -
   * webhooks have a provider-specific URL path, so the handler explicitly
   * asks for the matching provider rather than the "active" one (which
   * may have changed since the intent was created).
   */
  getByName(name: PaymentProviderName): PaymentProvider {
    if (name === "mock") return this.mockProvider;
    if (name === "bog") return this.bogProvider;
    if (name === "disabled") return this.disabledProvider;
    throw new Error(`Unknown or not-yet-implemented provider: ${name}`);
  }
}
