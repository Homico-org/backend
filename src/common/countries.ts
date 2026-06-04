/**
 * Country reference data for Homico's multi-country foundation.
 *
 * Today Georgia (GE) is the only live marketplace. Other entries are
 * commented out, ready to be activated as new markets onboard. Keeping
 * them in this file (not in env or config) means every change goes
 * through code review and migration scripts catch any data gaps.
 *
 * Country is a property of supply (pros, jobs, bookings), NOT of demand
 * (clients). A user in Israel can browse Georgia's marketplace and book
 * a Tbilisi plumber - that's a feature, not an edge case. See the
 * 2026-05 multi-country design notes.
 */

export const SUPPORTED_COUNTRIES = ["GE", "IL", "FR", "US", "DE", "UK"] as const;
export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];

export const DEFAULT_COUNTRY: CountryCode = "GE";

export function isSupportedCountry(value: unknown): value is CountryCode {
  return (
    typeof value === "string" &&
    (SUPPORTED_COUNTRIES as readonly string[]).includes(value.toUpperCase())
  );
}

/**
 * ISO 4217 currency code per country. When a new market opens, add the
 * country to SUPPORTED_COUNTRIES above and its currency here. Pricing is
 * stored with its native currency - never auto-converted at write time
 * (rates change; stored prices must be reproducible). Conversion for
 * display happens at the edge, with the original number always available.
 */
export const CURRENCY_BY_COUNTRY: Record<CountryCode, string> = {
  GE: "GEL",
  IL: "ILS",
  FR: "EUR",
  US: "USD",
  DE: "EUR",
  UK: "GBP",
};

/**
 * Preferred UI locale for a first-time visitor to a marketplace. This
 * only seeds the language picker on landing; the user can switch
 * languages independently. Country and language are orthogonal axes.
 */
export const LOCALE_BY_COUNTRY: Record<CountryCode, "ka" | "en" | "ru"> = {
  GE: "ka",
  IL: "en",
  FR: "en",
  US: "en",
  DE: "en",
  UK: "en",
};

export type SupportedLocale = "ka" | "en" | "ru";

/**
 * Pick the right locale for transactional comms (SMS, email, push)
 * addressed to a specific user. Order of precedence:
 *
 *   1. The user's stored `preferredLocale` (if we ever add that field)
 *   2. The first entry in `user.languages[]` if it's one of our
 *      supported locales - pros explicitly list which languages they
 *      work in, so the first one is a fair guess at their UI pref
 *   3. The default locale of the user's marketplace country
 *   4. English as the universal fallback
 *
 * Used by SMS / email / push services to avoid sending Georgian copy
 * to a US pro who can't read it.
 */
export function resolveUserLocale(user?: {
  preferredLocale?: string | null;
  languages?: string[] | null;
  country?: string | null;
}): SupportedLocale {
  const supported: SupportedLocale[] = ["en", "ka", "ru"];

  const pref = user?.preferredLocale?.toLowerCase();
  if (pref && (supported as string[]).includes(pref)) {
    return pref as SupportedLocale;
  }

  const firstLang = user?.languages?.[0]?.toLowerCase();
  if (firstLang && (supported as string[]).includes(firstLang)) {
    return firstLang as SupportedLocale;
  }

  const country = user?.country?.toUpperCase();
  if (country && country in LOCALE_BY_COUNTRY) {
    return LOCALE_BY_COUNTRY[country as CountryCode];
  }

  return "en";
}

/**
 * E.164 phone-number prefix per country. Source of truth for which
 * prefix to add when the user picks a country from the phone input.
 * Kept here instead of in the user-schema enum because the schema only
 * stores the final E.164 number; this mapping is presentation-layer.
 */
export const PHONE_PREFIX_BY_COUNTRY: Record<CountryCode, string> = {
  GE: "+995",
  IL: "+972",
  FR: "+33",
  US: "+1",
  DE: "+49",
  UK: "+44",
};
