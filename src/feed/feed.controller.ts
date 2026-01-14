import { Controller, Get, Query, Request } from '@nestjs/common';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  async getFeed(
    @Query('category') category?: string,
    @Query('subcategories') subcategories?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '12',
    @Query('location') location?: string,
    @Query('minRating') minRating?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Request() req?: any,
  ) {
    // Extract user ID if authenticated (optional)
    const userId = req?.user?.sub;

    // Parse comma-separated subcategories into array
    const subcategoryList = subcategories ? subcategories.split(',').filter(s => s.trim()) : undefined;

    return this.feedService.getFeed({
      category,
      subcategories: subcategoryList,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      userId,
      location,
      minRating: minRating ? parseFloat(minRating) : undefined,
      search,
      sort,
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
