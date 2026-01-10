import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.PRO, UserRole.COMPANY)
  create(
    @CurrentUser() user: any,
    @Body() createReviewDto: CreateReviewDto,
  ) {
    // Any user who posted a job can leave a review for the hired pro
    return this.reviewService.create(user.userId, createReviewDto);
  }

  @Get('pro/:proId')
  findByPro(
    @Param('proId') proId: string,
    @Query('limit') limit?: number,
    @Query('skip') skip?: number,
  ) {
    return this.reviewService.findByPro(proId, limit, skip);
  }

  @Get('my-reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.PRO, UserRole.COMPANY)
  findByClient(@CurrentUser() user: any) {
    // Any user who posted jobs can see their reviews
    return this.reviewService.findByClient(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reviewService.findOne(id);
  }

  @Get('check/job/:jobId')
  @UseGuards(JwtAuthGuard)
  async checkReviewExists(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    const hasReview = await this.reviewService.hasReviewForJob(user.userId, jobId);
    return { hasReview };
  }
}
