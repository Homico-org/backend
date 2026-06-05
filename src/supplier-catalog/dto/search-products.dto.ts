import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Public product search. Query params arrive as strings; numeric fields are
 * parsed in the service (mirrors jobs.controller convention). Prices in the
 * API are GEL (major units); the service converts to tetri for the query.
 */
export class SearchProductsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  supplierKey?: string;

  @IsOptional()
  @IsString()
  category?: string;

  /** 'true' / '1' filters to products the shop reports in stock. */
  @IsOptional()
  @IsString()
  inStockOnly?: string;

  @IsOptional()
  @IsString()
  minPrice?: string;

  @IsOptional()
  @IsString()
  maxPrice?: string;

  @IsOptional()
  @IsIn(['price_asc', 'price_desc', 'newest'])
  sort?: 'price_asc' | 'price_desc' | 'newest';

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
