import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service';
import { CreateCatalogCategoryDto } from './dto/create-catalog-category.dto';
import {
  UpdateCatalogCategoryDto,
  UpsertSubcategoryDto,
} from './dto/update-catalog-category.dto';
import { buildSeedData } from './seed';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(private readonly catalogService: ServiceCatalogService) {}

  // === Public endpoints ===

  @Get()
  findAll() {
    return this.catalogService.findAll();
  }

  @Get('version')
  getVersion() {
    return this.catalogService.getVersion();
  }

  @Get('by-subcategory/:subcategoryKey')
  findBySubcategory(@Param('subcategoryKey') subcategoryKey: string) {
    return this.catalogService.findBySubcategory(subcategoryKey);
  }

  @Get('as-categories')
  findAllAsCategories() {
    return this.catalogService.findAllAsCategories();
  }

  @Get('as-categories/flat')
  findAllAsCategoriesFlat() {
    return this.catalogService.findAllAsCategoriesFlat();
  }

  @Get(':categoryKey')
  findOne(@Param('categoryKey') categoryKey: string) {
    return this.catalogService.findByKey(categoryKey);
  }

  // === Admin endpoints ===

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllAdmin() {
    return this.catalogService.findAllAdmin();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateCatalogCategoryDto) {
    return this.catalogService.create(dto);
  }

  @Patch('reorder-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reorderCategories(@Body() body: { keys: string[] }) {
    return this.catalogService.reorderCategories(body.keys);
  }

  @Patch(':categoryKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('categoryKey') categoryKey: string,
    @Body() dto: UpdateCatalogCategoryDto,
  ) {
    return this.catalogService.update(categoryKey, dto);
  }

  @Delete(':categoryKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('categoryKey') categoryKey: string) {
    return this.catalogService.softDelete(categoryKey);
  }

  @Delete(':categoryKey/permanent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  hardDelete(@Param('categoryKey') categoryKey: string) {
    return this.catalogService.hardDelete(categoryKey);
  }

  @Put(':categoryKey/subcategories/:subKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertSubcategory(
    @Param('categoryKey') categoryKey: string,
    @Param('subKey') subKey: string,
    @Body() body: UpsertSubcategoryDto,
  ) {
    return this.catalogService.upsertSubcategory(categoryKey, subKey, body);
  }

  @Delete(':categoryKey/subcategories/:subKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeSubcategory(
    @Param('categoryKey') categoryKey: string,
    @Param('subKey') subKey: string,
  ) {
    return this.catalogService.removeSubcategory(categoryKey, subKey);
  }

  @Patch(':categoryKey/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reorder(
    @Param('categoryKey') categoryKey: string,
    @Body() body: { keys: string[] },
  ) {
    return this.catalogService.reorderSubcategories(categoryKey, body.keys);
  }

  @Post('seed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  seed() {
    return this.catalogService.seed(buildSeedData());
  }

  @Post('cleanup-user-services')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async cleanupUserServices() {
    return this.catalogService.cleanupUserServices();
  }
}
