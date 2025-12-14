import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { JobStatus, JobPropertyType } from './schemas/job.schema';

@ApiTags('Jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // Job endpoints
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
  @ApiQuery({ name: 'categories', required: false, description: 'Comma-separated list of categories' })
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
  @ApiResponse({ status: 200, description: 'List of jobs with pagination' })
  findAllJobs(
    @Query('category') category?: string,
    @Query('categories') categories?: string,
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
  ) {
    return this.jobsService.findAllJobs({
      category,
      categories: categories ? categories.split(',').map(c => c.trim()) : undefined,
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
    });
  }

  @Get('my-jobs')
  @ApiOperation({ summary: 'Get my job postings' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of my jobs' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.PRO)
  findMyJobs(@CurrentUser() user: any) {
    return this.jobsService.findMyJobs(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  findJobById(@Param('id') id: string) {
    return this.jobsService.findJobById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update job' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Job updated successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY)
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
  @Roles(UserRole.CLIENT, UserRole.COMPANY)
  async deleteJob(@Param('id') id: string, @CurrentUser() user: any) {
    await this.jobsService.deleteJob(id, user.userId);
    return { message: 'Job deleted successfully' };
  }

  // Proposal endpoints
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
    // Get pro profile ID
    const ProProfileModel = this.jobsService['proProfileModel'];
    // We'll need to inject ProProfile model or get it differently
    // For now, we'll pass undefined and update later
    return this.jobsService.createProposal(
      jobId,
      user.userId,
      user.proProfileId, // We'll add this to JWT token
      createProposalDto,
    );
  }

  @Get(':jobId/proposals')
  @ApiOperation({ summary: 'Get proposals for a job (client only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of proposals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY)
  findJobProposals(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return this.jobsService.findJobProposals(jobId, user.userId);
  }

  @Get('my-proposals/list')
  @ApiOperation({ summary: 'Get my proposals (pro only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'List of my proposals' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PRO)
  findMyProposals(@CurrentUser() user: any) {
    return this.jobsService.findMyProposals(user.userId);
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

  @Post('proposals/:proposalId/reveal-contact')
  @ApiOperation({ summary: 'Reveal pro contact information' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Contact revealed successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY)
  revealContact(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.revealContact(proposalId, user.userId);
  }

  @Post('proposals/:proposalId/accept')
  @ApiOperation({ summary: 'Accept a proposal' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Proposal accepted successfully' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT, UserRole.COMPANY)
  acceptProposal(@Param('proposalId') proposalId: string, @CurrentUser() user: any) {
    return this.jobsService.acceptProposal(proposalId, user.userId);
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
}
