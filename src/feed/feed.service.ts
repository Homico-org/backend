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
  // For embedded projects without their own ObjectId, we track what to like instead
  likeTargetType?: 'portfolio_item' | 'pro_profile';
  likeTargetId?: string;
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
    @InjectModel('User') private userModel: Model<any>,
    private likesService: LikesService,
  ) {}

  async getFeed(options: {
    category?: string;
    page?: number;
    limit?: number;
    userId?: string;
    location?: string;
    minRating?: number;
    search?: string;
    sort?: string;
  }): Promise<FeedResponse> {
    const { category, page = 1, limit = 12, userId, location, minRating, search, sort } = options;
    const skip = (page - 1) * limit;

    // Build query for portfolio items from PortfolioItem collection
    const portfolioItemQuery: any = { status: 'completed' };
    if (category) {
      portfolioItemQuery.category = category;
    }
    if (location) {
      portfolioItemQuery.location = new RegExp(location, 'i');
    }
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      portfolioItemQuery.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
      ];
    }

    // Build query for pro users with portfolioProjects
    const proUserQuery: any = {
      role: 'pro',
      'portfolioProjects.0': { $exists: true }, // Has at least one portfolio project
    };
    if (category) {
      proUserQuery.categories = category;
    }
    if (minRating) {
      proUserQuery.avgRating = { $gte: minRating };
    }
    if (location) {
      proUserQuery.city = new RegExp(location, 'i');
    }

    // Fetch both portfolio items and pro user embedded projects
    const [portfolioItems, proUsersWithProjects, portfolioItemTotal] = await Promise.all([
      this.portfolioModel
        .find(portfolioItemQuery)
        .sort({ createdAt: -1 })
        .populate({
          path: 'proId',
          select: 'name title avgRating avatar categories',
        })
        .lean(),
      this.userModel
        .find(proUserQuery)
        .select('name title avgRating avatar categories portfolioProjects updatedAt')
        .lean(),
      this.portfolioModel.countDocuments(portfolioItemQuery),
    ]);

    // Transform PortfolioItem items to feed items
    const portfolioFeedItems: (FeedItem & { sortDate: Date })[] = portfolioItems.map((item) => {
      const proUser = item.proId;
      const itemId = item._id.toString();

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
        category: item.category || proUser?.categories?.[0] || '',
        pro: {
          _id: proUser?._id?.toString() || '',
          name: proUser?.name || 'Professional',
          avatar: proUser?.avatar,
          rating: proUser?.avgRating || 0,
          title: proUser?.title,
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
        likeCount: 0,
        isLiked: false,
        createdAt: item.createdAt,
        sortDate: new Date(item.createdAt),
      };
    });

    // Transform embedded portfolioProjects to feed items
    const embeddedFeedItems: (FeedItem & { sortDate: Date; likeTargetType?: string; likeTargetId?: string })[] = [];
    for (const proUser of proUsersWithProjects) {
      for (let i = 0; i < (proUser.portfolioProjects || []).length; i++) {
        const project = proUser.portfolioProjects[i];
        // Check for before/after pairs
        const hasBeforeAfter = project.beforeAfterPairs && project.beforeAfterPairs.length > 0;
        const firstPair = hasBeforeAfter ? project.beforeAfterPairs[0] : null;

        let type: FeedItem['type'] = 'portfolio';
        if (hasBeforeAfter) {
          type = 'before_after';
        }

        // Check if project has a valid MongoDB ObjectId
        const hasValidObjectId = project._id && Types.ObjectId.isValid(project._id.toString());
        const projectIdString = project._id?.toString() || project.id;

        // For embedded projects without valid ObjectIds, we'll use the user._id for liking
        const projectId = hasValidObjectId
          ? projectIdString
          : `embedded-${proUser._id.toString()}-${i}`;

        embeddedFeedItems.push({
          _id: projectId,
          // For embedded projects, store the actual like target (the pro user)
          likeTargetType: hasValidObjectId ? 'portfolio_item' : 'pro_profile',
          likeTargetId: hasValidObjectId ? projectIdString : proUser._id.toString(),
          type,
          title: project.title || '',
          description: project.description,
          images: project.images || [],
          beforeImage: firstPair?.beforeImage,
          afterImage: firstPair?.afterImage,
          category: proUser.categories?.[0] || '',
          pro: {
            _id: proUser._id?.toString() || '',
            name: proUser.name || 'Professional',
            avatar: proUser.avatar,
            rating: proUser.avgRating || 0,
            title: proUser.title,
          },
          likeCount: 0,
          isLiked: false,
          createdAt: proUser.updatedAt || new Date(),
          sortDate: new Date(proUser.updatedAt || new Date()),
        });
      }
    }

    // Merge and sort all feed items
    let allFeedItems = [...portfolioFeedItems, ...embeddedFeedItems];

    // Apply sorting based on sort parameter
    if (sort === 'rating') {
      // Sort by pro rating (highest first)
      allFeedItems.sort((a, b) => (b.pro.rating || 0) - (a.pro.rating || 0));
    } else if (sort === 'oldest') {
      // Sort by date (oldest first)
      allFeedItems.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
    } else {
      // Default: newest first
      allFeedItems.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
    }

    // Filter by minRating if specified (for portfolio items with linked pro)
    if (minRating) {
      allFeedItems = allFeedItems.filter(item => (item.pro.rating || 0) >= minRating);
    }

    // Apply pagination
    const total = allFeedItems.length;
    const paginatedItems = allFeedItems.slice(skip, skip + limit);

    // Get like counts and user liked status for paginated items
    // Separate items by their like target type
    const portfolioItemIds: string[] = [];
    const proProfileIds: string[] = [];
    const itemToLikeTarget: Record<string, { type: LikeTargetType; id: string }> = {};

    for (const item of paginatedItems) {
      const likeTargetId = (item as any).likeTargetId || item._id;
      const likeTargetType = (item as any).likeTargetType || 'portfolio_item';

      if (Types.ObjectId.isValid(likeTargetId) && likeTargetId.length === 24) {
        itemToLikeTarget[item._id] = {
          type: likeTargetType === 'pro_profile' ? LikeTargetType.PRO_PROFILE : LikeTargetType.PORTFOLIO_ITEM,
          id: likeTargetId,
        };

        if (likeTargetType === 'pro_profile') {
          proProfileIds.push(likeTargetId);
        } else {
          portfolioItemIds.push(likeTargetId);
        }
      }
    }

    let likeCounts: Record<string, number> = {};
    let userLiked: Record<string, boolean> = {};

    // Fetch like counts for portfolio items
    if (portfolioItemIds.length > 0) {
      const portfolioCounts = await this.likesService.getLikeCountsBatch(
        LikeTargetType.PORTFOLIO_ITEM,
        portfolioItemIds,
      );
      Object.assign(likeCounts, portfolioCounts);

      if (userId) {
        const portfolioLiked = await this.likesService.isLikedByUserBatch(
          userId,
          LikeTargetType.PORTFOLIO_ITEM,
          portfolioItemIds,
        );
        Object.assign(userLiked, portfolioLiked);
      }
    }

    // Fetch like counts for pro profiles (embedded items)
    if (proProfileIds.length > 0) {
      const proCounts = await this.likesService.getLikeCountsBatch(
        LikeTargetType.PRO_PROFILE,
        proProfileIds,
      );
      Object.assign(likeCounts, proCounts);

      if (userId) {
        const proLiked = await this.likesService.isLikedByUserBatch(
          userId,
          LikeTargetType.PRO_PROFILE,
          proProfileIds,
        );
        Object.assign(userLiked, proLiked);
      }
    }

    // Apply like counts to items using their mapped like targets
    const feedItems: FeedItem[] = paginatedItems.map(({ sortDate, ...item }) => {
      const likeTarget = itemToLikeTarget[item._id];
      const likeTargetId = likeTarget?.id || item._id;

      return {
        ...item,
        likeCount: likeCounts[likeTargetId] || 0,
        isLiked: userLiked[likeTargetId] || false,
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
      role: 'pro',
      verificationStatus: 'verified',
      status: 'active',
    };
    if (category) {
      query.categories = category;
    }

    const pros = await this.userModel
      .find(query)
      .sort({ avgRating: -1, totalReviews: -1 })
      .limit(limit)
      .select('name avatar title categories avgRating createdAt')
      .lean();

    return pros.map((pro) => ({
      _id: pro._id.toString(),
      type: 'pro_highlight',
      title: pro.title || 'Professional',
      images: pro.avatar ? [pro.avatar] : [],
      category: pro.categories?.[0] || '',
      pro: {
        _id: pro._id.toString(),
        name: pro.name || 'Professional',
        avatar: pro.avatar,
        rating: pro.avgRating || 0,
        title: pro.title,
      },
      likeCount: 0,
      isLiked: false,
      createdAt: pro.createdAt || new Date(),
    }));
  }
}
