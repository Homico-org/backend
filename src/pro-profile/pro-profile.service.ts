import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProProfile } from './schemas/pro-profile.schema';
import { CreateProProfileDto } from './dto/create-pro-profile.dto';
import { UpdateProProfileDto } from './dto/update-pro-profile.dto';
import { LOCATIONS_DATA } from './data/locations.data';

@Injectable()
export class ProProfileService {
  // Professional categories with specific requirements
  // Interior Designer: requires Pinterest portfolio references
  // Architect: requires cadastral ID verification from Public Service Hall
  private readonly categories = [
    'Interior Design',
    'Architecture',
  ];

  constructor(
    @InjectModel(ProProfile.name) private proProfileModel: Model<ProProfile>,
  ) {}

  getCategories(): string[] {
    return this.categories;
  }

  getLocations(country?: string) {
    // Default to United States if no country specified
    const targetCountry = country || 'United States';

    // Return location data for the specified country
    if (LOCATIONS_DATA[targetCountry]) {
      return {
        country: targetCountry,
        ...LOCATIONS_DATA[targetCountry],
      };
    }

    // Fallback to United States
    return {
      country: 'United States',
      ...LOCATIONS_DATA['United States'],
    };
  }

  async create(userId: string, createProProfileDto: CreateProProfileDto): Promise<ProProfile> {
    const existingProfile = await this.proProfileModel.findOne({ userId });

    if (existingProfile) {
      throw new ConflictException('Pro profile already exists for this user');
    }

    const profile = new this.proProfileModel({
      userId,
      ...createProProfileDto,
    });

    return profile.save();
  }

  async findAll(filters?: {
    category?: string;
    subcategory?: string;
    serviceArea?: string;
    minRating?: number;
    minPrice?: number;
    maxPrice?: number;
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
    companyIds?: string[];
  }): Promise<{
    data: ProProfile[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }> {
    // Pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 6;
    const skip = (page - 1) * limit;

    // Build sort object
    let sortObj: any = {};
    switch (filters?.sort) {
      case 'rating':
        sortObj = { avgRating: -1 };
        break;
      case 'reviews':
        sortObj = { totalReviews: -1 };
        break;
      case 'price-low':
        sortObj = { basePrice: 1 };
        break;
      case 'price-high':
        sortObj = { basePrice: -1 };
        break;
      case 'newest':
        sortObj = { createdAt: -1 };
        break;
      default: // 'recommended'
        sortObj = { avgRating: -1, totalReviews: -1 };
    }

    // Use aggregation pipeline for search that includes user name
    const pipeline: any[] = [
      // Match only available profiles
      { $match: { isAvailable: true } },
      // Lookup user data
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      // Unwind the user array (will be single element)
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    ];

    // Build match conditions
    const matchConditions: any[] = [];

    if (filters?.category) {
      matchConditions.push({ categories: filters.category });
    }

    if (filters?.subcategory) {
      // Subcategory search - search in subcategories array
      matchConditions.push({ subcategories: filters.subcategory });
    }

    if (filters?.serviceArea) {
      matchConditions.push({ serviceAreas: filters.serviceArea });
    }

    if (filters?.minRating) {
      matchConditions.push({ avgRating: { $gte: filters.minRating } });
    }

    // Price range filter
    if (filters?.minPrice !== undefined) {
      matchConditions.push({ basePrice: { $gte: filters.minPrice } });
    }
    if (filters?.maxPrice !== undefined) {
      matchConditions.push({ basePrice: { $lte: filters.maxPrice } });
    }

    // Company filter
    if (filters?.companyIds && filters.companyIds.length > 0) {
      const { Types } = require('mongoose');
      matchConditions.push({
        companyId: { $in: filters.companyIds.map(id => new Types.ObjectId(id)) },
      });
    }

    // Search filter - now includes user name and categories
    if (filters?.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      matchConditions.push({
        $or: [
          { title: searchRegex },
          { tagline: searchRegex },
          { description: searchRegex },
          { categories: searchRegex },
          { companyName: searchRegex },
          { 'user.name': searchRegex },
        ],
      });
    }

    // Add match stage if there are conditions
    if (matchConditions.length > 0) {
      pipeline.push({ $match: { $and: matchConditions } });
    }

    // Count total before pagination
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await this.proProfileModel.aggregate(countPipeline).exec();
    const total = countResult[0]?.total || 0;

    // Add sorting and pagination
    pipeline.push(
      { $sort: sortObj },
      { $skip: skip },
      { $limit: limit },
      // Project to reshape the data
      {
        $project: {
          _id: 1,
          userId: {
            _id: '$user._id',
            name: '$user.name',
            email: '$user.email',
            avatar: '$user.avatar',
          },
          companyId: 1,
          title: 1,
          companyName: 1,
          description: 1,
          categories: 1,
          yearsExperience: 1,
          serviceAreas: 1,
          pricingModel: 1,
          basePrice: 1,
          currency: 1,
          avgRating: 1,
          totalReviews: 1,
          completedJobs: 1,
          responseTime: 1,
          isAvailable: 1,
          coverImage: 1,
          certifications: 1,
          languages: 1,
          tagline: 1,
          bio: 1,
          avatar: 1,
          profileType: 1,
          portfolioProjects: 1,
          portfolioImages: 1,
          verificationStatus: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    );

    const data = await this.proProfileModel.aggregate(pipeline).exec();

    const totalPages = Math.ceil(total / limit);

    return {
      data: data as ProProfile[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  async findOne(id: string): Promise<ProProfile> {
    const profile = await this.proProfileModel
      .findById(id)
      .populate('userId', 'name email avatar phone city')
      .exec();

    if (!profile) {
      throw new NotFoundException('Pro profile not found');
    }

    return profile;
  }

  async findByUserId(userId: string): Promise<ProProfile | null> {
    return this.proProfileModel
      .findOne({ userId })
      .populate('userId', 'name email avatar')
      .exec();
  }

  async update(id: string, updateProProfileDto: UpdateProProfileDto): Promise<ProProfile> {
    const profile = await this.proProfileModel
      .findByIdAndUpdate(id, updateProProfileDto, { new: true })
      .exec();

    if (!profile) {
      throw new NotFoundException('Pro profile not found');
    }

    return profile;
  }

  async updateRating(proId: string, newRating: number): Promise<void> {
    const profile = await this.findOne(proId);
    const totalReviews = profile.totalReviews + 1;
    const avgRating =
      (profile.avgRating * profile.totalReviews + newRating) / totalReviews;

    await this.proProfileModel.findByIdAndUpdate(proId, {
      avgRating,
      totalReviews,
    });
  }
}
