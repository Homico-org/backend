import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import {
  ServiceRequest,
  ServiceRequestSchema,
} from "./schemas/service-request.schema";
import { ServiceRequestsController } from "./service-requests.controller";
import { ServiceRequestsService } from "./service-requests.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ServiceRequest.name, schema: ServiceRequestSchema },
    ]),
  ],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService],
  exports: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
