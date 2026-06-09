import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductOrdersService } from './product-orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto, RefundOrderDto } from './dto/admin-order.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('orders')
export class ProductOrdersController {
  constructor(private readonly ordersService: ProductOrdersService) {}

  // === Customer ===

  @Post('quote')
  @UseGuards(JwtAuthGuard)
  quote(@Body() dto: CreateOrderDto) {
    return this.ordersService.quote(dto);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(user.userId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: { userId: string }) {
    return this.ordersService.listMyOrders(user.userId);
  }

  // Admin routes are declared before ':id' so 'admin' isn't captured as an id.
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listAdmin(
    @Query('status') status?: string,
    @Query('supplierKey') supplierKey?: string,
    @Query('page') page?: string,
  ) {
    return this.ordersService.listOrders({ status, supplierKey, page });
  }

  @Get('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdmin(@Param('id') id: string) {
    return this.ordersService.getOrderAdmin(id);
  }

  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto.status, user.userId, dto.note);
  }

  @Post('admin/:id/refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  refund(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.ordersService.refundOrder(id, user.userId, dto.reason, dto.amountMinor);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.ordersService.getMyOrder(user.userId, id);
  }

  @Get(':id/reconcile')
  @UseGuards(JwtAuthGuard)
  reconcile(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.ordersService.reconcile(user.userId, id);
  }

  // Cancel an order that hasn't been paid yet.
  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.ordersService.cancelMyOrder(user.userId, id);
  }

  // Resume payment for an unfinished order - returns a fresh redirectUrl.
  @Post(':id/pay')
  @UseGuards(JwtAuthGuard)
  pay(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.ordersService.resumePayment(user.userId, id);
  }
}
