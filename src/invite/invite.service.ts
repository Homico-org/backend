import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import { InviteToken } from "./schemas/invite-token.schema";
import { User, UserRole } from "../users/schemas/user.schema";
import { VerificationService } from "../verification/verification.service";
import { ActivateInviteDto } from "./dto/activate-invite.dto";

enum OtpType {
  PHONE = "phone",
}

@Injectable()
export class InviteService {
  constructor(
    @InjectModel(InviteToken.name)
    private inviteModel: Model<InviteToken>,
    @InjectModel(User.name) private userModel: Model<User>,
    private verificationService: VerificationService,
    private jwtService: JwtService,
  ) {}

  private signToken(user: any) {
    return this.jwtService.sign({
      sub: user._id,
      email: user.email,
      role: user.role,
    });
  }

  private buildUserResponse(user: any) {
    return {
      id: user._id,
      uid: user.uid,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar,
      city: user.city,
      selectedCategories: user.selectedCategories || [],
      selectedSubcategories: user.selectedSubcategories || [],
      accountType: user.accountType || "individual",
      isProfileCompleted: user.isProfileCompleted ?? false,
      verificationStatus: user.verificationStatus || "pending",
      registrationStep: user.registrationStep ?? 0,
      servicePricing: user.servicePricing || [],
    };
  }

  async getInviteByToken(token: string) {
    const invite = await this.inviteModel.findOne({
      token,
      status: { $in: ["pending", "sms_sent", "opened"] },
    });

    if (!invite) {
      throw new NotFoundException("Invalid or expired invite link");
    }

    // Track open
    if (invite.status === "pending" || invite.status === "sms_sent") {
      invite.status = "opened";
      invite.openedAt = new Date();
    }
    invite.openCount = (invite.openCount || 0) + 1;
    await invite.save();

    return {
      token: invite.token,
      name: invite.name,
      phone: invite.phone,
      city: invite.city,
      cityKey: invite.cityKey,
      category: invite.category,
      subcategory: invite.subcategory,
      categoryKa: invite.categoryKa,
      subcategoryKa: invite.subcategoryKa,
      type: invite.type,
    };
  }

  async activateInvite(dto: ActivateInviteDto) {
    const invite = await this.inviteModel.findOne({
      token: dto.token,
      status: { $in: ["pending", "sms_sent", "opened"] },
    });

    if (!invite) {
      throw new NotFoundException("Invalid or expired invite link");
    }

    // Verify phone matches invite
    if (invite.phone !== dto.phone) {
      throw new BadRequestException("Phone number does not match invite");
    }

    // Verify OTP
    await this.verificationService.verifyOtp({
      identifier: dto.phone,
      code: dto.code,
      type: OtpType.PHONE,
    });

    // Check if user already exists
    const existing = await this.userModel.findOne({ phone: dto.phone });

    if (existing) {
      if (existing.role === UserRole.PRO) {
        // Already a pro — just activate invite and return token
        invite.status = "activated";
        invite.activatedAt = new Date();
        invite.userId = existing._id;
        await invite.save();

        return {
          access_token: this.signToken(existing),
          user: this.buildUserResponse(existing),
        };
      }

      // Upgrade client to pro
      existing.role = UserRole.PRO;
      existing.name = invite.name;
      existing.city = invite.cityKey || existing.city;
      existing.selectedCategories = [invite.category];
      existing.selectedSubcategories = [invite.subcategory];
      existing.isPhoneVerified = true;
      (existing as any).phoneVerifiedAt = new Date();
      existing.registrationStep = 1;
      await existing.save();

      invite.status = "activated";
      invite.activatedAt = new Date();
      invite.userId = existing._id;
      await invite.save();

      return {
        access_token: this.signToken(existing),
        user: this.buildUserResponse(existing),
      };
    }

    // Create new pro user
    const lastUser = await this.userModel
      .findOne({ uid: { $exists: true } })
      .sort({ uid: -1 })
      .exec();
    const uid = lastUser?.uid ? lastUser.uid + 1 : 100001;

    const user = await new this.userModel({
      uid,
      name: invite.name,
      phone: invite.phone,
      role: UserRole.PRO,
      city: invite.cityKey,
      selectedCategories: [invite.category],
      selectedSubcategories: [invite.subcategory],
      isPhoneVerified: true,
      phoneVerifiedAt: new Date(),
      registrationStep: 1,
      avgRating: invite.rating || 0,
      totalReviews: invite.reviewCount || 0,
    }).save();

    invite.status = "activated";
    invite.activatedAt = new Date();
    invite.userId = user._id;
    await invite.save();

    return {
      access_token: this.signToken(user),
      user: this.buildUserResponse(user),
    };
  }

  async getStats() {
    const [pending, smsSent, opened, activated, total] = await Promise.all([
      this.inviteModel.countDocuments({ status: "pending" }),
      this.inviteModel.countDocuments({ status: "sms_sent" }),
      this.inviteModel.countDocuments({ status: "opened" }),
      this.inviteModel.countDocuments({ status: "activated" }),
      this.inviteModel.countDocuments(),
    ]);

    const byType = await this.inviteModel.aggregate([
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);

    return {
      total,
      funnel: { pending, sms_sent: smsSent, opened, activated },
      conversionRate: total > 0 ? ((activated / total) * 100).toFixed(1) + "%" : "0%",
      openRate: smsSent > 0 ? (((opened + activated) / (smsSent + opened + activated)) * 100).toFixed(1) + "%" : "N/A",
      byType: Object.fromEntries(byType.map((t) => [t._id, t.count])),
    };
  }
}
