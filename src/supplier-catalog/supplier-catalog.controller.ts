import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SupplierCatalogService } from './supplier-catalog.service';
import { SupplierSyncService } from './supplier-sync.service';
import { SearchProductsDto } from './dto/search-products.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('supplier-catalog')
export class SupplierCatalogController {
  constructor(
    private readonly catalogService: SupplierCatalogService,
    private readonly syncService: SupplierSyncService,
  ) {}

  // === Public endpoints ===

  @Get('products')
  searchProducts(@Query() dto: SearchProductsDto) {
    return this.catalogService.searchProducts(dto);
  }

  @Get('products/:id')
  findProduct(@Param('id') id: string) {
    return this.catalogService.findProductById(id);
  }

  @Get('suppliers')
  listSuppliers() {
    return this.catalogService.listSuppliers();
  }

  @Get('categories')
  listCategories(@Query('supplierKey') supplierKey?: string) {
    return this.catalogService.listCategoryFacets(supplierKey);
  }

  // === Admin endpoints ===

  @Post('admin/suppliers/seed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  seedSuppliers() {
    return this.catalogService.seedSuppliers();
  }

  @Get('admin/suppliers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listSuppliersAdmin() {
    return this.catalogService.listSuppliersAdmin();
  }

  @Get('admin/suppliers/:key/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  supplierStatus(@Param('key') key: string) {
    return this.catalogService.getSupplierStatus(key);
  }

  @Post('admin/suppliers/:key/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  syncSupplier(@Param('key') key: string) {
    // Fire-and-forget: a full crawl takes minutes. Poll the status endpoint.
    return this.syncService.startSync(key);
  }
}
