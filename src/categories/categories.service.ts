import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Category } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
  ) {}

  async findAll(): Promise<Category[]> {
    return this.categoryModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .exec();
  }

  async findByKey(key: string): Promise<Category | null> {
    return this.categoryModel.findOne({ key, isActive: true }).exec();
  }

  async findByKeys(keys: string[]): Promise<Category[]> {
    return this.categoryModel
      .find({ key: { $in: keys }, isActive: true })
      .exec();
  }
}
