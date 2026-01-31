import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PublicService } from './public.service';

@ApiTags('Public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get landing page statistics (no auth required)' })
  @ApiResponse({ status: 200, description: 'Landing page statistics' })
  getLandingStats() {
    return this.publicService.getLandingStats();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get recent platform activity (no auth required)' })
  @ApiResponse({ status: 200, description: 'Recent activity data' })
  getRecentActivity() {
    return this.publicService.getRecentActivity();
  }
}
