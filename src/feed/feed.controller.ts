import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  async getFeed(
    @Query('category') category?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '12',
    @Request() req?: any,
  ) {
    // Extract user ID if authenticated (optional)
    const userId = req?.user?.sub;

    return this.feedService.getFeed({
      category,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      userId,
    });
  }

  @Get('highlights')
  async getProHighlights(
    @Query('category') category?: string,
    @Query('limit') limit: string = '5',
  ) {
    return this.feedService.getProHighlights({
      category,
      limit: parseInt(limit, 10),
    });
  }
}
