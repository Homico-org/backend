import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.PRO)
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
  @Roles(UserRole.CLIENT, UserRole.PRO)
  findByClient(@CurrentUser() user: any) {
    // Any user who posted jobs can see their reviews
    return this.reviewService.findByClient(user.userId);
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

  // ============== EXTERNAL REVIEWS ==============

  @Get('request-link')
  @ApiOperation({ summary: 'Get or create review request link for pro' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Review request link' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async getReviewLink(@CurrentUser() user: any) {
    return this.reviewService.getOrCreateReviewLink(user.userId);
  }

  @Get('request/:token')
  @ApiOperation({ summary: 'Get review request info by token (public)' })
  @ApiResponse({ status: 200, description: 'Review request info' })
  async getReviewRequest(
    @Param('token') token: string,
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return this.reviewService.getReviewRequestByToken(token, ip);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reviewService.findOne(id);
  }

  @Post('external/direct/:proId')
  @ApiOperation({ summary: 'Submit external review directly on a pro profile (authenticated)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Review submitted' })
  @UseGuards(JwtAuthGuard)
  async submitDirectExternalReview(
    @Param('proId') proId: string,
    @CurrentUser() user: any,
    @Body() data: {
      rating: number;
      text?: string;
      phone?: string; // For clients who need to verify
    },
  ) {
    return this.reviewService.submitDirectExternalReview(proId, user.userId, data);
  }

  @Post('external/:token')
  @ApiOperation({ summary: 'Submit external review (public)' })
  @ApiResponse({ status: 201, description: 'Review submitted successfully' })
  async submitExternalReview(
    @Param('token') token: string,
    @Body() data: {
      rating: number;
      text?: string;
      clientName: string;
      clientPhone?: string;
      clientEmail?: string;
      projectTitle?: string;
      isAnonymous?: boolean;
      photos?: string[];
    },
    @Req() req: any,
  ) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return this.reviewService.submitExternalReview(token, data, ip);
  }

  @Post('send-invitation')
  @ApiOperation({ summary: 'Send review invitation to past client' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Invitation sent' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async sendInvitation(
    @CurrentUser() user: any,
    @Body() data: { phone?: string; email?: string; name?: string },
  ) {
    return this.reviewService.sendReviewInvitation(user.userId, data);
  }

  @Get('stats/my')
  @ApiOperation({ summary: 'Get pro review statistics' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Review statistics' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async getMyStats(@CurrentUser() user: any) {
    return this.reviewService.getReviewStats(user.userId);
  }
}
