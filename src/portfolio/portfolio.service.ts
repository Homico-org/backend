import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortfolioItem } from './schemas/portfolio-item.schema';
import { CreatePortfolioItemDto } from './dto/create-portfolio-item.dto';

@Injectable()
export class PortfolioService {
  constructor(
    @InjectModel(PortfolioItem.name) private portfolioItemModel: Model<PortfolioItem>,
  ) {}

  async create(proId: string, createPortfolioItemDto: CreatePortfolioItemDto): Promise<PortfolioItem> {
    const item = new this.portfolioItemModel({
      proId: new Types.ObjectId(proId),
      ...createPortfolioItemDto,
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
}
