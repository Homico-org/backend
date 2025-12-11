import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProProfileService } from './pro-profile.service';
import { ProProfileController } from './pro-profile.controller';
import { ProProfile, ProProfileSchema } from './schemas/pro-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProProfile.name, schema: ProProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ProProfileController],
  providers: [ProProfileService],
  exports: [ProProfileService],
})
export class ProProfileModule {}
