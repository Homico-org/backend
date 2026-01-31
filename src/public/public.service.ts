import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { Job } from '../jobs/schemas/job.schema';
import { Review } from '../review/schemas/review.schema';

@Injectable()
export class PublicService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Job.name) private jobModel: Model<Job>,
    @InjectModel(Review.name) private reviewModel: Model<Review>,
  ) {}

  async getLandingStats() {
    const [
      totalPros,
      totalProjects,
      avgRatingResult,
    ] = await Promise.all([
      // Count verified/approved professionals
      this.userModel.countDocuments({
        role: 'pro',
        verificationStatus: { $in: ['verified', 'approved'] }
      }),
      // Count completed jobs
      this.jobModel.countDocuments({ status: 'completed' }),
      // Calculate average rating from reviews
      this.reviewModel.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    const avgRating = avgRatingResult[0]?.avgRating || 4.8;

    // Multiply counts by 5 to show growth potential (temporary boost for low data)
    const MULTIPLIER = 5;

    return {
      activePros: totalPros * MULTIPLIER,
      projectsCompleted: totalProjects * MULTIPLIER,
      avgRating: Math.round(avgRating * 10) / 10, // Round to 1 decimal
      avgResponseTime: '<1', // This would need actual tracking, using placeholder
    };
  }

  async getRecentActivity() {
    // Get recent completed jobs/hires for live activity feed
    const recentJobs = await this.jobModel
      .find({ status: 'completed' })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('client', 'name')
      .select('category client updatedAt')
      .lean();

    // Get recent proposals accepted
    const recentHires = await this.jobModel
      .find({ status: 'in_progress' })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('client', 'name')
      .populate('selectedProposal')
      .select('category client updatedAt')
      .lean();

    return {
      recentJobs,
      recentHires,
    };
  }
}
