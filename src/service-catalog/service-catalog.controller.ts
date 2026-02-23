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
import { UpdateCatalogCategoryDto } from './dto/update-catalog-category.dto';
import { buildSeedData } from './seed-catalog';
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
    return this.catalogService.create(dto as any);
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
    @Body() body: Record<string, unknown>,
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

  @Put(':categoryKey/subcategories/:subKey/variants/:variantKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  upsertVariant(
    @Param('categoryKey') categoryKey: string,
    @Param('subKey') subKey: string,
    @Param('variantKey') variantKey: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.catalogService.upsertVariant(
      categoryKey,
      subKey,
      variantKey,
      body,
    );
  }

  @Delete(':categoryKey/subcategories/:subKey/variants/:variantKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeVariant(
    @Param('categoryKey') categoryKey: string,
    @Param('subKey') subKey: string,
    @Param('variantKey') variantKey: string,
  ) {
    return this.catalogService.removeVariant(categoryKey, subKey, variantKey);
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
    const categories = buildSeedData();
    return this.catalogService.seed(categories);
  }
}
