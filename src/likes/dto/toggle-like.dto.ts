import { IsEnum, IsMongoId } from 'class-validator';
import { LikeTargetType } from '../schemas/like.schema';

export class ToggleLikeDto {
  @IsEnum(LikeTargetType)
  targetType: LikeTargetType;

  @IsMongoId()
  targetId: string;
}

export class CheckLikedBatchDto {
  @IsEnum(LikeTargetType)
  targetType: LikeTargetType;

  @IsMongoId({ each: true })
  targetIds: string[];
}
