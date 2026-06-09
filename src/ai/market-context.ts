/**
 * Market context blocks for AI prompts.
 *
 * The AI service used to hard-code Tbilisi labor prices in every system
 * prompt. That worked when GE was the only marketplace but produced
 * jarring answers when a US visitor asked about plumbing rates ("here
 * are Tbilisi prices in GEL..."). This module resolves the market the
 * conversation belongs to and feeds the model the right currency,
 * region, and (where available) reference price block.
 *
 * Adding a new market means appending a `MARKET_CONTEXT` entry, no
 * touch needed in `ai.service.ts`.
 */
import {
  CURRENCY_BY_COUNTRY,
  DEFAULT_COUNTRY,
  type CountryCode,
} from "../common/countries";

const CURRENCY_SYMBOL: Record<string, string> = {
  GEL: "₾",
  ILS: "₪",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

const CURRENCY_NAME: Record<string, string> = {
  GEL: "Georgian Lari",
  ILS: "Israeli Shekel",
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
};

export interface MarketContext {
  /** Display name of the primary city for this marketplace. */
  city: string;
  /** Full country name for prose ("Georgia", "Germany"). */
  country: string;
  /** ISO 4217 code ("GEL", "USD", "EUR"). */
  currencyCode: string;
  /** Symbol for inline use in numbers. */
  currencySymbol: string;
  /** Full name for prose ("Georgian Lari", "Euro"). */
  currencyName: string;
  /**
   * Optional reference-price block. Only populated for markets where we
   * have curated 2024 labor + materials data. Markets without a block
   * fall back to the model's general knowledge for that region.
   */
  referencePrices?: string;
  /** Renovation tier ranges per m^2 in local currency. */
  tierRanges?: {
    cosmetic: string;
    standard: string;
    full: string;
    luxury: string;
  };
  /** Typical residential ceiling height in meters. */
  typicalCeilingHeight?: string;
}

const TBILISI_REFERENCE_PRICES = `TBILISI MARKET REFERENCE PRICES (2024-2025, Labor + Basic Materials):

DEMOLITION:
- დემონტაჟი/Demolition (per m²): 8-20 ₾
- Debris removal: 150-400 ₾ per load

ELECTRICAL:
- ელექტრო წერტილი/Electrical point: 50-90 ₾
- Electrical panel installation: 350-600 ₾
- Chandelier installation: 40-80 ₾
- Floor heating cable (per m²): 35-60 ₾

PLUMBING:
- სანტექნიკის წერტილი/Plumbing point: 80-150 ₾
- Toilet installation: 80-150 ₾
- Sink installation: 60-120 ₾
- Bathtub/shower installation: 150-350 ₾
- Water heater installation: 100-200 ₾
- Radiator installation: 100-180 ₾

WALLS:
- შელესვა/Plastering (per m²): 25-45 ₾
- შპაკლი/Putty work (per m²): 12-22 ₾
- Primer application (per m²): 3-6 ₾
- თაბაშირმუყაოს კედელი/Drywall partition (per m²): 45-75 ₾

CEILING:
- თაბაშირმუყაოს ჭერი/Drywall ceiling (per m²): 40-70 ₾
- Multi-level ceiling (per m²): 80-150 ₾
- Stretch ceiling (per m²): 35-60 ₾

FLOORING:
- სტიაჟკა/Floor screed (per m²): 25-45 ₾
- ლამინატის დაგება/Laminate installation (per m²): 18-35 ₾
- Parquet installation (per m²): 30-55 ₾
- Self-leveling floor (per m²): 20-40 ₾

TILING:
- Floor tiles (per m²): 35-65 ₾
- Wall tiles (per m²): 35-70 ₾
- Mosaic work (per m²): 70-120 ₾

PAINTING:
- კედლის შეღებვა/Wall painting (per m²): 8-18 ₾
- Ceiling painting (per m²): 10-20 ₾
- Decorative painting (per m²): 25-50 ₾

DOORS & WINDOWS:
- Interior door installation: 120-250 ₾
- Entrance door installation: 200-400 ₾
- Window installation: 80-150 ₾
- Windowsill installation: 40-80 ₾

OTHER:
- პლინტუსი/Baseboard installation (per linear m): 8-18 ₾
- Balcony glazing (per m²): 150-350 ₾
- კონდიციონერის მონტაჟი/AC installation: 200-400 ₾`;

const MARKET_CONTEXT: Record<CountryCode, MarketContext> = {
  GE: {
    city: "Tbilisi",
    country: "Georgia",
    currencyCode: "GEL",
    currencySymbol: "₾",
    currencyName: "Georgian Lari",
    referencePrices: TBILISI_REFERENCE_PRICES,
    tierRanges: {
      cosmetic: "150-300 GEL/m²",
      standard: "350-550 GEL/m²",
      full: "600-900 GEL/m²",
      luxury: "1000-2000+ GEL/m²",
    },
    typicalCeilingHeight: "2.7-3.0m (typical Tbilisi apartments)",
  },
  IL: {
    city: "Tel Aviv",
    country: "Israel",
    currencyCode: "ILS",
    currencySymbol: "₪",
    currencyName: "Israeli Shekel",
    tierRanges: {
      cosmetic: "800-1500 ILS/m²",
      standard: "1800-3000 ILS/m²",
      full: "3500-5500 ILS/m²",
      luxury: "6000-12000+ ILS/m²",
    },
    typicalCeilingHeight: "2.6-2.8m (typical Israeli apartments)",
  },
  FR: {
    city: "Paris",
    country: "France",
    currencyCode: "EUR",
    currencySymbol: "€",
    currencyName: "Euro",
    tierRanges: {
      cosmetic: "200-450 EUR/m²",
      standard: "500-900 EUR/m²",
      full: "1000-1800 EUR/m²",
      luxury: "2000-4000+ EUR/m²",
    },
    typicalCeilingHeight: "2.5-2.7m (typical French apartments)",
  },
  US: {
    city: "the United States",
    country: "United States",
    currencyCode: "USD",
    currencySymbol: "$",
    currencyName: "US Dollar",
    tierRanges: {
      cosmetic: "$30-60 per sqft",
      standard: "$70-120 per sqft",
      full: "$130-200 per sqft",
      luxury: "$250-500+ per sqft",
    },
    typicalCeilingHeight: "8-9ft (2.4-2.7m, typical US homes)",
  },
  DE: {
    city: "Berlin",
    country: "Germany",
    currencyCode: "EUR",
    currencySymbol: "€",
    currencyName: "Euro",
    tierRanges: {
      cosmetic: "250-500 EUR/m²",
      standard: "600-1000 EUR/m²",
      full: "1100-1900 EUR/m²",
      luxury: "2200-4500+ EUR/m²",
    },
    typicalCeilingHeight: "2.5-2.8m (typical German Altbau / Neubau)",
  },
  UK: {
    city: "London",
    country: "United Kingdom",
    currencyCode: "GBP",
    currencySymbol: "£",
    currencyName: "British Pound",
    tierRanges: {
      cosmetic: "£200-400/m²",
      standard: "£500-900/m²",
      full: "£1000-1800/m²",
      luxury: "£2000-4500+/m²",
    },
    typicalCeilingHeight: "2.4-2.5m (typical UK homes)",
  },
};

/**
 * Resolve the market context for a country code. Unknown / undefined
 * codes fall back to the default marketplace so we never feed the model
 * an empty currency string.
 */
export function getMarketContext(country?: string | null): MarketContext {
  if (!country) return MARKET_CONTEXT[DEFAULT_COUNTRY];
  const code = country.toUpperCase() as CountryCode;
  return MARKET_CONTEXT[code] ?? MARKET_CONTEXT[DEFAULT_COUNTRY];
}

/**
 * Short header that identifies the market for the model. Drop this at
 * the top of any system prompt that previously hard-coded "Tbilisi" or
 * "GEL".
 */
export function marketHeader(context: MarketContext): string {
  return `You are operating in the ${context.city}, ${context.country} renovation market. All prices are in ${context.currencyName} (${context.currencyCode}, symbol ${context.currencySymbol}).`;
}

/**
 * One-line currency reminder for prompts that need to enforce a unit on
 * the model's output without dragging in the full market header.
 */
export function currencyHint(context: MarketContext): string {
  return `Prices in ${context.currencyName} (${context.currencyCode}).`;
}

export { CURRENCY_SYMBOL, CURRENCY_NAME };
