import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProProfileService } from './pro-profile.service';
import { ProProfileController } from './pro-profile.controller';
import { ProProfile, ProProfileSchema } from './schemas/pro-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProProfile.name, schema: ProProfileSchema },
    ]),
  ],
  controllers: [ProProfileController],
  providers: [ProProfileService],
  exports: [ProProfileService],
})
export class ProProfileModule {}
