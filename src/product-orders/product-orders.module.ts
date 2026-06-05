import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductOrdersController } from './product-orders.controller';
import { ProductOrdersService } from './product-orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  SupplierProduct,
  SupplierProductSchema,
} from '../supplier-catalog/schemas/supplier-product.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailService } from '../verification/services/email.service';

// PaymentsModule is @Global() so PaymentsService injects without importing it.
// EmailService is provided locally (VerificationModule doesn't export it; it's
// stateless / ConfigService-only).
@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: SupplierProduct.name, schema: SupplierProductSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ProductOrdersController],
  providers: [ProductOrdersService, EmailService],
  exports: [ProductOrdersService],
})
export class ProductOrdersModule {}
