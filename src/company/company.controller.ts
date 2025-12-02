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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InviteEmployeeDto, UpdateEmployeeDto, UpdateEmployeePermissionsDto } from './dto/invite-employee.dto';
import { CreateCompanyJobDto, AssignJobDto, UpdateCompanyJobDto, CompleteJobDto } from './dto/create-company-job.dto';
import { EmployeeRole, EmployeeStatus } from './schemas/company-employee.schema';
import { CompanyJobStatus } from './schemas/company-job.schema';

@ApiTags('Companies')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  // =====================
  // PUBLIC ENDPOINTS
  // =====================

  @Get()
  @ApiOperation({ summary: 'Get all companies (public listing)' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.companyService.findAll({
      category,
      city,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // =====================
  // AUTHENTICATED ENDPOINTS - COMPANY MANAGEMENT
  // =====================
  // NOTE: These routes MUST be defined BEFORE the :id route to avoid path conflicts

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new company' })
  @ApiResponse({ status: 201, description: 'Company created successfully' })
  @ApiResponse({ status: 409, description: 'User already has a company' })
  async create(@Request() req, @Body() dto: CreateCompanyDto) {
    return this.companyService.create(req.user.userId, dto);
  }

  @Get('my/company')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s company' })
  async getMyCompany(@Request() req) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      // Check if user is an employee of a company
      const employeeCompany = await this.companyService.getEmployeeCompany(req.user.userId);
      return employeeCompany;
    }
    return { company, employee: null, isOwner: true };
  }

  @Put('my/company')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user\'s company' })
  async updateMyCompany(@Request() req, @Body() dto: UpdateCompanyDto) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.update(company._id.toString(), req.user.userId, dto);
  }

  @Get('my/company/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get company statistics' })
  async getMyCompanyStats(@Request() req) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.getCompanyStats(company._id.toString());
  }

  // =====================
  // EMPLOYEE MANAGEMENT
  // =====================

  @Post('my/company/employees/invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a new employee to the company' })
  async inviteEmployee(@Request() req, @Body() dto: InviteEmployeeDto) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.inviteEmployee(company._id.toString(), req.user.userId, dto);
  }

  @Post('invitations/:token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept an employee invitation' })
  async acceptInvitation(
    @Request() req,
    @Param('token') token: string,
    @Query('proProfileId') proProfileId?: string,
  ) {
    return this.companyService.acceptInvitation(token, req.user.userId, proProfileId);
  }

  @Get('my/company/employees')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all employees of the company' })
  @ApiQuery({ name: 'status', required: false, enum: EmployeeStatus })
  @ApiQuery({ name: 'role', required: false, enum: EmployeeRole })
  @ApiQuery({ name: 'search', required: false })
  async getEmployees(
    @Request() req,
    @Query('status') status?: EmployeeStatus,
    @Query('role') role?: EmployeeRole,
    @Query('search') search?: string,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.getEmployees(company._id.toString(), { status, role, search });
  }

  @Get('my/company/employees/:employeeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific employee' })
  async getEmployee(@Request() req, @Param('employeeId') employeeId: string) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.getEmployee(company._id.toString(), employeeId);
  }

  @Patch('my/company/employees/:employeeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an employee' })
  async updateEmployee(
    @Request() req,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.updateEmployee(company._id.toString(), employeeId, dto);
  }

  @Patch('my/company/employees/:employeeId/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update employee permissions' })
  async updateEmployeePermissions(
    @Request() req,
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateEmployeePermissionsDto,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.updateEmployeePermissions(company._id.toString(), employeeId, dto);
  }

  @Post('my/company/employees/:employeeId/terminate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Terminate an employee' })
  async terminateEmployee(@Request() req, @Param('employeeId') employeeId: string) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.terminateEmployee(company._id.toString(), employeeId);
  }

  @Post('my/company/employees/:employeeId/reactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reactivate a terminated employee' })
  async reactivateEmployee(@Request() req, @Param('employeeId') employeeId: string) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.reactivateEmployee(company._id.toString(), employeeId);
  }

  // =====================
  // JOB MANAGEMENT
  // =====================

  @Post('my/company/jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new job' })
  async createJob(@Request() req, @Body() dto: CreateCompanyJobDto) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.createJob(company._id.toString(), dto);
  }

  @Get('my/company/jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all jobs for the company' })
  @ApiQuery({ name: 'status', required: false, enum: CompanyJobStatus })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getJobs(
    @Request() req,
    @Query('status') status?: CompanyJobStatus,
    @Query('employeeId') employeeId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.getJobs(company._id.toString(), {
      status,
      employeeId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('my/company/jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific job' })
  async getJob(@Request() req, @Param('jobId') jobId: string) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.getJob(company._id.toString(), jobId);
  }

  @Patch('my/company/jobs/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a job' })
  async updateJob(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() dto: UpdateCompanyJobDto,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.updateJob(company._id.toString(), jobId, dto);
  }

  @Post('my/company/jobs/:jobId/assign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign employees to a job' })
  async assignJob(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() dto: AssignJobDto,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.assignJob(company._id.toString(), jobId, dto);
  }

  @Post('my/company/jobs/:jobId/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start a job' })
  async startJob(@Request() req, @Param('jobId') jobId: string) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.startJob(company._id.toString(), jobId);
  }

  @Post('my/company/jobs/:jobId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete a job' })
  async completeJob(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body() dto: CompleteJobDto,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.completeJob(company._id.toString(), jobId, dto);
  }

  @Post('my/company/jobs/:jobId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a job' })
  async cancelJob(
    @Request() req,
    @Param('jobId') jobId: string,
    @Body('reason') reason?: string,
  ) {
    const company = await this.companyService.findByOwnerId(req.user.userId);
    if (!company) {
      throw new Error('You don\'t have a company');
    }
    return this.companyService.cancelJob(company._id.toString(), jobId, reason);
  }

  // =====================
  // EMPLOYEE VIEW (for workers viewing their assignments)
  // =====================

  @Get('my/employee/jobs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get jobs assigned to current employee' })
  async getMyEmployeeJobs(@Request() req) {
    const employeeCompany = await this.companyService.getEmployeeCompany(req.user.userId);
    if (!employeeCompany) {
      throw new Error('You are not an employee of any company');
    }
    return this.companyService.getEmployeeJobs(employeeCompany.employee._id.toString());
  }

  @Get('my/employee/company')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the company the current user works for' })
  async getMyEmployeeCompany(@Request() req) {
    return this.companyService.getEmployeeCompany(req.user.userId);
  }

  // =====================
  // PUBLIC DYNAMIC ROUTE - MUST BE LAST to avoid conflicts with /my/* routes
  // =====================

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID (public)' })
  async findById(@Param('id') id: string) {
    return this.companyService.findById(id);
  }
}
