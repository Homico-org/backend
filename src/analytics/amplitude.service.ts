import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as amplitude from "@amplitude/analytics-node";

/**
 * Backend Amplitude wrapper. Mirrors the frontend wrapper's contract:
 *  - Single typed `track()` entry point.
 *  - Init exactly once, on module boot.
 *  - EU server zone for GDPR (same residency as our Mixpanel + frontend
 *    Amplitude setup).
 *  - No-op when the API key isn't configured, so local dev without
 *    AMPLITUDE_API_KEY doesn't crash on every service call.
 *
 * Why server-side at all when we have a browser SDK? Three reasons:
 *  1. Events that originate server-side (job created, proposal accepted,
 *     payment succeeded) shouldn't trust the client to fire them.
 *  2. Survives ad-blockers - browser analytics drops ~30% of events to
 *     ad-blockers; server events have no such loss.
 *  3. Captures the truth even on cron jobs, webhooks, and scripts where no
 *     browser is involved (e.g. nightly stats, admin actions).
 */

export interface TrackEventOptions {
  /** Homico user id (Mongo ObjectId as string). Optional for system events. */
  userId?: string;
  /** Browser-side device id, when forwarded from a client request. Lets
   *  Amplitude stitch server events to the same session as browser events. */
  deviceId?: string;
  /** Event properties. Undefined values are stripped before sending. */
  properties?: Record<string, string | number | boolean | undefined>;
}

@Injectable()
export class AmplitudeService implements OnModuleInit {
  private readonly logger = new Logger(AmplitudeService.name);
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>("AMPLITUDE_API_KEY");
    if (!apiKey) {
      this.logger.warn(
        "AMPLITUDE_API_KEY not configured. Server-side analytics disabled.",
      );
      return;
    }

    amplitude.init(apiKey, {
      // MUST match the region of the Amplitude project itself
      // (app.amplitude.com = US, app.eu.amplitude.com = EU). Mismatch
      // silently accepts events on the wrong region and never delivers
      // them to the project. Keep in sync with the frontend wrapper.
      serverZone: "US",
      // Batch events to reduce HTTP overhead; SDK flushes on its own
      // schedule + on process exit. We don't await every event.
      flushIntervalMillis: 10_000,
      flushQueueSize: 30,
    });
    this.initialized = true;
    this.logger.log("Amplitude server SDK initialized (EU region).");
  }

  isConfigured(): boolean {
    return this.initialized;
  }

  /**
   * Fire an event. Returns immediately - the SDK queues and flushes
   * asynchronously. Callers don't need to await.
   *
   * Event names should be snake_case strings matching the frontend's
   * AnalyticsEvent enum vocabulary so the same dashboards work for client
   * + server origins.
   */
  track(eventName: string, opts: TrackEventOptions = {}): void {
    if (!this.initialized) return;
    if (!opts.userId && !opts.deviceId) {
      // Amplitude requires one or the other. Server-only events without
      // either are dropped silently - log so we notice if we forget.
      this.logger.debug(
        `track("${eventName}") skipped - no userId or deviceId provided`,
      );
      return;
    }

    const properties = opts.properties
      ? Object.fromEntries(
          Object.entries(opts.properties).filter(([, v]) => v !== undefined),
        )
      : undefined;

    amplitude.track(
      eventName,
      properties as Record<string, string | number | boolean> | undefined,
      {
        user_id: opts.userId,
        device_id: opts.deviceId,
      },
    );
  }

  /**
   * Set persistent user properties (role, city, plan, etc.). These attach
   * to the user across all subsequent events without having to repeat them
   * on every track() call.
   */
  identify(
    userId: string,
    properties: Record<string, string | number | boolean | undefined>,
  ): void {
    if (!this.initialized) return;

    const cleanProps = Object.fromEntries(
      Object.entries(properties).filter(([, v]) => v !== undefined),
    );
    const identify = new amplitude.Identify();
    for (const [key, value] of Object.entries(cleanProps)) {
      identify.set(key, value as string | number | boolean);
    }
    amplitude.identify(identify, { user_id: userId });
  }

  /**
   * Force-flush the event queue. Useful from short-lived processes (scripts,
   * cron handlers) that exit before the SDK's normal flush interval. Most
   * request handlers should NOT call this - it adds round-trip latency.
   */
  async flush(): Promise<void> {
    if (!this.initialized) return;
    await amplitude.flush().promise;
  }
}
