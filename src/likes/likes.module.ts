import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';
import { Like, LikeSchema } from './schemas/like.schema';
import { LikeCount, LikeCountSchema } from './schemas/like-count.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Like.name, schema: LikeSchema },
      { name: LikeCount.name, schema: LikeCountSchema },
    ]),
  ],
  controllers: [LikesController],
  providers: [LikesService],
  exports: [LikesService],
})
export class LikesModule {}
