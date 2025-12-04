import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { LikesModule } from '../likes/likes.module';
import {
  PortfolioItem,
  PortfolioItemSchema,
} from '../portfolio/schemas/portfolio-item.schema';
import {
  ProProfile,
  ProProfileSchema,
} from '../pro-profile/schemas/pro-profile.schema';
import { User, UserSchema } from '../users/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PortfolioItem.name, schema: PortfolioItemSchema },
      { name: ProProfile.name, schema: ProProfileSchema },
      { name: User.name, schema: UserSchema },
    ]),
    LikesModule,
  ],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
