import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { User } from "../users/schemas/user.schema";
import { NotificationType } from "./schemas/notification.schema";
import { translateNotification } from "./notification-i18n";
import { PushReceipt } from "./schemas/push-receipt.schema";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Expo accepts at most 100 messages per request. */
const CHUNK_SIZE = 100;

/** Expo accepts at most 1000 receipt ids per request. */
const RECEIPT_CHUNK_SIZE = 1000;

/**
 * The push preference block only has three category toggles, so map the
 * notification types they cover. Anything unmapped is transactional (booking
 * status, cancellation fees, premium, moderation) and rides on `push.enabled`
 * alone - there is no toggle to opt out of those individually.
 */
const PREFERENCE_CATEGORY: Partial<
  Record<NotificationType, "newJobs" | "proposals" | "messages">
> = {
  [NotificationType.JOB_MATCH]: "newJobs",
  [NotificationType.JOB_INVITATION]: "newJobs",
  [NotificationType.NEW_PROPOSAL]: "proposals",
  [NotificationType.PROPOSAL_ACCEPTED]: "proposals",
  [NotificationType.PROPOSAL_REJECTED]: "proposals",
  [NotificationType.NEW_MESSAGE]: "messages",
  [NotificationType.PROJECT_MESSAGE]: "messages",
};

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: "default";
  badge?: number;
  channelId?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export interface PushPayload {
  /** English fallback copy, used when the key is not in the catalog. */
  title: string;
  body: string;
  type: NotificationType;
  data?: Record<string, unknown>;
  /** i18n keys so the banner can be rendered in the user's language. */
  titleKey?: string;
  messageKey?: string;
  i18nParams?: Record<string, string | number>;
}

/**
 * Sends Expo push notifications to a user's registered devices.
 *
 * The mobile app registers Expo tokens via POST /users/push-token; until this
 * service existed they were stored and never used, so anything that happened
 * while the app was backgrounded was only visible on next open.
 *
 * Delivery is best-effort by design: a push failure must never break the
 * action that triggered it.
 */
@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(PushReceipt.name)
    private receiptModel: Model<PushReceipt>,
  ) {}

  /** Expo tokens look like ExponentPushToken[xxx] (older SDKs: ExpoPushToken[xxx]). */
  private isExpoToken(token: string): boolean {
    return (
      typeof token === "string" &&
      (token.startsWith("ExponentPushToken[") ||
        token.startsWith("ExpoPushToken["))
    );
  }

  private allowedByPreferences(user: User, type: NotificationType): boolean {
    const prefs = user.notificationPreferences;
    // No preferences saved yet - the app's own default is push on.
    if (!prefs?.push) return true;
    if (prefs.push.enabled === false) return false;

    const category = PREFERENCE_CATEGORY[type];
    if (!category) return true; // transactional, no per-category toggle
    return prefs.push[category] !== false;
  }

  /** Drop tokens Expo told us are dead, so we stop paying for them. */
  private async pruneTokens(userId: string, tokens: string[]): Promise<void> {
    if (!tokens.length) return;
    await this.userModel.updateOne(
      { _id: new Types.ObjectId(userId) },
      { $pull: { pushTokens: { token: { $in: tokens } } } },
    );
    this.logger.log(`Pruned ${tokens.length} dead push token(s) for ${userId}`);
  }

  private async postChunk(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      throw new Error(`Expo push responded ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as { data?: ExpoTicket[] };
    return json.data ?? [];
  }

  /**
   * Push to every device the user has registered. Returns the number of
   * messages Expo accepted; 0 when the user has no devices, has push off, or
   * delivery failed.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    try {
      const user = await this.userModel
        .findById(userId)
        .select("pushTokens notificationPreferences locale")
        .lean<User>()
        .exec();

      if (!user) return 0;
      if (!this.allowedByPreferences(user, payload.type)) return 0;

      const tokens = (user.pushTokens ?? [])
        .map((t) => t.token)
        .filter((t) => this.isExpoToken(t));
      if (!tokens.length) return 0;

      // The OS renders the banner from what we send, so resolve the copy
      // here against the user's language - falling back to the English text
      // the caller supplied when the key is not in the catalog.
      const title =
        translateNotification(payload.titleKey, user.locale, payload.i18nParams) ??
        payload.title;
      const body =
        translateNotification(payload.messageKey, user.locale, payload.i18nParams) ??
        payload.body;

      const messages: ExpoMessage[] = tokens.map((to) => ({
        to,
        title,
        body,
        sound: "default",
        // The app's notification-tap handler reads this to deep-link.
        data: { type: payload.type, ...payload.data },
        channelId: "default",
      }));

      let accepted = 0;
      const dead: string[] = [];

      for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        const tickets = await this.postChunk(chunk);

        const queued: { ticketId: string; userId: Types.ObjectId; token: string }[] =
          [];

        tickets.forEach((ticket, idx) => {
          if (ticket.status === "ok") {
            accepted += 1;
            if (ticket.id) {
              queued.push({
                ticketId: ticket.id,
                userId: new Types.ObjectId(userId),
                token: chunk[idx].to,
              });
            }
            return;
          }
          // DeviceNotRegistered means the app was uninstalled or the token
          // rotated - it will never work again, so stop keeping it.
          if (ticket.details?.error === "DeviceNotRegistered") {
            dead.push(chunk[idx].to);
          } else {
            this.logger.warn(
              `Push ticket error for ${userId}: ${ticket.details?.error ?? ticket.message}`,
            );
          }
        });

        // A ticket only means "queued". Park the ids so the receipt cron can
        // find out whether delivery actually happened. Bookkeeping only: if
        // this write fails (e.g. a duplicate ticketId on a retry) the push was
        // still sent, so it must not turn a success into a reported failure.
        if (queued.length) {
          try {
            await this.receiptModel.insertMany(queued, { ordered: false });
          } catch (err) {
            this.logger.warn(
              `Could not record ${queued.length} push receipt(s): ${(err as Error).message}`,
            );
          }
        }
      }

      await this.pruneTokens(userId, dead);
      return accepted;
    } catch (err) {
      // Never let a push problem surface to the caller - the in-app
      // notification has already been written and delivered over the socket.
      this.logger.error(
        `Push to ${userId} failed: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  private async postReceipts(
    ids: string[],
  ): Promise<Record<string, ExpoReceipt>> {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      throw new Error(
        `Expo receipts responded ${res.status} ${res.statusText}`,
      );
    }

    const json = (await res.json()) as { data?: Record<string, ExpoReceipt> };
    return json.data ?? {};
  }

  /**
   * Collect delivery receipts for pushes Expo accepted earlier.
   *
   * This is the only place a token that died *after* the send, or a revoked
   * APNs certificate, becomes visible - the send call itself reports neither.
   * Receipts take a few minutes to appear, so this runs on a delay rather
   * than inline.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async collectReceipts(): Promise<void> {
    const pending = await this.receiptModel
      .find()
      .limit(RECEIPT_CHUNK_SIZE)
      .lean<{ _id: Types.ObjectId; ticketId: string; userId: Types.ObjectId; token: string }[]>()
      .exec();

    if (!pending.length) return;

    try {
      const receipts = await this.postReceipts(pending.map((p) => p.ticketId));

      const deadByUser = new Map<string, string[]>();
      const settled: Types.ObjectId[] = [];
      let delivered = 0;

      for (const row of pending) {
        const receipt = receipts[row.ticketId];
        // Not ready yet - leave it for the next run (the TTL index drops it
        // after 24h if it never appears).
        if (!receipt) continue;

        settled.push(row._id);

        if (receipt.status === "ok") {
          delivered += 1;
          continue;
        }

        if (receipt.details?.error === "DeviceNotRegistered") {
          const key = row.userId.toString();
          deadByUser.set(key, [...(deadByUser.get(key) ?? []), row.token]);
        } else {
          this.logger.warn(
            `Push receipt error: ${receipt.details?.error ?? receipt.message}`,
          );
        }
      }

      for (const [userId, tokens] of deadByUser) {
        await this.pruneTokens(userId, tokens);
      }

      if (settled.length) {
        await this.receiptModel.deleteMany({ _id: { $in: settled } });
      }

      this.logger.log(
        `Receipts: ${delivered} delivered, ${settled.length - delivered} failed, ${pending.length - settled.length} still pending`,
      );
    } catch (err) {
      // Leave the rows in place; the next run retries them.
      this.logger.error(
        `Receipt collection failed: ${(err as Error).message}`,
      );
    }
  }
}
