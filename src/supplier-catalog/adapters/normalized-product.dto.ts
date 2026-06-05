/**
 * The normalized product shape every SupplierAdapter yields, regardless of
 * whether the source is a scraped HTML page or a partner feed. The sync service
 * only ever sees this - so scrape-vs-feed stays an implementation detail.
 */
export interface NormalizedSupplierProduct {
  /** Supplier's own product id. */
  externalId: string;
  externalUrl: string;
  name: string;
  nameKa?: string;
  /** Price in minor units (tetri). */
  priceMinor: number;
  currency: string;
  /** Original price text as found at the source, e.g. '110.00 ₾'. */
  rawPrice?: string;
  imageUrls: string[];
  category?: string;
  categoryLabel?: string;
  /** undefined when the source doesn't expose stock (e.g. listing pages). */
  inStock?: boolean;
  attributes?: Record<string, unknown>;
}
