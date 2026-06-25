import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActivityType, LoggerService } from '../common/logger';
import { UserRole } from '../users/schemas/user.schema';
import { ProfileViewType } from '../users/schemas/profile-view.schema';
import { AdminService } from './admin.service';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';

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

  @Post('users')
  @ApiOperation({ summary: 'Create a new user (any role, including admin)' })
  @ApiResponse({ status: 201, description: 'Created user' })
  async createUser(@Body() dto: AdminCreateUserDto, @Req() req: { user: { userId: string } }) {
    const created = await this.adminService.createUser(dto);
    await this.loggerService.logActivity({
      type: ActivityType.ADMIN_USER_CREATE,
      userId: req.user.userId,
      targetId: String(created._id),
      targetType: 'user',
      details: {
        role: dto.role,
        email: created.email,
        phone: created.phone,
      },
    });
    return {
      id: String(created._id),
      uid: created.uid,
      role: created.role,
      email: created.email,
      phone: created.phone,
      name: created.name,
    };
  }

  @Get('available-roles')
  @ApiOperation({ summary: 'List role values selectable in the admin create-user UI' })
  getAvailableRoles() {
    return { roles: this.adminService.getAvailableRoles() };
  }

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

  @Get('view-stats')
  @ApiOperation({ summary: 'Leaderboard of pros ranked by profile/phone opens' })
  @ApiQuery({ name: 'type', required: false, description: 'profile | phone (default: phone)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiResponse({ status: 200, description: 'Ranked pros with open counts' })
  getViewStats(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getViewStats({
      type: type === 'profile' ? ProfileViewType.PROFILE : ProfileViewType.PHONE,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('view-logs')
  @ApiOperation({ summary: 'Audit journal of every profile/phone open' })
  @ApiQuery({ name: 'type', required: false, description: 'profile | phone (default: phone)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 50)' })
  @ApiResponse({ status: 200, description: 'Paginated open journal, newest first' })
  getViewLogs(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getViewLogs({
      type: type === 'profile' ? ProfileViewType.PROFILE : ProfileViewType.PHONE,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
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

  @Get('bookings')
  @ApiOperation({ summary: 'Get all bookings with pagination and filters' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by client/pro name or phone' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by booking status' })
  @ApiResponse({ status: 200, description: 'Paginated bookings list' })
  getAllBookings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getAllBookings({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
    });
  }

  @Get('bookings/stats')
  @ApiOperation({ summary: 'Booking status + paid-GMV counters' })
  @ApiResponse({ status: 200, description: 'Booking statistics' })
  getBookingStats() {
    return this.adminService.getBookingStats();
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

  @Get('traction')
  @ApiOperation({ summary: 'Founder traction dashboard (0->10 phase)' })
  @ApiResponse({ status: 200, description: 'Traction metrics' })
  getTraction() {
    return this.adminService.getTraction();
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

  @Get('funnel')
  @ApiOperation({ summary: 'Marketplace liquidity funnel (jobs flow)' })
  @ApiResponse({ status: 200, description: 'Funnel counts + conversion rates' })
  getFunnel(
    @Query('days') days?: string,
    @Query('country') country?: string,
  ) {
    return this.adminService.getFunnel(
      days ? parseInt(days, 10) : 30,
      country || undefined,
    );
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
    @Query('q') q?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.loggerService.getActivityLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      type,
      userId,
      userEmail,
      q,
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
    const adminId = req.user?.userId;
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
    const adminId = req.user?.userId;
    return this.adminService.rejectPro(proId, adminId, reason);
  }

  @Patch('pros/:id/verification')
  @ApiOperation({ summary: 'Update professional verification status and notes' })
  @ApiResponse({ status: 200, description: 'Verification status updated successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async updateVerification(
    @Param('id') proId: string,
    @Body() body: { status: string; notes?: string; notifyUser?: boolean },
    @Req() req: any,
  ) {
    const adminId = req.user?.userId;
    return this.adminService.updateVerificationStatus(proId, adminId, body.status, body.notes, body.notifyUser);
  }

  // ── Profile change moderation ────────────────────────────────────────────

  @Get('profile-changes')
  @ApiOperation({ summary: 'List profile change requests awaiting review' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by pro name' })
  @ApiQuery({ name: 'status', required: false, description: 'pending | approved | rejected | all (default: pending)' })
  @ApiResponse({ status: 200, description: 'Paginated profile change requests' })
  getProfileChanges(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'pending' | 'approved' | 'rejected' | 'all',
  ) {
    return this.adminService.getProfileChangeRequests({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
    });
  }

  @Get('profile-changes/stats')
  @ApiOperation({ summary: 'Profile change request counts by status' })
  @ApiResponse({ status: 200, description: 'Profile change stats' })
  getProfileChangesStats() {
    return this.adminService.getProfileChangeRequestsStats();
  }

  @Get('profile-changes/:id')
  @ApiOperation({ summary: 'Get a single profile change request (full diff)' })
  @ApiResponse({ status: 200, description: 'Profile change request' })
  getProfileChange(@Param('id') id: string) {
    return this.adminService.getProfileChangeRequest(id);
  }

  @Patch('profile-changes/:id/approve')
  @ApiOperation({ summary: 'Approve a profile change request (applies the change)' })
  @ApiResponse({ status: 200, description: 'Change approved and applied' })
  async approveProfileChange(@Param('id') id: string, @Req() req: any) {
    const adminId = req.user?.userId;
    return this.adminService.approveProfileChange(id, adminId);
  }

  @Patch('profile-changes/:id/reject')
  @ApiOperation({ summary: 'Reject a profile change request with a reason' })
  @ApiResponse({ status: 200, description: 'Change rejected' })
  async rejectProfileChange(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const adminId = req.user?.userId;
    return this.adminService.rejectProfileChange(id, adminId, reason);
  }

  @Patch('pros/:id/featured')
  @ApiOperation({ summary: 'Toggle a professional as editorially featured' })
  @ApiResponse({ status: 200, description: 'Featured flag updated successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async setFeatured(
    @Param('id') proId: string,
    @Body('featured') featured: boolean,
  ) {
    return this.adminService.setFeatured(proId, !!featured);
  }

  @Patch('pros/:id/homico-partner')
  @ApiOperation({
    summary: 'Toggle a professional as a Homico Partner (bookable)',
  })
  @ApiResponse({ status: 200, description: 'Partner flag updated successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async setHomicoPartner(
    @Param('id') proId: string,
    @Body('partner') partner: boolean,
  ) {
    return this.adminService.setHomicoPartner(proId, !!partner);
  }

  @Patch('pros/:id/top-quality')
  @ApiOperation({
    summary: 'Grant/revoke the Top Quality badge (admin only, display badge)',
  })
  @ApiResponse({ status: 200, description: 'Top Quality flag updated successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async setTopQuality(
    @Param('id') proId: string,
    @Body('topQuality') topQuality: boolean,
  ) {
    return this.adminService.setTopQuality(proId, !!topQuality);
  }

  @Patch('pros/:id/premium')
  @ApiOperation({
    summary: 'Manually grant/revoke the Premium badge (pre-payment, admin only)',
  })
  @ApiResponse({ status: 200, description: 'Premium flag updated successfully' })
  @ApiResponse({ status: 404, description: 'Professional not found' })
  async setPremium(
    @Param('id') proId: string,
    @Body('premium') premium: boolean,
  ) {
    return this.adminService.setPremium(proId, !!premium);
  }

  // ============== JOB MANAGEMENT ==============

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get job details by ID' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getJobById(@Param('id') jobId: string) {
    return this.adminService.getJobById(jobId);
  }

  @Patch('jobs/:id')
  @ApiOperation({ summary: 'Update a job' })
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  updateJob(
    @Param('id') jobId: string,
    @Body() updateData: any,
  ) {
    return this.adminService.updateJob(jobId, updateData);
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: 'Delete a job' })
  @ApiResponse({ status: 200, description: 'Job deleted successfully' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  deleteJob(@Param('id') jobId: string) {
    return this.adminService.deleteJob(jobId);
  }

  @Get('jobs/:id/proposals')
  @ApiOperation({ summary: 'Get proposals for a job' })
  @ApiResponse({ status: 200, description: 'List of proposals' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getJobProposals(@Param('id') jobId: string) {
    return this.adminService.getJobProposals(jobId);
  }

  // ============== INVITE MANAGEMENT ==============

  @Get('invites')
  @ApiOperation({ summary: 'Get invite tokens with pagination and filters' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by name or phone' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status: pending, sms_sent, opened, activated, all' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by type: professional, service, tool-rental, all' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiResponse({ status: 200, description: 'Paginated invite tokens list' })
  getInvites(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
  ) {
    return this.adminService.getInvites({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      status,
      type,
      category,
    });
  }

  @Get('invites/stats')
  @ApiOperation({ summary: 'Get invite token statistics' })
  @ApiResponse({ status: 200, description: 'Invite statistics' })
  getInviteStats() {
    return this.adminService.getInviteStats();
  }

  @Delete('invites/:id')
  @ApiOperation({ summary: 'Delete an invite token' })
  @ApiResponse({ status: 200, description: 'Invite deleted successfully' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  deleteInvite(@Param('id') id: string) {
    return this.adminService.deleteInvite(id);
  }

  @Patch('invites/:id/resend')
  @ApiOperation({ summary: 'Resend SMS for an invite token' })
  @ApiResponse({ status: 200, description: 'Invite marked for SMS resend' })
  @ApiResponse({ status: 404, description: 'Invite not found' })
  resendInviteSms(@Param('id') id: string) {
    return this.adminService.resendInviteSms(id);
  }

  // ============== MIGRATIONS ==============

  @Patch('migrate/sync-verification-status')
  @ApiOperation({ summary: 'Sync verificationStatus for all previously approved users' })
  @ApiResponse({ status: 200, description: 'Migration completed successfully' })
  async syncVerificationStatus() {
    return this.adminService.syncVerificationStatus();
  }
}
