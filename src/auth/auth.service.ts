import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { ActivityType, LoggerService } from "../common/logger";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { User, UserRole } from "../users/schemas/user.schema";
import { UsersService } from "../users/users.service";
import { OtpType } from "../verification/dto/send-otp.dto";
import { VerificationService } from "../verification/verification.service";
import { LoginDto } from "./dto/login.dto";
import { PhoneLoginDto } from "./dto/phone-login.dto";
import { ProRegisterDto } from "./dto/pro-register.dto";
import { ProRegistrationStepDto } from "./dto/pro-registration-step.dto";

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService)) private usersService: UsersService,
    private jwtService: JwtService,
    private readonly verificationService: VerificationService,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly logger: LoggerService,
  ) {}

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

  private signToken(user: any) {
    return this.jwtService.sign({
      sub: user._id,
      email: user.email,
      role: user.role,
    });
  }

  async register(
    createUserDto: CreateUserDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.usersService.create(createUserDto);

    this.logger.logActivity({
      type: ActivityType.USER_REGISTER,
      userId: user._id.toString(),
      userEmail: user.email || user.phone || "unknown",
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: {
        role: user.role,
        phone: user.phone,
        registrationMethod: user.phone ? "phone" : "email",
      },
    });

    return {
      access_token: this.signToken(user),
      user: this.buildUserResponse(user),
    };
  }

  async login(
    loginDto: LoginDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    const user = await this.usersService.findByEmailOrPhone(
      loginDto.identifier,
    );

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'This account uses Google login. Please sign in with Google or use "Forgot Password" to set a password.',
      );
    }

    const isPasswordValid = await this.usersService.validatePassword(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.usersService.updateLastLogin(user._id.toString());

    const loginMethod = loginDto.identifier?.includes("@") ? "email" : "phone";
    this.logger.logActivity({
      type: ActivityType.USER_LOGIN,
      userId: user._id.toString(),
      userEmail: user.email || user.phone || "unknown",
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: {
        role: user.role,
        loginMethod,
        identifier: loginDto.identifier,
      },
    });

    return {
      access_token: this.signToken(user),
      user: this.buildUserResponse(user),
    };
  }

  async phoneLogin(
    dto: PhoneLoginDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    // Verify OTP
    await this.verificationService.verifyOtp({
      identifier: dto.phone,
      code: dto.code,
      type: OtpType.PHONE,
    });

    // Find existing user by phone
    const existing = await this.usersService.findByPhone(dto.phone);

    if (existing) {
      await this.usersService.updateLastLogin(existing._id.toString());

      this.logger.logActivity({
        type: ActivityType.USER_LOGIN,
        userId: existing._id.toString(),
        userEmail: existing.email || existing.phone || "unknown",
        userName: existing.name,
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        details: { role: existing.role, loginMethod: "phone_otp" },
      });

      return {
        access_token: this.signToken(existing),
        user: this.buildUserResponse(existing),
      };
    }

    // New user — name is required
    if (!dto.name) {
      throw new BadRequestException("Name is required for new users");
    }

    // Generate UID
    const lastUser = await this.userModel
      .findOne({ uid: { $exists: true } })
      .sort({ uid: -1 })
      .exec();
    const uid = lastUser?.uid ? lastUser.uid + 1 : 100001;

    const user = await new this.userModel({
      uid,
      name: dto.name,
      phone: dto.phone,
      role: UserRole.CLIENT,
      isPhoneVerified: true,
      phoneVerifiedAt: new Date(),
    }).save();

    this.logger.logActivity({
      type: ActivityType.USER_REGISTER,
      userId: user._id.toString(),
      userEmail: user.phone || "unknown",
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: { role: user.role, registrationMethod: "phone_otp" },
    });

    return {
      access_token: this.signToken(user),
      user: this.buildUserResponse(user),
    };
  }

  async proRegister(
    dto: ProRegisterDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    // Verify OTP
    await this.verificationService.verifyOtp({
      identifier: dto.phone,
      code: dto.code,
      type: OtpType.PHONE,
    });

    const existing = await this.usersService.findByPhone(dto.phone);

    if (existing) {
      // Already a pro
      if (existing.role === UserRole.PRO) {
        throw new ConflictException(
          "This phone is already registered as a professional",
        );
      }

      // Upgrade client to pro
      existing.role = UserRole.PRO;
      existing.name = dto.name;
      existing.registrationStep = 1;
      existing.isPhoneVerified = true;
      existing.phoneVerifiedAt = new Date();
      await existing.save();

      this.logger.logActivity({
        type: ActivityType.USER_REGISTER,
        userId: existing._id.toString(),
        userEmail: existing.phone || "unknown",
        userName: existing.name,
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        details: {
          role: UserRole.PRO,
          registrationMethod: "phone_otp",
          upgradedFromClient: true,
        },
      });

      return {
        access_token: this.signToken(existing),
        user: this.buildUserResponse(existing),
      };
    }

    // New pro user
    const lastUser = await this.userModel
      .findOne({ uid: { $exists: true } })
      .sort({ uid: -1 })
      .exec();
    const uid = lastUser?.uid ? lastUser.uid + 1 : 100001;

    const user = await new this.userModel({
      uid,
      name: dto.name,
      phone: dto.phone,
      role: UserRole.PRO,
      isPhoneVerified: true,
      phoneVerifiedAt: new Date(),
      registrationStep: 1,
    }).save();

    this.logger.logActivity({
      type: ActivityType.USER_REGISTER,
      userId: user._id.toString(),
      userEmail: user.phone || "unknown",
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: { role: UserRole.PRO, registrationMethod: "phone_otp" },
    });

    return {
      access_token: this.signToken(user),
      user: this.buildUserResponse(user),
    };
  }

  async updateProRegistrationStep(userId: string, dto: ProRegistrationStepDto) {
    const user = await this.usersService.findById(userId);

    if (!user || user.role !== UserRole.PRO) {
      throw new BadRequestException("User must be a professional");
    }

    const updateData: Record<string, any> = {};

    switch (dto.step) {
      case 2:
        if (dto.name) updateData.name = dto.name;
        if (dto.email) updateData.email = dto.email;
        if (dto.city) updateData.city = dto.city;
        updateData.registrationStep = 2;
        break;
      case 3:
        if (dto.selectedCategories)
          updateData.selectedCategories = dto.selectedCategories;
        if (dto.selectedSubcategories)
          updateData.selectedSubcategories = dto.selectedSubcategories;
        updateData.registrationStep = 3;
        break;
      case 4:
        if (dto.servicePricing) updateData.servicePricing = dto.servicePricing;
        updateData.registrationStep = 4;
        break;
      default:
        throw new BadRequestException("Invalid step number");
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .exec();

    return { user: this.buildUserResponse(updated) };
  }

  async validateUser(userId: string) {
    return this.usersService.findById(userId);
  }

  async getDemoAccounts() {
    return this.usersService.getDemoAccounts();
  }
}
