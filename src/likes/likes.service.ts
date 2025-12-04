import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Like, LikeTargetType } from './schemas/like.schema';
import { LikeCount } from './schemas/like-count.schema';

@Injectable()
export class LikesService {
  constructor(
    @InjectModel(Like.name) private likeModel: Model<Like>,
    @InjectModel(LikeCount.name) private likeCountModel: Model<LikeCount>,
  ) {}

  /**
   * Toggle like on/off for a target
   * Returns true if liked, false if unliked
   */
  async toggleLike(
    userId: string,
    targetType: LikeTargetType,
    targetId: string,
  ): Promise<{ isLiked: boolean; likeCount: number }> {
    const userObjectId = new Types.ObjectId(userId);
    const targetObjectId = new Types.ObjectId(targetId);

    // Check if already liked
    const existingLike = await this.likeModel.findOne({
      userId: userObjectId,
      targetType,
      targetId: targetObjectId,
    });

    if (existingLike) {
      // Unlike: remove like and decrement count
      await this.likeModel.deleteOne({ _id: existingLike._id });
      const updatedCount = await this.likeCountModel.findOneAndUpdate(
        { targetType, targetId: targetObjectId },
        { $inc: { count: -1 } },
        { new: true },
      );
      return {
        isLiked: false,
        likeCount: Math.max(0, updatedCount?.count || 0),
      };
    } else {
      // Like: create like and increment count
      await this.likeModel.create({
        userId: userObjectId,
        targetType,
        targetId: targetObjectId,
      });
      const updatedCount = await this.likeCountModel.findOneAndUpdate(
        { targetType, targetId: targetObjectId },
        { $inc: { count: 1 } },
        { new: true, upsert: true },
      );
      return {
        isLiked: true,
        likeCount: updatedCount.count,
      };
    }
  }

  /**
   * Get like count for a single target
   */
  async getLikeCount(
    targetType: LikeTargetType,
    targetId: string,
  ): Promise<number> {
    const count = await this.likeCountModel.findOne({
      targetType,
      targetId: new Types.ObjectId(targetId),
    });
    return count?.count || 0;
  }

  /**
   * Get like counts for multiple targets (batch)
   */
  async getLikeCountsBatch(
    targetType: LikeTargetType,
    targetIds: string[],
  ): Promise<Record<string, number>> {
    const objectIds = targetIds.map((id) => new Types.ObjectId(id));
    const counts = await this.likeCountModel.find({
      targetType,
      targetId: { $in: objectIds },
    });

    const result: Record<string, number> = {};
    targetIds.forEach((id) => {
      result[id] = 0;
    });
    counts.forEach((c) => {
      result[c.targetId.toString()] = c.count;
    });
    return result;
  }

  /**
   * Check if user has liked a target
   */
  async isLikedByUser(
    userId: string,
    targetType: LikeTargetType,
    targetId: string,
  ): Promise<boolean> {
    const like = await this.likeModel.findOne({
      userId: new Types.ObjectId(userId),
      targetType,
      targetId: new Types.ObjectId(targetId),
    });
    return !!like;
  }

  /**
   * Check if user has liked multiple targets (batch)
   */
  async isLikedByUserBatch(
    userId: string,
    targetType: LikeTargetType,
    targetIds: string[],
  ): Promise<Record<string, boolean>> {
    const objectIds = targetIds.map((id) => new Types.ObjectId(id));
    const likes = await this.likeModel.find({
      userId: new Types.ObjectId(userId),
      targetType,
      targetId: { $in: objectIds },
    });

    const likedIds = new Set(likes.map((l) => l.targetId.toString()));
    const result: Record<string, boolean> = {};
    targetIds.forEach((id) => {
      result[id] = likedIds.has(id);
    });
    return result;
  }

  /**
   * Get user's liked items of a specific type with pagination
   */
  async getUserLikedItems(
    userId: string,
    targetType: LikeTargetType,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ items: string[]; total: number; hasMore: boolean }> {
    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    const [likes, total] = await Promise.all([
      this.likeModel
        .find({ userId: userObjectId, targetType })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.likeModel.countDocuments({ userId: userObjectId, targetType }),
    ]);

    return {
      items: likes.map((l) => l.targetId.toString()),
      total,
      hasMore: skip + likes.length < total,
    };
  }
}
