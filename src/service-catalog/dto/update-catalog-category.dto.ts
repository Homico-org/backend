import { PartialType } from '@nestjs/mapped-types';
import { CreateCatalogCategoryDto } from './create-catalog-category.dto';

export class UpdateCatalogCategoryDto extends PartialType(
  CreateCatalogCategoryDto,
) {}
