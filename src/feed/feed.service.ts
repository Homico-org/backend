import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LikesService } from '../likes/likes.service';
import { LikeTargetType } from '../likes/schemas/like.schema';

export interface FeedItem {
  _id: string;
  type: 'portfolio' | 'completion' | 'before_after' | 'pro_highlight';
  title: string;
  description?: string;
  images: string[];
  beforeImage?: string;
  afterImage?: string;
  category: string;
  pro: {
    _id: string;
    name: string;
    avatar?: string;
    rating: number;
    title?: string;
  };
  client?: {
    name?: string;
    avatar?: string;
    city?: string;
  };
  rating?: number;
  review?: string;
  likeCount: number;
  isLiked: boolean;
  createdAt: Date;
}

export interface FeedResponse {
  data: FeedItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

@Injectable()
export class FeedService {
  constructor(
    @InjectModel('PortfolioItem') private portfolioModel: Model<any>,
    @InjectModel('ProProfile') private proProfileModel: Model<any>,
    @InjectModel('User') private userModel: Model<any>,
    private likesService: LikesService,
  ) {}

  async getFeed(options: {
    category?: string;
    page?: number;
    limit?: number;
    userId?: string;
  }): Promise<FeedResponse> {
    const { category, page = 1, limit = 12, userId } = options;
    const skip = (page - 1) * limit;

    // Build query for portfolio items
    const query: any = { status: 'completed' };
    if (category) {
      query.category = category;
    }

    // Fetch portfolio items with pro profile info
    const [portfolioItems, total] = await Promise.all([
      this.portfolioModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'proId',
          select: 'title avgRating avatar userId categories',
          populate: {
            path: 'userId',
            select: 'name avatar',
          },
        })
        .lean(),
      this.portfolioModel.countDocuments(query),
    ]);

    // Get like counts and user liked status for all items
    const itemIds = portfolioItems.map((item) => item._id.toString());

    let likeCounts: Record<string, number> = {};
    let userLiked: Record<string, boolean> = {};

    if (itemIds.length > 0) {
      likeCounts = await this.likesService.getLikeCountsBatch(
        LikeTargetType.PORTFOLIO_ITEM,
        itemIds,
      );

      if (userId) {
        userLiked = await this.likesService.isLikedByUserBatch(
          userId,
          LikeTargetType.PORTFOLIO_ITEM,
          itemIds,
        );
      }
    }

    // Transform to feed items
    const feedItems: FeedItem[] = portfolioItems.map((item) => {
      const proProfile = item.proId;
      const proUser = proProfile?.userId;
      const itemId = item._id.toString();

      // Determine feed item type
      let type: FeedItem['type'] = 'portfolio';
      if (item.beforeImage && item.afterImage) {
        type = 'before_after';
      } else if (item.rating && item.review) {
        type = 'completion';
      }

      return {
        _id: itemId,
        type,
        title: item.title || '',
        description: item.description,
        images: item.images || (item.imageUrl ? [item.imageUrl] : []),
        beforeImage: item.beforeImage,
        afterImage: item.afterImage,
        category: item.category || proProfile?.categories?.[0] || '',
        pro: {
          _id: proProfile?._id?.toString() || '',
          name: proUser?.name || 'Professional',
          avatar: proProfile?.avatar || proUser?.avatar,
          rating: proProfile?.avgRating || 0,
          title: proProfile?.title,
        },
        client: item.clientName
          ? {
              name: item.clientName,
              avatar: item.clientAvatar,
              city: item.clientCity,
            }
          : undefined,
        rating: item.rating,
        review: item.review,
        likeCount: likeCounts[itemId] || 0,
        isLiked: userLiked[itemId] || false,
        createdAt: item.createdAt,
      };
    });

    return {
      data: feedItems,
      pagination: {
        page,
        limit,
        total,
        hasMore: skip + feedItems.length < total,
      },
    };
  }

  /**
   * Get highlighted pros (newly verified, top rated, etc.)
   */
  async getProHighlights(options: {
    category?: string;
    limit?: number;
  }): Promise<any[]> {
    const { category, limit = 5 } = options;

    const query: any = {
      verificationStatus: 'verified',
      status: 'active',
    };
    if (category) {
      query.categories = category;
    }

    const pros = await this.proProfileModel
      .find(query)
      .sort({ avgRating: -1, totalReviews: -1 })
      .limit(limit)
      .populate('userId', 'name avatar')
      .lean();

    return pros.map((pro) => ({
      _id: pro._id.toString(),
      type: 'pro_highlight',
      title: pro.title || 'Professional',
      images: pro.avatar ? [pro.avatar] : [],
      category: pro.categories?.[0] || '',
      pro: {
        _id: pro._id.toString(),
        name: (pro.userId as any)?.name || 'Professional',
        avatar: pro.avatar || (pro.userId as any)?.avatar,
        rating: pro.avgRating || 0,
        title: pro.title,
      },
      likeCount: 0,
      isLiked: false,
      createdAt: pro.createdAt || new Date(),
    }));
  }
}
