import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { ProjectTrackingService } from './project-tracking.service';
import { WorkspaceService } from './workspace.service';
import { PollsService } from './polls.service';
import { CreateJobDto } from './dto/create-job.dto';
import { WorkspaceItemType, ReactionType } from './schemas/workspace.schema';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { JobStatus, JobPropertyType } from './schemas/job.schema';
import { ProjectStage } from './schemas/project-tracking.schema';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly projectTrackingService: ProjectTrackingService,
    private readonly workspaceService: WorkspaceService,
    private readonly pollsService: PollsService,
  ) {}

  // ============== STATIC ROUTES FIRST (before :id wildcard) ==============

  @Post()
  @ApiOperation({ summary: 'Create a new job posting' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Job created successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  createJob(@CurrentUser() user: any, @Body() createJobDto: CreateJobDto) {
    return this.jobsService.createJob(user.userId, createJobDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs with optional filters' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'categories', required: false, description: 'Comma-separated list or multiple params for categories' })
  @ApiQuery({ name: 'subcategories', required: false, description: 'Comma-separated list or multiple params for subcategories/skills' })
  @ApiQuery({ name: 'location', required: false })
  @ApiQuery({ name: 'budgetMin', required: false })
  @ApiQuery({ name: 'budgetMax', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: JobStatus })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 10)' })
  @ApiQuery({ name: 'sort', required: false, description: 'Sort order: newest, oldest, budget-high, budget-low' })
  @ApiQuery({ name: 'propertyType', required: false, enum: JobPropertyType, description: 'Property type filter' })
  @ApiQuery({ name: 'proposalCountMin', required: false, description: 'Minimum proposal count' })
  @ApiQuery({ name: 'proposalCountMax', required: false, description: 'Maximum proposal count' })
  @ApiQuery({ name: 'createdAfter', required: false, description: 'Jobs created after this date (ISO string)' })
  @ApiQuery({ name: 'createdBefore', required: false, description: 'Jobs created before this date (ISO string)' })
  @ApiQuery({ name: 'clientType', required: false, description: 'Filter by client type: individual or organization' })
  @ApiQuery({ name: 'deadline', required: false, description: 'Deadline filter: urgent (< 7 days), week, month, flexible' })
  @ApiQuery({ name: 'savedOnly', required: false, description: 'Filter to only show saved/favorite jobs (requires auth)' })
  @ApiResponse({ status: 200, description: 'List of jobs with pagination' })
  @UseGuards(OptionalJwtAuthGuard)
  findAllJobs(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('categories') categories?: string | string[],
    @Query('subcategories') subcategories?: string | string[],
    @Query('location') location?: string,
    @Query('budgetMin') budgetMin?: string,
    @Query('budgetMax') budgetMax?: string,
    @Query('search') search?: string,
    @Query('status') status?: JobStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('propertyType') propertyType?: JobPropertyType,
    @Query('proposalCountMin') proposalCountMin?: string,
    @Query('proposalCountMax') proposalCountMax?: string,
    @Query('createdAfter') createdAfter?: string,
    @Query('createdBefore') createdBefore?: string,
    @Query('clientType') clientType?: string,
    @Query('deadline') deadline?: string,
    @Query('savedOnly') savedOnly?: string,
  ) {
    // Handle categories - can be array of params or comma-separated string
    let categoriesArray: string[] | undefined;
    if (categories) {
      if (Array.isArray(categories)) {
        categoriesArray = categories;
      } else {
        categoriesArray = categories.split(',').map(c => c.trim());
      }
    }

    // Handle subcategories - can be array of params or comma-separated string
    let subcategoriesArray: string[] | undefined;
    if (subcategories) {
      if (Array.isArray(subcategories)) {
        subcategoriesArray = subcategories;
      } else {
        subcategoriesArray = subcategories.split(',').map(s => s.trim());
      }
    }

    return this.jobsService.findAllJobs({
      category,
      categories: categoriesArray,
      subcategories: subcategoriesArray,
      location,
      budgetMin: budgetMin ? parseFloat(budgetMin) : undefined,
      budgetMax: budgetMax ? parseFloat(budgetMax) : undefined,
      search,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      sort: sort || 'newest',
      propertyType,
      proposalCountMin: proposalCountMin ? parseInt(proposalCountMin, 10) : undefined,
      proposalCountMax: proposalCountMax ? parseInt(proposalCountMax, 10) : undefined,
      createdAfter: createdAfter ? new Date(createdAfter) : undefined,
      createdBefore: createdBefore ? new Date(createdBefore) : undefined,
      clientType,
      deadline,
      savedOnly: savedOnly === 'true',
      userId: user?.userId,
    });
  }

  @Get('my-jobs')
  @ApiOperation({ summary: 'Get my job postings' })
  @ApiBearerAuth('JWT-auth')
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status: open, in_progress, completed, cancelled' })
  @ApiResponse({ status: 200, description: 'List of my jobs' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.PRO, UserRole.ADMIN)
  findMyJobs(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.jobsService.findMyJobs(user.userId, status);
  }

  @Get('my-proposals/list')
  @ApiOperation({ summary: 'Get my proposals (pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of my proposals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  findMyProposals(@CurrentUser() user: any) {
    return this.jobsService.findMyProposals(user.userId);
  }

  @Get('saved/list')
  @ApiOperation({ summary: 'Get list of saved job IDs' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of saved job IDs' })
  @UseGuards(JwtAuthGuard)
  getSavedJobIds(@CurrentUser() user: any) {
    return this.jobsService.getSavedJobIds(user.userId);
  }

  // Header counter endpoints
  @Get('counters/unviewed-proposals')
  @ApiOperation({ summary: 'Get count of unviewed proposals on my jobs (for clients)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Count of unviewed proposals' })
  @UseGuards(JwtAuthGuard)
  async getUnviewedProposalsCount(@CurrentUser() user: any) {
    const count = await this.jobsService.getUnviewedProposalsCount(user.userId);
    return { count };
  }

  @Get('counters/proposal-updates')
  @ApiOperation({ summary: 'Get count of proposal status updates not viewed by pro' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Count of proposal updates' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  async getProposalUpdatesCount(@CurrentUser() user: any) {
    const count = await this.jobsService.getUnviewedProposalUpdatesCount(user.userId);
    return { count };
  }

  @Post('counters/mark-proposals-viewed/:jobId')
  @ApiOperation({ summary: 'Mark proposals as viewed by client for a specific job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposals marked as viewed' })
  @UseGuards(JwtAuthGuard)
  async markProposalsAsViewed(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    await this.jobsService.markProposalsAsViewedByClient(jobId, user.userId);
    return { success: true };
  }

  @Post('counters/mark-proposal-updates-viewed')
  @ApiOperation({ summary: 'Mark all proposal updates as viewed by pro' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal updates marked as viewed' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO, UserRole.ADMIN)
  async markProposalUpdatesAsViewed(@CurrentUser() user: any) {
    await this.jobsService.markProposalUpdatesAsViewedByPro(user.userId);
    return { success: true };
  }

  // Proposal static routes (before :jobId wildcard)
  @Post('proposals/:proposalId/reveal-contact')
  @ApiOperation({ summary: 'Reveal pro contact information' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Contact revealed successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  revealContact(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.revealContact(proposalId, user.userId);
  }

  @Post('proposals/:proposalId/shortlist')
  @ApiOperation({ summary: 'Shortlist a proposal and choose hiring method' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal shortlisted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  shortlistProposal(
    @Param('proposalId') proposalId: string,
    @Body('hiringChoice') hiringChoice: 'homico' | 'direct',
    @CurrentUser() user: any,
  ) {
    return this.jobsService.shortlistProposal(proposalId, user.userId, hiringChoice);
  }

  @Post('proposals/:proposalId/accept')
  @ApiOperation({ summary: 'Accept a proposal' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal accepted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  acceptProposal(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.acceptProposal(proposalId, user.userId);
  }

  @Post('proposals/:proposalId/reject')
  @ApiOperation({ summary: 'Reject a proposal' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal rejected successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  rejectProposal(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.rejectProposal(proposalId, user.userId);
  }

  @Post('proposals/:proposalId/revert-to-pending')
  @ApiOperation({ summary: 'Revert a shortlisted/rejected proposal back to pending' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal reverted to pending successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  revertToPending(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.revertProposalToPending(proposalId, user.userId);
  }

  @Post('proposals/:proposalId/withdraw')
  @ApiOperation({ summary: 'Withdraw a proposal (pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal withdrawn successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  withdrawProposal(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.withdrawProposal(proposalId, user.userId);
  }

  // ============== PROJECT TRACKING ROUTES ==============

  @Get('projects/my-projects')
  @ApiOperation({ summary: 'Get all my active projects (as client or pro)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of projects' })
  @UseGuards(JwtAuthGuard)
  async getMyProjects(
    @CurrentUser() user: any,
    @Query('role') role?: 'client' | 'pro',
  ) {
    const userRole = role || (user.role === 'pro' ? 'pro' : 'client');
    return this.projectTrackingService.getUserProjects(user.userId, userRole);
  }

  @Get('projects/:jobId')
  @ApiOperation({ summary: 'Get project tracking details for a job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Project tracking details' })
  @UseGuards(JwtAuthGuard)
  async getProjectDetails(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.projectTrackingService.getProjectDetails(jobId, user.userId);
  }

  @Patch('projects/:jobId/stage')
  @ApiOperation({ summary: 'Update project stage' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Stage updated successfully' })
  @UseGuards(JwtAuthGuard)
  async updateProjectStage(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: { stage: ProjectStage; note?: string },
  ) {
    return this.projectTrackingService.updateStage(jobId, user.userId, body.stage, body.note);
  }

  @Post('projects/:jobId/confirm-completion')
  @ApiOperation({ summary: 'Client confirms project completion and triggers payment' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Project confirmed and closed successfully' })
  @UseGuards(JwtAuthGuard)
  async confirmProjectCompletion(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.confirmCompletion(jobId, user.userId);
  }

  @Patch('projects/:jobId/progress')
  @ApiOperation({ summary: 'Update project progress percentage' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Progress updated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async updateProjectProgress(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: { progress: number },
  ) {
    return this.projectTrackingService.updateProgress(jobId, user.userId, body.progress);
  }

  @Patch('projects/:jobId/expected-end-date')
  @ApiOperation({ summary: 'Set expected end date for project' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Expected end date updated' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async setExpectedEndDate(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: { expectedEndDate: string },
  ) {
    return this.projectTrackingService.setExpectedEndDate(
      jobId,
      user.userId,
      new Date(body.expectedEndDate),
    );
  }

  @Post('projects/:jobId/comments')
  @ApiOperation({ summary: 'Add comment to project' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Comment added successfully' })
  @UseGuards(JwtAuthGuard)
  async addProjectComment(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: { content: string },
  ) {
    return this.projectTrackingService.addComment(jobId, user.userId, body.content);
  }

  @Get('projects/:jobId/messages')
  @ApiOperation({ summary: 'Get project messages' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getProjectMessages(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.getMessages(jobId, user.userId);
  }

  @Post('projects/:jobId/messages')
  @ApiOperation({ summary: 'Send message in project' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  @UseGuards(JwtAuthGuard)
  async sendProjectMessage(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: { content: string; attachments?: string[] },
  ) {
    return this.projectTrackingService.addMessage(jobId, user.userId, body.content, body.attachments);
  }

  @Post('projects/:jobId/messages/read')
  @ApiOperation({ summary: 'Mark project messages as read' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Messages marked as read' })
  @UseGuards(JwtAuthGuard)
  async markMessagesAsRead(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.markMessagesAsRead(jobId, user.userId);
  }

  @Post('projects/:jobId/polls/viewed')
  @ApiOperation({ summary: 'Mark polls as viewed' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Polls marked as viewed' })
  @UseGuards(JwtAuthGuard)
  async markPollsAsViewed(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.markPollsAsViewed(jobId, user.userId);
  }

  @Post('projects/:jobId/materials/viewed')
  @ApiOperation({ summary: 'Mark materials as viewed' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Materials marked as viewed' })
  @UseGuards(JwtAuthGuard)
  async markMaterialsAsViewed(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.markMaterialsAsViewed(jobId, user.userId);
  }

  @Get('projects/:jobId/unread-counts')
  @ApiOperation({ summary: 'Get unread counts for chat, polls, materials' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  async getUnreadCounts(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.getUnreadCounts(jobId, user.userId);
  }

  @Post('projects/:jobId/attachments')
  @ApiOperation({ summary: 'Add attachment to project' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Attachment added successfully' })
  @UseGuards(JwtAuthGuard)
  async addProjectAttachment(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: {
      fileName: string;
      fileUrl: string;
      fileType: string;
      fileSize?: number;
      description?: string;
    },
  ) {
    return this.projectTrackingService.addAttachment(jobId, user.userId, body);
  }

  @Delete('projects/:jobId/attachments/:index')
  @ApiOperation({ summary: 'Delete attachment from project' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Attachment deleted successfully' })
  @UseGuards(JwtAuthGuard)
  async deleteProjectAttachment(
    @Param('jobId') jobId: string,
    @Param('index') index: string,
    @CurrentUser() user: any,
  ) {
    return this.projectTrackingService.deleteAttachment(jobId, user.userId, parseInt(index, 10));
  }

  @Get('projects/:jobId/history')
  @ApiOperation({ summary: 'Get project history/activity log' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Project history' })
  @UseGuards(JwtAuthGuard)
  async getProjectHistory(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('eventTypes') eventTypes?: string,
    @Query('userFilter') userFilter?: string,
  ) {
    return this.projectTrackingService.getProjectHistory(jobId, user.userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      eventTypes: eventTypes ? eventTypes.split(',') as any : undefined,
      userFilter,
    });
  }

  // ============== WORKSPACE ROUTES ==============

  @Get('projects/:jobId/workspace')
  @ApiOperation({ summary: 'Get workspace for a project' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Workspace data' })
  @UseGuards(JwtAuthGuard)
  async getWorkspace(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.workspaceService.getWorkspace(jobId, user.userId);
  }

  @Post('projects/:jobId/workspace/sections')
  @ApiOperation({ summary: 'Create a new section in workspace' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Section created successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async createSection(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: {
      title: string;
      description?: string;
      attachments?: Array<{
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize?: number;
      }>;
    },
  ) {
    return this.workspaceService.createSection(jobId, user.userId, body);
  }

  @Patch('projects/:jobId/workspace/sections/:sectionId')
  @ApiOperation({ summary: 'Update a section' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Section updated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async updateSection(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: any,
    @Body() body: {
      title?: string;
      description?: string;
      attachments?: Array<{
        _id?: string;
        fileName: string;
        fileUrl: string;
        fileType: string;
        fileSize?: number;
      }>;
    },
  ) {
    return this.workspaceService.updateSection(jobId, sectionId, user.userId, body);
  }

  @Delete('projects/:jobId/workspace/sections/:sectionId')
  @ApiOperation({ summary: 'Delete a section' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Section deleted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async deleteSection(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: any,
  ) {
    await this.workspaceService.deleteSection(jobId, sectionId, user.userId);
    return { success: true };
  }

  @Post('projects/:jobId/workspace/sections/:sectionId/items')
  @ApiOperation({ summary: 'Add an item to a section' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Item added successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async createItem(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: any,
    @Body() body: {
      title: string;
      description?: string;
      type: WorkspaceItemType;
      fileUrl?: string;
      linkUrl?: string;
      price?: number;
      currency?: string;
      storeName?: string;
      storeAddress?: string;
    },
  ) {
    return this.workspaceService.createItem(jobId, sectionId, user.userId, body);
  }

  @Patch('projects/:jobId/workspace/sections/:sectionId/items/:itemId')
  @ApiOperation({ summary: 'Update an item' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async updateItem(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
    @Body() body: {
      title?: string;
      description?: string;
      fileUrl?: string;
      linkUrl?: string;
      price?: number;
      currency?: string;
      storeName?: string;
      storeAddress?: string;
    },
  ) {
    return this.workspaceService.updateItem(jobId, sectionId, itemId, user.userId, body);
  }

  @Delete('projects/:jobId/workspace/sections/:sectionId/items/:itemId')
  @ApiOperation({ summary: 'Delete an item' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Item deleted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async deleteItem(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
  ) {
    await this.workspaceService.deleteItem(jobId, sectionId, itemId, user.userId);
    return { success: true };
  }

  @Post('projects/:jobId/workspace/sections/:sectionId/items/:itemId/reactions')
  @ApiOperation({ summary: 'Toggle reaction on an item' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Reaction toggled' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.PRO, UserRole.COMPANY)
  async toggleReaction(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
    @Body() body: { type: ReactionType },
  ) {
    return this.workspaceService.toggleReaction(
      jobId,
      sectionId,
      itemId,
      user.userId,
      body.type,
    );
  }

  @Post('projects/:jobId/workspace/sections/:sectionId/items/:itemId/comments')
  @ApiOperation({ summary: 'Add comment on an item' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Comment added' })
  @UseGuards(JwtAuthGuard)
  async addItemComment(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: any,
    @Body() body: { content: string },
  ) {
    return this.workspaceService.addComment(
      jobId,
      sectionId,
      itemId,
      user.userId,
      body.content,
    );
  }

  @Delete('projects/:jobId/workspace/sections/:sectionId/items/:itemId/comments/:commentId')
  @ApiOperation({ summary: 'Delete a comment' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Comment deleted' })
  @UseGuards(JwtAuthGuard)
  async deleteItemComment(
    @Param('jobId') jobId: string,
    @Param('sectionId') sectionId: string,
    @Param('itemId') itemId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: any,
  ) {
    await this.workspaceService.deleteComment(
      jobId,
      sectionId,
      itemId,
      commentId,
      user.userId,
    );
    return { success: true };
  }

  @Patch('projects/:jobId/workspace/sections/reorder')
  @ApiOperation({ summary: 'Reorder sections' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Sections reordered' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async reorderSections(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() body: { sectionIds: string[] },
  ) {
    return this.workspaceService.reorderSections(jobId, user.userId, body.sectionIds);
  }

  // ============== DYNAMIC ROUTES LAST (with :id/:jobId wildcards) ==============

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  @UseGuards(OptionalJwtAuthGuard)
  findJobById(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Req() req: any,
  ) {
    const userId = user?.userId;
    // Use IP address as visitor ID for anonymous users
    const visitorId = !userId ? (req.ip || req.headers['x-forwarded-for'] || 'unknown') : undefined;
    return this.jobsService.findJobById(id, userId, visitorId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  updateJob(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() updateJobDto: Partial<CreateJobDto>,
  ) {
    return this.jobsService.updateJob(id, user.userId, updateJobDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job deleted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  async deleteJob(@Param('id') id: string, @CurrentUser() user: any) {
    await this.jobsService.deleteJob(id, user.userId);
    return { message: 'Job deleted successfully' };
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Mark job as completed and add to pro portfolio' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job completed successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY)
  async completeJob(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() completionData?: {
      completionImages?: string[];
      completionNote?: string;
      beforeImages?: string[];
      afterImages?: string[];
    },
  ) {
    return this.jobsService.completeJob(id, user.userId, completionData);
  }

  @Post(':id/renew')
  @ApiOperation({ summary: 'Renew an expired job for another 30 days' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job renewed successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  async renewJob(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobsService.renewJob(id, user.userId);
  }

  @Post(':jobId/proposals')
  @ApiOperation({ summary: 'Submit proposal for a job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Proposal submitted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async createProposal(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() createProposalDto: CreateProposalDto,
  ) {
    return this.jobsService.createProposal(
      jobId,
      user.userId,
      user.proProfileId,
      createProposalDto,
    );
  }

  @Get(':jobId/proposals')
  @ApiOperation({ summary: 'Get proposals for a job (job owner only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of proposals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY, UserRole.PRO)
  findJobProposals(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.jobsService.findJobProposals(jobId, user.userId);
  }

  @Get(':jobId/my-proposal')
  @ApiOperation({ summary: 'Get my proposal for a specific job (pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'My proposal for the job or null' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  findMyProposalForJob(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.jobsService.findMyProposalForJob(jobId, user.userId);
  }

  @Post(':jobId/save')
  @ApiOperation({ summary: 'Save a job to favorites' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job saved successfully' })
  @UseGuards(JwtAuthGuard)
  saveJob(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.jobsService.saveJob(user.userId, jobId);
  }

  @Delete(':jobId/save')
  @ApiOperation({ summary: 'Remove a job from favorites' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job removed from favorites' })
  @UseGuards(JwtAuthGuard)
  unsaveJob(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.jobsService.unsaveJob(user.userId, jobId);
  }

  // ============== POLLS ENDPOINTS ==============

  @Get(':jobId/polls')
  @ApiOperation({ summary: 'Get all polls for a job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of polls for the job' })
  @UseGuards(JwtAuthGuard)
  async getPolls(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.pollsService.getPollsByJobId(jobId, user.userId);
  }

  @Post(':jobId/polls')
  @ApiOperation({ summary: 'Create a new poll for a job (Pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 201, description: 'Poll created successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async createPoll(
    @Param('jobId') jobId: string,
    @CurrentUser() user: any,
    @Body() createPollDto: { title: string; description?: string; options: { text?: string; imageUrl?: string }[] },
  ) {
    return this.pollsService.createPoll(jobId, user.userId, createPollDto);
  }

  @Post('polls/:pollId/vote')
  @ApiOperation({ summary: 'Vote on a poll option (Client only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Vote recorded successfully' })
  @UseGuards(JwtAuthGuard)
  async votePoll(
    @Param('pollId') pollId: string,
    @CurrentUser() user: any,
    @Body() body: { optionId: string },
  ) {
    return this.pollsService.vote(pollId, user.userId, body.optionId);
  }

  @Post('polls/:pollId/approve')
  @ApiOperation({ summary: 'Approve a poll option (Client only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Poll approved successfully' })
  @UseGuards(JwtAuthGuard)
  async approvePoll(
    @Param('pollId') pollId: string,
    @CurrentUser() user: any,
    @Body() body: { optionId: string },
  ) {
    return this.pollsService.approve(pollId, user.userId, body.optionId);
  }

  @Post('polls/:pollId/close')
  @ApiOperation({ summary: 'Close a poll (Pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Poll closed successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async closePoll(@Param('pollId') pollId: string, @CurrentUser() user: any) {
    return this.pollsService.close(pollId, user.userId);
  }

  @Delete('polls/:pollId')
  @ApiOperation({ summary: 'Delete a poll (Pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Poll deleted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  async deletePoll(@Param('pollId') pollId: string, @CurrentUser() user: any) {
    await this.pollsService.delete(pollId, user.userId);
    return { success: true };
  }
}
