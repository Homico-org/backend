import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/schemas/notification.schema';
import { UsersService } from '../users/users.service';
import { SmsService } from '../verification/services/sms.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewRequest } from './schemas/review-request.schema';
import { Review, ReviewSource } from './schemas/review.schema';

@Injectable()
export class ReviewService {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<Review>,
    @InjectModel(ReviewRequest.name) private reviewRequestModel: Model<ReviewRequest>,
    private usersService: UsersService,
    private smsService: SmsService,
    private notificationsService: NotificationsService,
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

  // ============== EXTERNAL REVIEWS ==============

  // Generate a unique token
  private generateToken(): string {
    return randomBytes(16).toString('hex');
  }

  // Get or create the pro's review request link
  async getOrCreateReviewLink(proId: string): Promise<{ token: string; link: string }> {
    // Check if pro already has an active review request
    let reviewRequest = await this.reviewRequestModel.findOne({
      proId: new Types.ObjectId(proId),
      isUsed: false,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    if (!reviewRequest) {
      // Create new review request
      const token = this.generateToken();
      reviewRequest = new this.reviewRequestModel({
        proId: new Types.ObjectId(proId),
        token,
        // Token expires in 90 days
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });
      await reviewRequest.save();
    }

    return {
      token: reviewRequest.token,
      link: `https://www.homico.ge/review/${reviewRequest.token}`,
    };
  }

  // Get review request by token (for public form)
  async getReviewRequestByToken(token: string, ip?: string): Promise<{
    proId: string;
    proName: string;
    proAvatar?: string;
    proTitle?: string;
    isValid: boolean;
    isUsed: boolean;
  }> {
    const reviewRequest = await this.reviewRequestModel.findOne({ token });

    if (!reviewRequest) {
      throw new NotFoundException('Invalid review link');
    }

    // Track IP access
    if (ip && !reviewRequest.accessedFromIps.includes(ip)) {
      reviewRequest.accessedFromIps.push(ip);
      await reviewRequest.save();
    }

    // Check expiration
    if (reviewRequest.expiresAt && reviewRequest.expiresAt < new Date()) {
      return {
        proId: reviewRequest.proId.toString(),
        proName: '',
        isValid: false,
        isUsed: reviewRequest.isUsed,
      };
    }

    // Get pro info
    const pro = await this.usersService.findById(reviewRequest.proId.toString());
    
    return {
      proId: reviewRequest.proId.toString(),
      proName: pro?.name || 'Professional',
      proAvatar: pro?.avatar,
      proTitle: pro?.title,
      isValid: true,
      isUsed: reviewRequest.isUsed,
    };
  }

  // Submit external review directly (from pro's profile page) - requires login
  async submitDirectExternalReview(
    proId: string,
    reviewerId: string,
    data: {
      rating: number;
      text?: string;
      phone?: string; // For clients who need to verify their phone
    },
  ): Promise<Review> {
    // Check if pro exists
    const pro = await this.usersService.findById(proId);
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    // Get reviewer info
    const reviewer = await this.usersService.findById(reviewerId);
    if (!reviewer) {
      throw new NotFoundException('User not found');
    }

    // Can't review yourself
    if (proId === reviewerId) {
      throw new BadRequestException('You cannot review yourself');
    }

    // Check if user already left a review for this pro
    const existingReview = await this.reviewModel.findOne({
      proId: new Types.ObjectId(proId),
      $or: [
        { clientId: new Types.ObjectId(reviewerId) },
        { externalClientPhone: reviewer.phone },
      ],
      source: ReviewSource.EXTERNAL,
    });

    if (existingReview) {
      throw new BadRequestException('You have already left a review for this professional');
    }

    // Use phone from user profile, or provided phone for clients without one
    let verifiedPhone = reviewer.phone;
    let isPhoneVerified = !!reviewer.isPhoneVerified || !!reviewer.phone;

    // If user doesn't have a phone, they need to provide one
    if (!verifiedPhone && data.phone) {
      verifiedPhone = data.phone;
      isPhoneVerified = false;
    }

    if (!verifiedPhone) {
      throw new BadRequestException('Phone number is required for reviews');
    }

    // Create the review
    const review = new this.reviewModel({
      proId: new Types.ObjectId(proId),
      clientId: new Types.ObjectId(reviewerId),
      rating: data.rating,
      text: data.text,
      source: ReviewSource.EXTERNAL,
      externalClientName: reviewer.name,
      externalClientPhone: verifiedPhone,
      isVerified: isPhoneVerified,
      externalVerifiedAt: isPhoneVerified ? new Date() : undefined,
      isAnonymous: false,
    });

    await review.save();

    // Update pro's rating (external reviews from verified users get full weight)
    const weight = isPhoneVerified ? 1 : 0.7;
    await this.usersService.updateRating(proId, data.rating, weight);

    // Notify the pro
    await this.notificationsService.notify(
      proId,
      NotificationType.NEW_REVIEW,
      'New review received!',
      `${reviewer.name} left you a ${data.rating}-star review`,
      {
        link: `/professionals/${proId}#reviews`,
        referenceId: review._id.toString(),
        referenceModel: 'Review',
      },
    );

    return review;
  }

  // Submit external review
  async submitExternalReview(
    token: string,
    data: {
      rating: number;
      text?: string;
      clientName: string;
      clientPhone?: string;
      clientEmail?: string;
      projectTitle?: string;
      isAnonymous?: boolean;
      photos?: string[];
    },
    ip?: string,
  ): Promise<Review> {
    const reviewRequest = await this.reviewRequestModel.findOne({ token });

    if (!reviewRequest) {
      throw new NotFoundException('Invalid review link');
    }

    if (reviewRequest.isUsed) {
      throw new BadRequestException('This review link has already been used');
    }

    if (reviewRequest.expiresAt && reviewRequest.expiresAt < new Date()) {
      throw new BadRequestException('This review link has expired');
    }

    // Rate limiting: Check if too many reviews from same IP
    if (ip) {
      const recentReviewsFromIp = await this.reviewModel.countDocuments({
        source: ReviewSource.EXTERNAL,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      
      if (recentReviewsFromIp >= 10) {
        throw new ForbiddenException('Too many reviews submitted recently');
      }
    }

    // Create the review
    const review = new this.reviewModel({
      proId: reviewRequest.proId,
      rating: data.rating,
      text: data.text,
      photos: data.photos || [],
      source: ReviewSource.EXTERNAL,
      externalClientName: data.clientName,
      externalClientPhone: data.clientPhone,
      externalClientEmail: data.clientEmail,
      externalVerifiedAt: data.clientPhone || data.clientEmail ? new Date() : undefined,
      isVerified: !!(data.clientPhone || data.clientEmail),
      reviewRequestToken: token,
      isAnonymous: data.isAnonymous || false,
      projectTitle: data.projectTitle,
    });

    await review.save();

    // Mark review request as used
    reviewRequest.isUsed = true;
    reviewRequest.usedAt = new Date();
    reviewRequest.reviewId = review._id;
    await reviewRequest.save();

    // Update pro's rating (external reviews have 0.7 weight)
    await this.usersService.updateRating(
      reviewRequest.proId.toString(),
      data.rating,
      0.7, // Weight for external reviews
    );

    // Notify the pro
    const pro = await this.usersService.findById(reviewRequest.proId.toString());
    await this.notificationsService.notify(
      reviewRequest.proId.toString(),
      NotificationType.NEW_REVIEW,
      'New review received!',
      `${data.isAnonymous ? 'Someone' : data.clientName} left you a ${data.rating}-star review`,
      {
        link: `/professionals/${reviewRequest.proId.toString()}#reviews`,
        referenceId: review._id.toString(),
        referenceModel: 'Review',
      },
    );

    return review;
  }

  // Send review invitation via SMS
  async sendReviewInvitation(
    proId: string,
    data: { phone?: string; email?: string; name?: string },
  ): Promise<{ success: boolean; message: string }> {
    // Rate limiting: Max 10 invitations per month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const invitationsThisMonth = await this.reviewRequestModel.countDocuments({
      proId: new Types.ObjectId(proId),
      createdAt: { $gte: startOfMonth },
      invitedPhone: { $exists: true },
    });

    if (invitationsThisMonth >= 10) {
      throw new ForbiddenException('Maximum 10 review invitations per month');
    }

    // Get pro info
    const pro = await this.usersService.findById(proId);
    if (!pro) {
      throw new NotFoundException('Professional not found');
    }

    // Create a new review request for this invitation
    const token = this.generateToken();
    const reviewRequest = new this.reviewRequestModel({
      proId: new Types.ObjectId(proId),
      token,
      invitedPhone: data.phone,
      invitedEmail: data.email,
      invitedName: data.name,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
    await reviewRequest.save();

    const reviewLink = `https://www.homico.ge/review/${token}`;

    // Send SMS if phone provided
    if (data.phone) {
      const smsMessage = `Homico: ${pro.name} გთხოვთ დატოვოთ შეფასება. ${reviewLink}`;
      try {
        await this.smsService.sendNotificationSms(data.phone, smsMessage);
        return { success: true, message: 'Invitation sent via SMS' };
      } catch (error) {
        console.error('Failed to send review invitation SMS:', error);
        return { success: false, message: 'Failed to send SMS' };
      }
    }

    // TODO: Send email if email provided
    if (data.email) {
      // Email sending would go here
      return { success: true, message: 'Invitation link created (email not implemented yet)' };
    }

    return { success: true, message: 'Invitation link created' };
  }

  // Get pro's review statistics
  async getReviewStats(proId: string): Promise<{
    totalReviews: number;
    homicoReviews: number;
    externalReviews: number;
    averageRating: number;
    pendingInvitations: number;
  }> {
    const [homicoCount, externalCount, pendingInvites, avgResult] = await Promise.all([
      this.reviewModel.countDocuments({ proId: new Types.ObjectId(proId), source: ReviewSource.HOMICO }),
      this.reviewModel.countDocuments({ proId: new Types.ObjectId(proId), source: ReviewSource.EXTERNAL }),
      this.reviewRequestModel.countDocuments({ 
        proId: new Types.ObjectId(proId), 
        isUsed: false,
        invitedPhone: { $exists: true },
      }),
      this.reviewModel.aggregate([
        { $match: { proId: new Types.ObjectId(proId) } },
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),
    ]);

    return {
      totalReviews: homicoCount + externalCount,
      homicoReviews: homicoCount,
      externalReviews: externalCount,
      averageRating: avgResult[0]?.avgRating || 0,
      pendingInvitations: pendingInvites,
    };
  }
}
