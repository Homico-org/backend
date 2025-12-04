import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { LikesService } from './likes.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ToggleLikeDto, CheckLikedBatchDto } from './dto/toggle-like.dto';
import { LikeTargetType } from './schemas/like.schema';

@Controller('likes')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post('toggle')
  @UseGuards(JwtAuthGuard)
  async toggleLike(@Request() req, @Body() dto: ToggleLikeDto) {
    const result = await this.likesService.toggleLike(
      req.user.sub,
      dto.targetType,
      dto.targetId,
    );
    return result;
  }

  @Get('count/:targetType/:targetId')
  async getLikeCount(
    @Param('targetType') targetType: LikeTargetType,
    @Param('targetId') targetId: string,
  ) {
    const count = await this.likesService.getLikeCount(targetType, targetId);
    return { count };
  }

  @Get('user/:targetType')
  @UseGuards(JwtAuthGuard)
  async getUserLikedItems(
    @Request() req,
    @Param('targetType') targetType: LikeTargetType,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const result = await this.likesService.getUserLikedItems(
      req.user.sub,
      targetType,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
    return result;
  }

  @Get('check/:targetType/:targetId')
  @UseGuards(JwtAuthGuard)
  async checkIfLiked(
    @Request() req,
    @Param('targetType') targetType: LikeTargetType,
    @Param('targetId') targetId: string,
  ) {
    const isLiked = await this.likesService.isLikedByUser(
      req.user.sub,
      targetType,
      targetId,
    );
    return { isLiked };
  }

  @Post('check-batch')
  @UseGuards(JwtAuthGuard)
  async checkIfLikedBatch(@Request() req, @Body() dto: CheckLikedBatchDto) {
    const [likedMap, countsMap] = await Promise.all([
      this.likesService.isLikedByUserBatch(
        req.user.sub,
        dto.targetType,
        dto.targetIds,
      ),
      this.likesService.getLikeCountsBatch(dto.targetType, dto.targetIds),
    ]);

    // Combine into a single response
    const result: Record<string, { isLiked: boolean; likeCount: number }> = {};
    dto.targetIds.forEach((id) => {
      result[id] = {
        isLiked: likedMap[id],
        likeCount: countsMap[id],
      };
    });

    return result;
  }
}
