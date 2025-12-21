import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import {
  CategoryDoc,
  SubcategoryDoc,
  SubSubcategoryDoc,
  FlatCategoryItem,
  SearchResult,
} from './types/category.types';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active categories with subcategories' })
  async findAll(): Promise<CategoryDoc[]> {
    return this.categoriesService.findAll();
  }

  @Get('flat')
  @ApiOperation({ summary: 'Get flattened list of all categories for dropdowns' })
  async getFlatList(): Promise<FlatCategoryItem[]> {
    return this.categoriesService.getFlatList();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search categories by keyword' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  async search(@Query('q') query: string): Promise<SearchResult> {
    return this.categoriesService.search(query);
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a single category by key' })
  @ApiParam({ name: 'key', description: 'Category key' })
  async findByKey(@Param('key') key: string): Promise<CategoryDoc | null> {
    return this.categoriesService.findByKey(key);
  }

  @Get(':key/subcategories')
  @ApiOperation({ summary: 'Get subcategories for a category' })
  @ApiParam({ name: 'key', description: 'Category key' })
  async getSubcategories(@Param('key') key: string): Promise<SubcategoryDoc[]> {
    return this.categoriesService.getSubcategories(key);
  }

  @Get(':categoryKey/:subcategoryKey/children')
  @ApiOperation({ summary: 'Get sub-subcategories (children) for a subcategory' })
  @ApiParam({ name: 'categoryKey', description: 'Category key' })
  @ApiParam({ name: 'subcategoryKey', description: 'Subcategory key' })
  async getSubSubcategories(
    @Param('categoryKey') categoryKey: string,
    @Param('subcategoryKey') subcategoryKey: string,
  ): Promise<SubSubcategoryDoc[]> {
    return this.categoriesService.getSubSubcategories(categoryKey, subcategoryKey);
  }
}
