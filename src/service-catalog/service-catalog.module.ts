import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './service-catalog.service';
import {
  ServiceCatalogCategory,
  ServiceCatalogCategorySchema,
} from './schemas/service-catalog.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ServiceCatalogCategory.name,
        schema: ServiceCatalogCategorySchema,
      },
    ]),
  ],
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
