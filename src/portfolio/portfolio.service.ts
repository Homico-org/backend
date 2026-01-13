import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortfolioItem, ProjectSource, ProjectStatus, ProjectType } from './schemas/portfolio-item.schema';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';

export interface CreateFromJobData {
  proId: string;
  jobId: string;
  title: string;
  description?: string;
  images: string[];
  category?: string;
  location?: string;
  clientId?: string;
  clientName?: string;
  clientAvatar?: string;
  completedDate?: Date;
  rating?: number;
  review?: string;
}

@Injectable()
export class PortfolioService {
  constructor(
    @InjectModel(PortfolioItem.name) private portfolioItemModel: Model<PortfolioItem>,
  ) {}

  async create(proId: string, createPortfolioItemDto: CreatePortfolioItemDto): Promise<PortfolioItem> {
    // Set imageUrl from first image if not provided
    let imageUrl = createPortfolioItemDto.imageUrl;
    if (!imageUrl && createPortfolioItemDto.images && createPortfolioItemDto.images.length > 0) {
      imageUrl = createPortfolioItemDto.images[0];
    }
    if (!imageUrl && createPortfolioItemDto.beforeAfter && createPortfolioItemDto.beforeAfter.length > 0) {
      imageUrl = createPortfolioItemDto.beforeAfter[0].after || createPortfolioItemDto.beforeAfter[0].before;
    }

    const item = new this.portfolioItemModel({
      proId: new Types.ObjectId(proId),
      ...createPortfolioItemDto,
      imageUrl: imageUrl || '',
    });
    return item.save();
  }

  async findByProId(proId: string): Promise<PortfolioItem[]> {
    return this.portfolioItemModel
      .find({ proId: new Types.ObjectId(proId) })
      .sort({ displayOrder: 1, createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<PortfolioItem> {
    const item = await this.portfolioItemModel.findById(id).exec();
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }
    return item;
  }

  async update(id: string, updateDto: Partial<CreatePortfolioItemDto>): Promise<PortfolioItem> {
    const item = await this.portfolioItemModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
    if (!item) {
      throw new NotFoundException('Portfolio item not found');
    }
    return item;
  }

  async remove(id: string): Promise<void> {
    const result = await this.portfolioItemModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException('Portfolio item not found');
    }
  }

  // Create portfolio item from a completed Homico job
  async createFromJob(data: CreateFromJobData): Promise<PortfolioItem> {
    // Check if portfolio item already exists for this job
    const existing = await this.portfolioItemModel.findOne({
      jobId: new Types.ObjectId(data.jobId),
    }).exec();

    if (existing) {
      // Update existing portfolio item with new images if provided
      if (data.images && data.images.length > 0) {
        existing.images = data.images;
        existing.imageUrl = data.images[0];
      }
      if (data.rating) existing.rating = data.rating;
      if (data.review) existing.review = data.review;
      return existing.save();
    }

    // Create new portfolio item
    const item = new this.portfolioItemModel({
      proId: new Types.ObjectId(data.proId),
      jobId: new Types.ObjectId(data.jobId),
      title: data.title,
      description: data.description || '',
      imageUrl: data.images[0] || '',
      images: data.images,
      category: data.category,
      location: data.location,
      clientId: data.clientId ? new Types.ObjectId(data.clientId) : undefined,
      clientName: data.clientName,
      clientAvatar: data.clientAvatar,
      completedDate: data.completedDate || new Date(),
      projectDate: data.completedDate || new Date(),
      rating: data.rating,
      review: data.review,
      source: ProjectSource.HOMICO,
      status: ProjectStatus.COMPLETED,
      projectType: ProjectType.JOB,
    });

    return item.save();
  }

  // Find portfolio item by job ID
  async findByJobId(jobId: string): Promise<PortfolioItem | null> {
    return this.portfolioItemModel.findOne({
      jobId: new Types.ObjectId(jobId),
    }).exec();
  }
}
