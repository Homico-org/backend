import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActivityType, LoggerService } from '../common/logger';
import { UserRole } from '../users/schemas/user.schema';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly loggerService: LoggerService,
  ) {}

  // ============== PAGINATED LIST ENDPOINTS ==============

  @Get('users')
  @ApiOperation({ summary: 'Get all users with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, email, or phone' })
  @ApiQuery({ name: 'role', required: false, description: 'Filter by role' })
  @ApiResponse({ status: 200, description: 'Paginated users list' })
  getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
  ) {
    return this.adminService.getAllUsers({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      role,
    });
  }

  @Get('jobs')
  @ApiOperation({ summary: 'Get all jobs with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by title or category' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'Paginated jobs list' })
  getAllJobs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllJobs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
    });
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get all reports with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by reason' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by type' })
  @ApiResponse({ status: 200, description: 'Paginated reports list' })
  getAllReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.adminService.getAllReports({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
      type,
    });
  }

  @Get('report-stats')
  @ApiOperation({ summary: 'Get report statistics' })
  @ApiResponse({ status: 200, description: 'Report statistics' })
  getReportStats() {
    return this.adminService.getReportStats();
  }

  // ============== DASHBOARD STATS & RECENT DATA ==============

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

  // ============== ACTIVITY LOGS ==============

  @Get('activity-logs')
  @ApiOperation({ summary: 'Get activity logs with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50)' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by activity type' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'userEmail', required: false, description: 'Filter by user email' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter from date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter to date (ISO string)' })
  @ApiResponse({ status: 200, description: 'Paginated activity logs' })
  getActivityLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('userEmail') userEmail?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loggerService.getActivityLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      type,
      userId,
      userEmail,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('activity-stats')
  @ApiOperation({ summary: 'Get activity statistics' })
  @ApiResponse({ status: 200, description: 'Activity statistics' })
  getActivityStats() {
    return this.loggerService.getActivityStats();
  }

  @Get('activity-types')
  @ApiOperation({ summary: 'Get all activity types' })
  @ApiResponse({ status: 200, description: 'List of all activity types' })
  getActivityTypes() {
    return Object.values(ActivityType);
  }

  @Get('deleted-users')
  @ApiOperation({ summary: 'Get deleted users logs' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Deleted users logs with full user data' })
  getDeletedUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loggerService.getDeletedUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  // ============== PENDING PROFESSIONALS APPROVAL ==============

  @Get('pending-pros')
  @ApiOperation({ summary: 'Get pending professionals awaiting approval' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name, email, phone, or city' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status: pending, approved, rejected, all' })
  @ApiResponse({ status: 200, description: 'Paginated pending professionals list' })
  getPendingPros(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'pending' | 'approved' | 'rejected' | 'all',
  ) {
    return this.adminService.getPendingPros({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
    });
  }

  @Get('pending-pros/stats')
  @ApiOperation({ summary: 'Get pending professionals statistics' })
  @ApiResponse({ status: 200, description: 'Pending pros statistics' })
  getPendingProsStats() {
    return this.adminService.getPendingProsStats();
  }

  @Patch('pros/:id/approve')
  @ApiOperation({ summary: 'Approve a professional profile' })
  @ApiResponse({ status: 200, description: 'Professional approved successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async approvePro(
    @Param('id') proId: string,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?._id;
    return this.adminService.approvePro(proId, adminId);
  }

  @Patch('pros/:id/reject')
  @ApiOperation({ summary: 'Reject a professional profile' })
  @ApiResponse({ status: 200, description: 'Professional rejected successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async rejectPro(
    @Param('id') proId: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?._id;
    return this.adminService.rejectPro(proId, adminId, reason);
  }
}
