import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { BackfillService } from './backfill.service';
import { TrackEventsDto } from './dto/track-events.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly backfillService: BackfillService,
  ) {}

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

  /**
   * Conversion funnel - powers the two funnel columns on /admin/analytics.
   * Bounded to admins because the absolute numbers are sensitive (reveals
   * the size of the marketplace).
   */
  /**
   * One-shot historical backfill. Walks existing Bookings / Proposals /
   * Reviews / Users and writes (event, target, date, count) rows with the
   * entity's original timestamps so /admin/analytics shows real history
   * from day one rather than waiting for live traffic to accumulate.
   *
   * Idempotent (uses $set, not $inc) - safe to re-run after wiring new
   * events. Admin-only because it surfaces aggregate marketplace data.
   */
  @Post('backfill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async backfill() {
    return this.backfillService.run();
  }

  @Get('funnel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getFunnel(
    @Query('days') days?: string,
    @Query('kind') kind?: string,
  ) {
    const parsedKind = kind === 'pro' ? 'pro' : 'client';
    return this.analyticsService.getFunnel(
      days ? parseInt(days, 10) : 7,
      parsedKind,
    );
  }
}
