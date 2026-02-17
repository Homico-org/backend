import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { QuoteRequest, QuoteRequestSchema } from './schemas/quote-request.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuoteRequest.name, schema: QuoteRequestSchema },
    ]),
  ],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
