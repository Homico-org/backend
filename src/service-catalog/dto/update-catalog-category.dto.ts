import { PartialType } from '@nestjs/mapped-types';
import {
  CreateCatalogCategoryDto,
  CatalogSubcategoryDto,
} from './create-catalog-category.dto';

export class UpdateCatalogCategoryDto extends PartialType(
  CreateCatalogCategoryDto,
) {}

export class UpsertSubcategoryDto extends PartialType(CatalogSubcategoryDto) {}
