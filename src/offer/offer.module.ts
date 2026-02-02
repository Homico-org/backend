import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { Offer, OfferSchema } from './schemas/offer.schema';
import { ProjectRequest, ProjectRequestSchema } from '../project-request/schemas/project-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Offer.name, schema: OfferSchema },
      { name: ProjectRequest.name, schema: ProjectRequestSchema },
    ]),
  ],
  controllers: [OfferController],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
