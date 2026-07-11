import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupplierCatalogService } from './supplier-catalog.service';
import { SupplierSyncService } from './supplier-sync.service';
import { SearchProductsDto } from './dto/search-products.dto';
import {
  BulkImportDto,
  CreateShopDto,
  SellerProductDto,
  UpdateShopDto,
} from './dto/seller-shop.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

type AuthedReq = { user: { userId: string } };

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

  // === Self-serve seller portal (Phase B) - owner manages their own shop ===

  @Get('my-shop')
  @UseGuards(JwtAuthGuard)
  getMyShop(@Req() req: AuthedReq) {
    return this.catalogService.getMyShop(req.user.userId);
  }

  @Post('my-shop')
  @UseGuards(JwtAuthGuard)
  createMyShop(@Req() req: AuthedReq, @Body() dto: CreateShopDto) {
    return this.catalogService.createMyShop(req.user.userId, dto);
  }

  @Patch('my-shop')
  @UseGuards(JwtAuthGuard)
  updateMyShop(@Req() req: AuthedReq, @Body() dto: UpdateShopDto) {
    return this.catalogService.updateMyShop(req.user.userId, dto);
  }

  @Get('my-shop/products')
  @UseGuards(JwtAuthGuard)
  listMyProducts(@Req() req: AuthedReq) {
    return this.catalogService.listMyProducts(req.user.userId);
  }

  @Post('my-shop/products')
  @UseGuards(JwtAuthGuard)
  addMyProduct(@Req() req: AuthedReq, @Body() dto: SellerProductDto) {
    return this.catalogService.addMyProduct(req.user.userId, dto);
  }

  @Post('my-shop/products/bulk')
  @UseGuards(JwtAuthGuard)
  bulkAddMyProducts(@Req() req: AuthedReq, @Body() dto: BulkImportDto) {
    return this.catalogService.bulkAddMyProducts(req.user.userId, dto.products);
  }

  @Patch('my-shop/products/:id')
  @UseGuards(JwtAuthGuard)
  updateMyProduct(
    @Req() req: AuthedReq,
    @Param('id') id: string,
    @Body() dto: SellerProductDto,
  ) {
    return this.catalogService.updateMyProduct(req.user.userId, id, dto);
  }

  @Delete('my-shop/products/:id')
  @UseGuards(JwtAuthGuard)
  deleteMyProduct(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.catalogService.deleteMyProduct(req.user.userId, id);
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

  @Get('admin/shops')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listSellerShops() {
    return this.catalogService.listSellerShops();
  }

  @Post('admin/shops/:key/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setShopStatus(
    @Param('key') key: string,
    @Body('status') status: 'pending' | 'approved' | 'suspended',
  ) {
    return this.catalogService.setShopStatus(key, status);
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
