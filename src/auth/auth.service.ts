import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectModel } from "@nestjs/mongoose";
import { OAuth2Client } from "google-auth-library";
import { Model } from "mongoose";
import { AmplitudeService } from "../analytics/amplitude.service";
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
import { GoogleAuthDto } from "./dto/google-auth.dto";
import { AttachPhoneDto } from "./dto/attach-phone.dto";

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    @Inject(forwardRef(() => UsersService)) private usersService: UsersService,
    private jwtService: JwtService,
    private readonly verificationService: VerificationService,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly logger: LoggerService,
    private readonly amplitude: AmplitudeService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>("GOOGLE_CLIENT_ID"),
    );
  }

  /**
   * Mirror auth events to Amplitude. Server-side tracking is more reliable
   * than the frontend equivalents (no ad-blocker drop, no client-side
   * skip-on-error), and we use it as ground truth for funnel metrics.
   *
   * Past-tense names (`user_registered`, `user_logged_in`) intentionally
   * differ from the frontend's present-tense (`register`, `login`) so the
   * two sources don't collide in Amplitude dashboards during the parallel
   * period. Once we're confident in server tracking, the frontend hooks
   * for these specific actions can be deleted to remove the duplicate.
   */
  private trackAuthEvent(
    eventName: "user_registered" | "user_logged_in",
    user: { _id: { toString(): string }; uid?: number; role: string; city?: string; email?: string; phone?: string },
    extras?: Record<string, string | number | boolean | undefined>,
  ) {
    const userId = user._id.toString();
    if (eventName === "user_registered") {
      // Set persistent user properties on register so every subsequent
      // event has role / city attached without re-identifying.
      this.amplitude.identify(userId, {
        role: user.role,
        uid: user.uid,
        city: user.city,
        hasEmail: Boolean(user.email),
        hasPhone: Boolean(user.phone),
      });
    }
    this.amplitude.track(eventName, {
      userId,
      properties: {
        role: user.role,
        uid: user.uid,
        ...extras,
      },
    });
  }

  private buildUserResponse(user: any) {
    // Read-time premium expiry guard, mirroring GET /users/me: never present a
    // lapsed subscription as active (the hourly cron owns the persistent flip).
    const premiumActive =
      !!user.isPremium &&
      (!user.premiumExpiresAt ||
        new Date(user.premiumExpiresAt) > new Date());
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
      // Premium subscription state so the header/dropdown reflect it right
      // after login/register - WITHOUT waiting for a /users/me refresh.
      // Without this, a premium pro sees the "Go Premium" CTA + upsell until
      // a full page reload (looked like they'd lost their subscription).
      isPremium: premiumActive,
      premiumTier: premiumActive ? user.premiumTier || "none" : "none",
      premiumExpiresAt: user.premiumExpiresAt,
    };
  }

  private generateTokens(user: any) {
    const payload = { sub: user._id, email: user.email, role: user.role };
    const access_token = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refresh_token = this.jwtService.sign(payload, { expiresIn: '30d' });
    return { access_token, refresh_token };
  }

  async register(
    createUserDto: CreateUserDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    // The client may *ask* for a phone-verified account, but we never trust
    // that flag on its own — it must be backed by a VERIFIED marker produced
    // by a real OTP check (POST /verification/verify-otp). Without proof we
    // degrade gracefully to unverified rather than blocking the signup.
    let isPhoneVerified = false;
    if (createUserDto.phone && createUserDto.isPhoneVerified) {
      isPhoneVerified = await this.verificationService.consumeVerificationMarker(
        createUserDto.phone,
        OtpType.PHONE,
      );
    }
    const user = await this.usersService.create({
      ...createUserDto,
      // SECURITY: never let a public registration self-assign a privileged
      // role. Only client/pro are selectable here; anything else (notably
      // `admin`, which the DTO enum still lists for internal use) falls back
      // to client. Admins are provisioned out-of-band, never via /auth/register.
      role: createUserDto.role === UserRole.PRO ? UserRole.PRO : UserRole.CLIENT,
      isPhoneVerified,
    });

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

    this.trackAuthEvent("user_registered", user, {
      registrationMethod: user.phone ? "phone" : "email",
    });

    return {
      ...this.generateTokens(user),
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

    this.trackAuthEvent("user_logged_in", user, { loginMethod });

    return {
      ...this.generateTokens(user),
      user: this.buildUserResponse(user),
    };
  }

  async phoneLogin(
    dto: PhoneLoginDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    // Resolve the account BEFORE verifying the OTP. A brand-new client needs a
    // name, and the signup UI collects it in a second step: it first calls
    // phoneLogin without a name, gets "name required", then re-calls with the
    // name and the SAME code. Consuming the OTP on that first (name-less) call
    // made the retry fail with "invalid code", so signup could never complete
    // - bail for the missing name first, leaving the OTP intact.
    const existing = await this.usersService.findByPhone(dto.phone);

    if (!existing && !dto.name) {
      // Machine-readable code so the client does not have to substring-match
      // the English message to tell "we need a name" apart from a real error.
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        code: "name_required",
        message: "Name is required for new users",
      });
    }

    // Verify OTP (consumes it). Only reached once we can actually complete.
    await this.verificationService.verifyOtp({
      identifier: dto.phone,
      code: dto.code,
      type: OtpType.PHONE,
    });

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

      this.trackAuthEvent("user_logged_in", existing, { loginMethod: "phone_otp" });

      return {
        ...this.generateTokens(existing),
        user: this.buildUserResponse(existing),
      };
    }

    // New user (name already validated above, before the OTP was consumed).
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

    this.trackAuthEvent("user_registered", user, { registrationMethod: "phone_otp" });

    return {
      ...this.generateTokens(user),
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

      this.trackAuthEvent("user_registered", existing, {
        registrationMethod: "phone_otp",
        upgradedFromClient: true,
      });

      return {
        ...this.generateTokens(existing),
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

    this.trackAuthEvent("user_registered", user, { registrationMethod: "phone_otp" });

    return {
      ...this.generateTokens(user),
      user: this.buildUserResponse(user),
    };
  }

  /**
   * Google OAuth sign-up / sign-in.
   *
   * The client performs the Google Sign-In and sends us the resulting ID
   * token (a signed JWT). We verify it server-side against our own
   * GOOGLE_CLIENT_ID audience — never trusting any user fields the client
   * might send — then either log in an existing account (matched by
   * googleId, or linked by email) or create a brand-new password-less
   * account (mirrors how phoneLogin/proRegister create users).
   *
   * Phone is NOT collected here. The response carries `needsPhone` so the
   * frontend can route a freshly-created (or otherwise phone-less) user
   * through the OTP step (/verification/send-otp + /auth/attach-phone).
   */
  async googleAuth(
    dto: GoogleAuthDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    const clientId = this.configService.get<string>("GOOGLE_CLIENT_ID");
    if (!clientId) {
      throw new BadRequestException("Google login is not configured");
    }

    // Verify the ID token: signature + expiry + audience (our client id).
    let payload:
      | {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        }
      | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("Invalid Google token");
    }

    if (!payload?.sub) {
      throw new UnauthorizedException("Invalid Google token");
    }

    // Require a Google-verified email. Prevents account takeover via an
    // unverified email that collides with an existing local account.
    if (!payload.email || payload.email_verified !== true) {
      throw new UnauthorizedException("Google account email is not verified");
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name || "";
    const picture = payload.picture;
    const requestedRole =
      dto.role === "pro" ? UserRole.PRO : UserRole.CLIENT;

    // 1. Existing account already linked to this Google identity.
    let user = await this.userModel.findOne({ googleId }).exec();
    let isNewUser = false;

    // 2. Otherwise, an existing local account with the same email -> LINK it.
    if (!user) {
      const byEmail = await this.userModel.findOne({ email }).exec();
      if (byEmail) {
        // Never auto-link Google to an admin account: someone controlling that
        // Gmail box could otherwise take over an admin, bypassing the password.
        // Admin Google linking, if ever wanted, must be done manually.
        if (byEmail.role === UserRole.ADMIN) {
          throw new UnauthorizedException(
            "This email belongs to a restricted account; sign in with your password.",
          );
        }
        byEmail.googleId = googleId;
        if (!byEmail.avatar && picture) byEmail.avatar = picture;
        await byEmail.save();
        user = byEmail;
      }
    }

    // 3. Brand-new user — create a password-less account.
    if (!user) {
      const lastUser = await this.userModel
        .findOne({ uid: { $exists: true } })
        .sort({ uid: -1 })
        .exec();
      const uid = lastUser?.uid ? lastUser.uid + 1 : 100001;

      user = await new this.userModel({
        uid,
        googleId,
        email,
        name,
        avatar: picture,
        role: requestedRole,
        isEmailVerified: true,
        isPhoneVerified: false,
        ...(requestedRole === UserRole.PRO ? { registrationStep: 1 } : {}),
      }).save();
      isNewUser = true;
    } else {
      await this.usersService.updateLastLogin(user._id.toString());
    }

    if (isNewUser) {
      this.logger.logActivity({
        type: ActivityType.USER_REGISTER,
        userId: user._id.toString(),
        userEmail: user.email || "unknown",
        userName: user.name,
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        details: { role: user.role, registrationMethod: "google" },
      });
      this.trackAuthEvent("user_registered", user, {
        registrationMethod: "google",
      });
    } else {
      this.logger.logActivity({
        type: ActivityType.USER_LOGIN,
        userId: user._id.toString(),
        userEmail: user.email || "unknown",
        userName: user.name,
        ip: requestMeta?.ip,
        userAgent: requestMeta?.userAgent,
        details: { role: user.role, loginMethod: "google" },
      });
      this.trackAuthEvent("user_logged_in", user, { loginMethod: "google" });
    }

    return {
      ...this.generateTokens(user),
      user: this.buildUserResponse(user),
      needsPhone: !user.isPhoneVerified,
    };
  }

  /**
   * Attach + verify a phone number to the currently authenticated user.
   * Used right after a Google sign-up to satisfy the "phone is mandatory"
   * requirement. The OTP must already have been sent via the existing
   * /verification/send-otp endpoint; here we only verify + attach.
   */
  async attachPhone(
    userId: string,
    dto: AttachPhoneDto,
    requestMeta?: { ip?: string; userAgent?: string },
  ) {
    // 1. Verify the OTP (throws BadRequest on invalid/expired code).
    await this.verificationService.verifyOtp({
      identifier: dto.identifier,
      code: dto.code,
      type: OtpType.PHONE,
    });

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    // 2. Phone uniqueness — same rule as usersService.create: the number
    // must not already belong to a DIFFERENT account.
    const existingByPhone = await this.usersService.findByPhone(dto.identifier);
    if (
      existingByPhone &&
      existingByPhone._id.toString() !== user._id.toString()
    ) {
      throw new ConflictException(
        "User with this phone number already exists",
      );
    }

    // 3. Attach + mark verified.
    user.phone = dto.identifier;
    user.isPhoneVerified = true;
    user.phoneVerifiedAt = new Date();
    await user.save();

    this.logger.logActivity({
      type: ActivityType.USER_UPDATE,
      userId: user._id.toString(),
      userEmail: user.email || user.phone || "unknown",
      userName: user.name,
      ip: requestMeta?.ip,
      userAgent: requestMeta?.userAgent,
      details: { action: "phone_attached", method: "otp" },
    });

    // Refresh tokens so the JWT reflects the current account state (the
    // payload doesn't embed isPhoneVerified, but re-issuing keeps the
    // contract identical to every other flow).
    return {
      ...this.generateTokens(user),
      user: this.buildUserResponse(user),
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.userModel.findById(payload.sub);
      if (!user) throw new UnauthorizedException();
      const tokens = this.generateTokens(user);
      return { ...tokens, user: this.buildUserResponse(user) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
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
        if (dto.selectedCategories) {
          updateData.selectedCategories = dto.selectedCategories;
          updateData.categories = dto.selectedCategories;
        }
        if (dto.selectedSubcategories) {
          updateData.selectedSubcategories = dto.selectedSubcategories;
          updateData.subcategories = dto.selectedSubcategories;
        }
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
