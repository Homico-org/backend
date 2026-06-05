import { NormalizedSupplierProduct } from './normalized-product.dto';
import { SupplierSourceType } from '../schemas/supplier.schema';

/**
 * Every product source - scraper or partner feed - implements this. The sync
 * service resolves an adapter by `supplierKey` and drains `listProducts()`.
 *
 * `listProducts()` is an async generator so the sync layer can upsert
 * page-by-page (or stream a feed) without holding the whole catalog in memory.
 */
export interface SupplierAdapter {
  readonly supplierKey: string;
  readonly sourceType: SupplierSourceType;

  listProducts(): AsyncGenerator<NormalizedSupplierProduct, void, void>;

  /** Optional granular hooks used by admin tools / detail enrichment. */
  fetchPage?(page: number): Promise<NormalizedSupplierProduct[]>;
  fetchProductDetail?(
    externalId: string,
  ): Promise<Partial<NormalizedSupplierProduct>>;
}

/**
 * DI token for the array of registered adapters. The module binds every
 * concrete adapter here; the sync service injects the array and looks one up
 * by supplierKey. Adding a feed adapter later = one more entry, zero changes
 * to the sync service.
 */
export const SUPPLIER_ADAPTERS = 'SUPPLIER_ADAPTERS';
