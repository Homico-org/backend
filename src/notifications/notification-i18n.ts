/**
 * Push-notification copy in the three supported languages.
 *
 * The in-app feed localizes client-side from `titleKey`/`messageKey`, but a
 * push banner is rendered by the OS from exactly what the server sends - so
 * the text has to be resolved here, against the user's stored `locale`.
 *
 * This catalog is deliberately partial: it covers the notification types the
 * cleaning app actually fires. Anything not listed falls back to the English
 * copy the caller already passes to `notify()`, so an unmapped type degrades
 * to today's behaviour instead of breaking.
 *
 * Placeholders use {name} and are filled from the notification's i18nParams.
 */

export type SupportedLocale = "en" | "ka" | "ru";

export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "ka", "ru"];

type LocalizedString = Record<SupportedLocale, string>;

/** Keyed by the same `titleKey`/`messageKey` the in-app feed uses. */
export const NOTIFICATION_STRINGS: Record<string, LocalizedString> = {
  // --- Booking lifecycle ---
  "notifications.types.new_booking.title": {
    en: "New booking",
    ka: "ახალი ჯავშანი",
    ru: "Новый заказ",
  },
  "notifications.types.booking_confirmed.title": {
    en: "Booking confirmed",
    ka: "ჯავშანი დადასტურდა",
    ru: "Заказ подтверждён",
  },
  "notifications.types.booking_started.title": {
    en: "Cleaner on the way",
    ka: "დამლაგებელი გზაშია",
    ru: "Клинер в пути",
  },
  "notifications.types.booking_completed.title": {
    en: "Cleaning complete",
    ka: "დასუფთავება დასრულდა",
    ru: "Уборка завершена",
  },
  "notifications.types.booking_cancelled.title": {
    en: "Booking cancelled",
    ka: "ჯავშანი გაუქმდა",
    ru: "Заказ отменён",
  },

  // --- Job / cancellation ---
  "notifications.types.job_cancelled.title": {
    en: "Booking cancelled",
    ka: "ჯავშანი გაუქმდა",
    ru: "Заказ отменён",
  },
  "notifications.types.job_cancelled.message": {
    en: '{clientName} cancelled the job: "{jobTitle}"',
    ka: "{clientName}-მა გააუქმა: {jobTitle}",
    ru: "{clientName} отменил заказ: {jobTitle}",
  },
  "notifications.types.cancellation_fee_waived.title": {
    en: "Cancellation fee waived",
    ka: "საფასური გაუქმდა",
    ru: "Сбор отменён",
  },
  "notifications.types.cancellation_fee_waived.message": {
    en: 'Your cleaner waived the cancellation fee for "{jobTitle}"',
    ka: "დამლაგებელმა არ დაგარიცხათ გაუქმების საფასური - {jobTitle}",
    ru: "Клинер не стал списывать сбор за отмену - {jobTitle}",
  },
  "notifications.types.cancellation_fee_charged.title": {
    en: "Cancellation fee charged",
    ka: "საფასური დაერიცხა",
    ru: "Сбор за отмену",
  },
  "notifications.types.cancellation_fee_charged.message": {
    en: 'A {amount} ₾ cancellation fee applies to "{jobTitle}"',
    ka: "გაუქმების საფასური {amount} ₾ - {jobTitle}",
    ru: "Сбор за отмену {amount} ₾ - {jobTitle}",
  },

  // --- Messaging ---
  "notifications.types.new_message.title": {
    en: "New message",
    ka: "ახალი შეტყობინება",
    ru: "Новое сообщение",
  },

  // --- Reviews ---
  "notifications.types.review_prompt.title": {
    en: "How did it go?",
    ka: "როგორ ჩაიარა?",
    ru: "Как всё прошло?",
  },
  "notifications.types.new_review.title": {
    en: "New review",
    ka: "ახალი შეფასება",
    ru: "Новый отзыв",
  },

  // --- Account ---
  "notifications.types.account_verified.title": {
    en: "Account verified",
    ka: "ანგარიში გადამოწმდა",
    ru: "Аккаунт подтверждён",
  },
};

export function normalizeLocale(locale?: string): SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale)
    ? (locale as SupportedLocale)
    : "en";
}

/** Fill {placeholders} from the notification's i18n params. */
function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    params[key] !== undefined ? String(params[key]) : match,
  );
}

/**
 * Resolve a notification key into the user's language.
 * Returns `undefined` when the key is not in the catalog, so the caller can
 * fall back to the English copy it already has.
 */
export function translateNotification(
  key: string | undefined,
  locale: string | undefined,
  params?: Record<string, string | number>,
): string | undefined {
  if (!key) return undefined;
  const entry = NOTIFICATION_STRINGS[key];
  if (!entry) return undefined;
  return interpolate(entry[normalizeLocale(locale)], params);
}
