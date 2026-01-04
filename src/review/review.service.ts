import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Review } from './schemas/review.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    private usersService: UsersService,
  ) {}

  async create(clientId: string, createReviewDto: CreateReviewDto): Promise<Review> {
    // Check for existing review by jobId or projectId
    const query: any = { clientId };
    if (createReviewDto.jobId) {
      query.jobId = createReviewDto.jobId;
    } else if (createReviewDto.projectId) {
      query.projectId = createReviewDto.projectId;
    }

    const existingReview = await this.reviewModel.findOne(query);

    if (existingReview) {
      throw new ConflictException('Review already exists for this project');
    }

    const review = new this.reviewModel({
      clientId,
      ...createReviewDto,
    });

    await review.save();

    await this.usersService.updateRating(
      createReviewDto.proId,
      createReviewDto.rating,
    );

    return review;
  }

  // Check if review exists for a job
  async hasReviewForJob(clientId: string, jobId: string): Promise<boolean> {
    const review = await this.reviewModel.findOne({ clientId, jobId });
    return !!review;
  }

  async findByPro(proId: string, limit = 20, skip = 0): Promise<Review[]> {
    return this.reviewModel
      .find({ proId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('clientId', 'name avatar')
      .exec();
  }

  async findByClient(clientId: string): Promise<Review[]> {
    return this.reviewModel
      .find({ clientId })
      .sort({ createdAt: -1 })
      .populate('proId')
      .exec();
  }

  async findOne(id: string): Promise<Review> {
    const review = await this.reviewModel
      .findById(id)
      .populate('clientId', 'name avatar')
      .populate('proId')
      .exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }
}
