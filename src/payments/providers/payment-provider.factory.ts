import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BogPaymentProvider } from "./bog-payment.provider";
import { MockPaymentProvider } from "./mock-payment.provider";
import {
  PaymentProvider,
  PaymentProviderName,
} from "./payment-provider.interface";

/**
 * Resolves which PaymentProvider implementation to use based on the
 * PAYMENT_PROVIDER env var. Defaults to "mock" in non-production envs.
 *
 * Why a factory instead of letting NestJS's DI inject the chosen provider
 * directly? Because adding a new provider (Task #8: BoG) shouldn't require
 * editing every consumer - they ask the factory, the factory returns the
 * right thing. Same code path works for dev (mock) and prod (BoG).
 *
 * Safety: production builds REFUSE to use the mock provider. If you set
 * NODE_ENV=production but forget PAYMENT_PROVIDER, the factory throws at
 * boot rather than silently letting fake payments through.
 */

@Injectable()
export class PaymentProviderFactory implements OnModuleInit {
  private readonly logger = new Logger(PaymentProviderFactory.name);
  private active!: PaymentProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockPaymentProvider,
    private readonly bogProvider: BogPaymentProvider,
    // Future: TbcPaymentProvider, etc.
  ) {}

  onModuleInit() {
    const requested = (
      this.configService.get<string>("PAYMENT_PROVIDER") || "mock"
    ).toLowerCase() as PaymentProviderName;
    const nodeEnv = this.configService.get<string>("NODE_ENV");

    if (nodeEnv === "production" && requested === "mock") {
      throw new Error(
        "PAYMENT_PROVIDER=mock is not allowed in production. " +
          "Set PAYMENT_PROVIDER to a real provider (bog, tbc, pay-ge, stripe).",
      );
    }

    switch (requested) {
      case "mock":
        this.active = this.mockProvider;
        break;
      case "bog":
        this.active = this.bogProvider;
        break;
      default:
        throw new Error(
          `PAYMENT_PROVIDER="${requested}" is not implemented yet. ` +
            `Available: mock, bog. Coming later: tbc, pay-ge, stripe.`,
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
    throw new Error(`Unknown or not-yet-implemented provider: ${name}`);
  }
}
