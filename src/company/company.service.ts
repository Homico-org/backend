import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Company, CompanyStatus } from './schemas/company.schema';
import { CompanyEmployee, EmployeeRole, EmployeeStatus } from './schemas/company-employee.schema';
import { CompanyJob, CompanyJobStatus } from './schemas/company-job.schema';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { InviteEmployeeDto, UpdateEmployeeDto, UpdateEmployeePermissionsDto } from './dto/invite-employee.dto';
import { CreateCompanyJobDto, AssignJobDto, UpdateCompanyJobDto, CompleteJobDto } from './dto/create-company-job.dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>,
    @InjectModel(CompanyEmployee.name) private employeeModel: Model<CompanyEmployee>,
    @InjectModel(CompanyJob.name) private companyJobModel: Model<CompanyJob>,
  ) {}

  // =====================
  // COMPANY CRUD
  // =====================

  async create(ownerId: string, dto: CreateCompanyDto): Promise<Company> {
    const existing = await this.companyModel.findOne({ ownerId });
    if (existing) {
      throw new ConflictException('You already have a company registered');
    }

    const company = new this.companyModel({
      ownerId,
      ...dto,
      status: CompanyStatus.ACTIVE,
    });

    const savedCompany = await company.save();

    // Create owner as first employee
    await this.employeeModel.create({
      companyId: savedCompany._id,
      userId: ownerId,
      name: dto.name,
      email: dto.email,
      role: EmployeeRole.OWNER,
      status: EmployeeStatus.ACTIVE,
      jobTitle: 'Owner',
      permissions: {
        canViewJobs: true,
        canAcceptJobs: true,
        canManageWorkers: true,
        canManageCompany: true,
        canViewFinances: true,
        canMessageClients: true,
      },
      hireDate: new Date(),
    });

    // Update active workers count
    savedCompany.activeWorkers = 1;
    await savedCompany.save();

    return savedCompany;
  }

  async findByOwnerId(ownerId: string): Promise<Company | null> {
    return this.companyModel.findOne({ ownerId: new Types.ObjectId(ownerId) }).exec();
  }

  async findById(id: string): Promise<Company> {
    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  async findAll(filters?: {
    category?: string;
    city?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Company[];
    pagination: { page: number; limit: number; total: number; hasMore: boolean };
  }> {
    const query: any = { status: CompanyStatus.ACTIVE };

    if (filters?.category) {
      // Case-insensitive category match (categories stored as slugs)
      const categorySlug = filters.category.toLowerCase().replace(/\s+/g, '-');
      query.categories = { $regex: new RegExp(`^${categorySlug}$`, 'i') };
    }

    if (filters?.city) {
      query.city = filters.city;
    }

    if (filters?.search) {
      query.$text = { $search: filters.search };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.companyModel
        .find(query)
        .sort({ avgRating: -1, completedJobs: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.companyModel.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    };
  }

  async update(id: string, ownerId: string, dto: UpdateCompanyDto): Promise<Company> {
    const company = await this.findById(id);

    if (company.ownerId.toString() !== ownerId) {
      throw new ForbiddenException('Only the owner can update company info');
    }

    Object.assign(company, dto);
    return company.save();
  }

  async getCompanyStats(companyId: string): Promise<{
    totalEmployees: number;
    activeEmployees: number;
    totalJobs: number;
    completedJobs: number;
    pendingJobs: number;
    inProgressJobs: number;
    avgRating: number;
    totalReviews: number;
  }> {
    const [
      totalEmployees,
      activeEmployees,
      jobStats,
      company,
    ] = await Promise.all([
      this.employeeModel.countDocuments({ companyId }),
      this.employeeModel.countDocuments({ companyId, status: EmployeeStatus.ACTIVE }),
      this.companyJobModel.aggregate([
        { $match: { companyId: new Types.ObjectId(companyId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      this.companyModel.findById(companyId),
    ]);

    const jobCounts = jobStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as Record<string, number>);

    const totalJobs: number = (Object.values(jobCounts) as number[]).reduce((a, b) => a + b, 0);

    return {
      totalEmployees,
      activeEmployees,
      totalJobs,
      completedJobs: jobCounts[CompanyJobStatus.COMPLETED] || 0,
      pendingJobs: jobCounts[CompanyJobStatus.PENDING] || 0,
      inProgressJobs: jobCounts[CompanyJobStatus.IN_PROGRESS] || 0,
      avgRating: company?.avgRating || 0,
      totalReviews: company?.totalReviews || 0,
    };
  }

  // =====================
  // EMPLOYEE MANAGEMENT
  // =====================

  async inviteEmployee(companyId: string, inviterId: string, dto: InviteEmployeeDto): Promise<CompanyEmployee> {
    // Check if already exists
    const existing = await this.employeeModel.findOne({
      companyId,
      email: dto.email.toLowerCase(),
    });

    if (existing) {
      throw new ConflictException('An employee with this email already exists');
    }

    const invitationToken = randomBytes(32).toString('hex');

    const employee = new this.employeeModel({
      companyId,
      name: dto.name,
      email: dto.email.toLowerCase(),
      phone: dto.phone,
      role: dto.role || EmployeeRole.WORKER,
      jobTitle: dto.jobTitle,
      skills: dto.skills || [],
      department: dto.department,
      status: EmployeeStatus.PENDING,
      invitationToken,
      invitationSentAt: new Date(),
      invitedBy: inviterId,
    });

    await employee.save();

    // Update company active workers count
    await this.updateActiveWorkersCount(companyId);

    // TODO: Send invitation email

    return employee;
  }

  async acceptInvitation(token: string, userId: string, proProfileId?: string): Promise<CompanyEmployee> {
    const employee = await this.employeeModel.findOne({ invitationToken: token });

    if (!employee) {
      throw new NotFoundException('Invalid or expired invitation');
    }

    if (employee.status !== EmployeeStatus.PENDING) {
      throw new ConflictException('This invitation has already been used');
    }

    employee.userId = new Types.ObjectId(userId);
    if (proProfileId) {
      employee.proProfileId = new Types.ObjectId(proProfileId);
    }
    employee.status = EmployeeStatus.ACTIVE;
    employee.invitationAcceptedAt = new Date();
    employee.hireDate = new Date();
    employee.invitationToken = undefined;

    await employee.save();

    // Update company active workers count
    await this.updateActiveWorkersCount(employee.companyId.toString());

    return employee;
  }

  async getEmployees(
    companyId: string,
    filters?: { status?: EmployeeStatus; role?: EmployeeRole; search?: string }
  ): Promise<CompanyEmployee[]> {
    const query: any = { companyId };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.role) {
      query.role = filters.role;
    }

    if (filters?.search) {
      query.$or = [
        { name: new RegExp(filters.search, 'i') },
        { email: new RegExp(filters.search, 'i') },
        { jobTitle: new RegExp(filters.search, 'i') },
      ];
    }

    return this.employeeModel
      .find(query)
      .populate('userId', 'name email avatar')
      .sort({ role: 1, name: 1 })
      .exec();
  }

  async getEmployee(companyId: string, employeeId: string): Promise<CompanyEmployee> {
    const employee = await this.employeeModel
      .findOne({ _id: employeeId, companyId })
      .populate('userId', 'name email avatar phone')
      .exec();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async updateEmployee(
    companyId: string,
    employeeId: string,
    dto: UpdateEmployeeDto
  ): Promise<CompanyEmployee> {
    const employee = await this.getEmployee(companyId, employeeId);
    Object.assign(employee, dto);
    return employee.save();
  }

  async updateEmployeePermissions(
    companyId: string,
    employeeId: string,
    dto: UpdateEmployeePermissionsDto
  ): Promise<CompanyEmployee> {
    const employee = await this.getEmployee(companyId, employeeId);

    if (employee.role === EmployeeRole.OWNER) {
      throw new ForbiddenException('Cannot modify owner permissions');
    }

    employee.permissions = { ...employee.permissions, ...dto };
    return employee.save();
  }

  async terminateEmployee(companyId: string, employeeId: string): Promise<CompanyEmployee> {
    const employee = await this.getEmployee(companyId, employeeId);

    if (employee.role === EmployeeRole.OWNER) {
      throw new ForbiddenException('Cannot terminate the owner');
    }

    employee.status = EmployeeStatus.TERMINATED;
    employee.terminationDate = new Date();
    await employee.save();

    // Update company active workers count
    await this.updateActiveWorkersCount(companyId);

    return employee;
  }

  async reactivateEmployee(companyId: string, employeeId: string): Promise<CompanyEmployee> {
    const employee = await this.getEmployee(companyId, employeeId);

    if (employee.status === EmployeeStatus.ACTIVE) {
      throw new ConflictException('Employee is already active');
    }

    employee.status = EmployeeStatus.ACTIVE;
    employee.terminationDate = undefined;
    await employee.save();

    // Update company active workers count
    await this.updateActiveWorkersCount(companyId);

    return employee;
  }

  private async updateActiveWorkersCount(companyId: string): Promise<void> {
    const count = await this.employeeModel.countDocuments({
      companyId,
      status: EmployeeStatus.ACTIVE,
    });

    await this.companyModel.findByIdAndUpdate(companyId, { activeWorkers: count });
  }

  // =====================
  // JOB MANAGEMENT
  // =====================

  async createJob(companyId: string, dto: CreateCompanyJobDto): Promise<CompanyJob> {
    const job = new this.companyJobModel({
      companyId,
      ...dto,
      status: CompanyJobStatus.PENDING,
    });

    return job.save();
  }

  async getJobs(
    companyId: string,
    filters?: {
      status?: CompanyJobStatus;
      employeeId?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{
    data: CompanyJob[];
    pagination: { page: number; limit: number; total: number; hasMore: boolean };
  }> {
    const query: any = { companyId };

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.employeeId) {
      query.assignedEmployees = filters.employeeId;
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.companyJobModel
        .find(query)
        .populate('assignedEmployees', 'name avatar jobTitle')
        .populate('leadEmployee', 'name avatar jobTitle')
        .populate('clientId', 'name avatar phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.companyJobModel.countDocuments(query),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    };
  }

  async getJob(companyId: string, jobId: string): Promise<CompanyJob> {
    const job = await this.companyJobModel
      .findOne({ _id: jobId, companyId })
      .populate('assignedEmployees', 'name avatar jobTitle phone email')
      .populate('leadEmployee', 'name avatar jobTitle phone email')
      .populate('clientId', 'name avatar phone email city')
      .exec();

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async updateJob(companyId: string, jobId: string, dto: UpdateCompanyJobDto): Promise<CompanyJob> {
    const job = await this.getJob(companyId, jobId);
    Object.assign(job, dto);
    return job.save();
  }

  async assignJob(companyId: string, jobId: string, dto: AssignJobDto): Promise<CompanyJob> {
    const job = await this.getJob(companyId, jobId);

    // Verify all employees belong to this company
    const employees = await this.employeeModel.find({
      _id: { $in: dto.employeeIds },
      companyId,
      status: EmployeeStatus.ACTIVE,
    });

    if (employees.length !== dto.employeeIds.length) {
      throw new NotFoundException('Some employees were not found or are inactive');
    }

    job.assignedEmployees = dto.employeeIds.map(id => new Types.ObjectId(id));

    if (dto.leadEmployeeId) {
      job.leadEmployee = new Types.ObjectId(dto.leadEmployeeId);
    } else if (dto.employeeIds.length > 0) {
      job.leadEmployee = new Types.ObjectId(dto.employeeIds[0]);
    }

    job.status = CompanyJobStatus.ASSIGNED;
    job.assignedAt = new Date();

    return job.save();
  }

  async startJob(companyId: string, jobId: string): Promise<CompanyJob> {
    const job = await this.getJob(companyId, jobId);

    if (job.status !== CompanyJobStatus.ASSIGNED) {
      throw new ConflictException('Job must be assigned before starting');
    }

    job.status = CompanyJobStatus.IN_PROGRESS;
    job.startedAt = new Date();

    return job.save();
  }

  async completeJob(companyId: string, jobId: string, dto: CompleteJobDto): Promise<CompanyJob> {
    const job = await this.getJob(companyId, jobId);

    if (job.status !== CompanyJobStatus.IN_PROGRESS) {
      throw new ConflictException('Only in-progress jobs can be completed');
    }

    job.status = CompanyJobStatus.COMPLETED;
    job.completedAt = new Date();

    if (dto.finalPrice !== undefined) {
      job.finalPrice = dto.finalPrice;
    }

    if (dto.completionPhotos) {
      job.completionPhotos = dto.completionPhotos;
    }

    if (dto.completionNotes) {
      job.progressNotes.push(`[Completion] ${dto.completionNotes}`);
    }

    await job.save();

    // Update company completed jobs count
    const company = await this.companyModel.findById(companyId);
    if (company) {
      company.completedJobs = (company.completedJobs || 0) + 1;
      await company.save();
    }

    // Update employee completed jobs count
    for (const empId of job.assignedEmployees) {
      await this.employeeModel.findByIdAndUpdate(empId, {
        $inc: { completedJobs: 1 },
      });
    }

    return job;
  }

  async cancelJob(companyId: string, jobId: string, reason?: string): Promise<CompanyJob> {
    const job = await this.getJob(companyId, jobId);

    if (job.status === CompanyJobStatus.COMPLETED) {
      throw new ConflictException('Cannot cancel a completed job');
    }

    job.status = CompanyJobStatus.CANCELLED;

    if (reason) {
      job.progressNotes.push(`[Cancelled] ${reason}`);
    }

    return job.save();
  }

  // =====================
  // EMPLOYEE JOB VIEW
  // =====================

  async getEmployeeJobs(employeeId: string): Promise<CompanyJob[]> {
    return this.companyJobModel
      .find({
        assignedEmployees: employeeId,
        status: { $in: [CompanyJobStatus.ASSIGNED, CompanyJobStatus.IN_PROGRESS] },
      })
      .populate('companyId', 'name logo')
      .populate('clientId', 'name avatar phone')
      .sort({ scheduledDate: 1, priority: -1 })
      .exec();
  }

  async getEmployeeCompany(userId: string): Promise<{
    company: Company;
    employee: CompanyEmployee;
  } | null> {
    const employee = await this.employeeModel
      .findOne({ userId, status: EmployeeStatus.ACTIVE })
      .exec();

    if (!employee) {
      return null;
    }

    const company = await this.companyModel.findById(employee.companyId).exec();

    if (!company) {
      return null;
    }

    return { company, employee };
  }
}
