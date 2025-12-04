import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Dashboard statistics' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('recent-users')
  @ApiOperation({ summary: 'Get recent users' })
  @ApiResponse({ status: 200, description: 'Recent users list' })
  getRecentUsers(@Query('limit') limit?: string) {
    return this.adminService.getRecentUsers(limit ? parseInt(limit, 10) : 10);
  }

  @Get('recent-jobs')
  @ApiOperation({ summary: 'Get recent jobs' })
  @ApiResponse({ status: 200, description: 'Recent jobs list' })
  getRecentJobs(@Query('limit') limit?: string) {
    return this.adminService.getRecentJobs(limit ? parseInt(limit, 10) : 10);
  }

  @Get('recent-proposals')
  @ApiOperation({ summary: 'Get recent proposals' })
  @ApiResponse({ status: 200, description: 'Recent proposals list' })
  getRecentProposals(@Query('limit') limit?: string) {
    return this.adminService.getRecentProposals(limit ? parseInt(limit, 10) : 10);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get activity timeline' })
  @ApiResponse({ status: 200, description: 'Activity timeline' })
  getActivityTimeline(@Query('limit') limit?: string) {
    return this.adminService.getActivityTimeline(limit ? parseInt(limit, 10) : 20);
  }

  @Get('jobs-by-category')
  @ApiOperation({ summary: 'Get jobs grouped by category' })
  @ApiResponse({ status: 200, description: 'Jobs by category' })
  getJobsByCategory() {
    return this.adminService.getJobsByCategory();
  }

  @Get('jobs-by-location')
  @ApiOperation({ summary: 'Get jobs grouped by location' })
  @ApiResponse({ status: 200, description: 'Jobs by location' })
  getJobsByLocation() {
    return this.adminService.getJobsByLocation();
  }

  @Get('users-by-role')
  @ApiOperation({ summary: 'Get users grouped by role' })
  @ApiResponse({ status: 200, description: 'Users by role' })
  getUsersByRole() {
    return this.adminService.getUsersByRole();
  }

  @Get('daily-signups')
  @ApiOperation({ summary: 'Get daily signups for chart' })
  @ApiResponse({ status: 200, description: 'Daily signups data' })
  getDailySignups(@Query('days') days?: string) {
    return this.adminService.getDailySignups(days ? parseInt(days, 10) : 30);
  }

  @Get('daily-jobs')
  @ApiOperation({ summary: 'Get daily jobs for chart' })
  @ApiResponse({ status: 200, description: 'Daily jobs data' })
  getDailyJobs(@Query('days') days?: string) {
    return this.adminService.getDailyJobs(days ? parseInt(days, 10) : 30);
  }

  @Get('daily-proposals')
  @ApiOperation({ summary: 'Get daily proposals for chart' })
  @ApiResponse({ status: 200, description: 'Daily proposals data' })
  getDailyProposals(@Query('days') days?: string) {
    return this.adminService.getDailyProposals(days ? parseInt(days, 10) : 30);
  }
}
