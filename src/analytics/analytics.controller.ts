import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { TrackEventsDto } from './dto/track-events.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('track')
  async track(@Body() dto: TrackEventsDto) {
    await this.analyticsService.trackEvents(dto.events);
    return { ok: true };
  }

  @Get('summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getSummary(
    @Query('event') event: string,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analyticsService.getSummary(
      event,
      days ? parseInt(days, 10) : 7,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getOverview(@Query('days') days?: string) {
    return this.analyticsService.getOverview(days ? parseInt(days, 10) : 7);
  }
}
