import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectRequest, ProjectStatus } from './schemas/project-request.schema';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';

@Injectable()
export class ProjectRequestService {
  constructor(
    @InjectModel(ProjectRequest.name) private projectRequestModel: Model<ProjectRequest>,
  ) {}

  async create(clientId: string, createDto: CreateProjectRequestDto): Promise<ProjectRequest> {
    const request = new this.projectRequestModel({
      clientId,
      ...createDto,
    });
    return request.save();
  }

  async findAll(filters?: {
    clientId?: string;
    proId?: string;
    category?: string;
    status?: ProjectStatus;
  }): Promise<ProjectRequest[]> {
    const query: any = {};

    if (filters?.clientId) query.clientId = filters.clientId;
    if (filters?.proId) query.proId = filters.proId;
    if (filters?.category) query.category = filters.category;
    if (filters?.status) query.status = filters.status;

    return this.projectRequestModel
      .find(query)
      .populate('clientId', 'name email avatar')
      .populate('proId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<ProjectRequest> {
    const request = await this.projectRequestModel
      .findById(id)
      .populate('clientId', 'name email phone avatar')
      .populate('proId')
      .exec();

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    return request;
  }

  async updateStatus(id: string, status: ProjectStatus): Promise<ProjectRequest> {
    const request = await this.projectRequestModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    return request;
  }

  async assignToPro(id: string, proId: string): Promise<ProjectRequest> {
    const request = await this.projectRequestModel
      .findByIdAndUpdate(id, { proId }, { new: true })
      .exec();

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    return request;
  }
}
