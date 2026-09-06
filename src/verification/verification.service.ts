import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import * as bcrypt from "bcrypt";
import { Model } from "mongoose";
import { User } from "../users/schemas/user.schema";
import {
  ForgotPasswordDto,
  OtpChannel,
  ResetPasswordDto,
  SendOtpDto,
  VerifyOtpDto,
  VerifyResetCodeDto,
} from "./dto/send-otp.dto";
import { Otp, OtpPurpose, OtpType } from "./schemas/otp.schema";
import { EmailService } from "./services/email.service";
import { OtpChannelType, SmsService } from "./services/sms.service";
import { resolveUserLocale, type SupportedLocale } from "../common/countries";

// How long a phone OTP stays valid. Kept generous on purpose: UBill SMS
// delivery to Georgian numbers is frequently minutes-late, and an expired
// code surfaces to the user as an unexplained rejection.
const PHONE_OTP_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @InjectModel(Otp.name) private otpModel: Model<Otp>,
    @InjectModel(User.name) private userModel: Model<User>,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  private generateOtp(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Check if phone number is Georgian (+995)
   */
  private isGeorgianNumber(phone: string): boolean {
    return phone.startsWith("+995") || phone.startsWith("995");
  }

  async sendOtp(
    sendOtpDto: SendOtpDto,
  ): Promise<{ message: string; expiresIn: number; channel?: string }> {
    const { identifier, type, channel, locale: requestedLocale } = sendOtpDto;

    // Check rate limiting - max 3 OTPs per identifier in 10 minutes.
    // Only real sends count: a successful verifyOtp writes a "VERIFIED"
    // marker into the same collection, so counting those made every
    // completed login burn two slots and locked the user out of resending
    // after a single retry.
    const recentOtps = await this.otpModel.countDocuments({
      identifier,
      type,
      code: { $ne: "VERIFIED" },
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });

    if (recentOtps >= 3) {
      throw new BadRequestException(
        "Too many OTP requests. Please try again later.",
      );
    }

    // For phone verification
    if (type === OtpType.PHONE) {
      const otpChannel: OtpChannelType =
        channel === OtpChannel.WHATSAPP ? "whatsapp" : "sms";
      const isGeorgian = this.isGeorgianNumber(identifier);

      // Invalidate any existing unused OTPs for this identifier
      await this.otpModel.updateMany(
        { identifier, type, isUsed: false },
        { isUsed: true },
      );

      // For Georgian numbers (UBill) or dev mode: Generate our own OTP
      // For international numbers (Prelude): Let Prelude manage the OTP
      const code = isGeorgian ? this.generateOtp() : "";

      const result = await this.smsService.sendOtp(
        identifier,
        code,
        otpChannel,
      );
      if (!result.success) {
        throw new BadRequestException(
          result.error || "Failed to send verification code. Please try again.",
        );
      }

      // Store OTP record
      // For UBill/dev: Store actual code for local verification
      // For Prelude: Store placeholder (Prelude manages the code)
      // Channel is persisted so verifyOtp can route to the SAME
      // provider that actually sent the code (critical for WhatsApp
      // OTPs on Georgian numbers where the default routing would
      // otherwise check against UBill).
      const otp = new this.otpModel({
        identifier,
        code: result.provider === "prelude" ? "PRELUDE_VERIFY" : code,
        type,
        // 10 minutes: UBill SMS delivery regularly takes several minutes,
        // and a code that lands after its own window is indistinguishable
        // from a wrong one for the user.
        expiresAt: new Date(Date.now() + PHONE_OTP_TTL_MS),
        channel: otpChannel,
      });
      await otp.save();

      const channelLabel = otpChannel === "whatsapp" ? "WhatsApp" : "SMS";
      const providerLabel = isGeorgian ? "UBill" : "Prelude";
      this.logger.log(
        `OTP sent via ${providerLabel} (${channelLabel}) to ${identifier}`,
      );

      return {
        message: `Verification code sent via ${channelLabel}`,
        expiresIn: PHONE_OTP_TTL_MS / 1000,
        channel: otpChannel,
      };
    }

    // For email, use our own OTP generation
    // Invalidate any existing unused OTPs for this identifier
    await this.otpModel.updateMany(
      { identifier, type, isUsed: false },
      { isUsed: true },
    );

    const code = this.generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const otp = new this.otpModel({
      identifier,
      code,
      type,
      expiresAt,
    });

    await otp.save();

    // Resolve the locale for the OTP email body. Order of precedence:
    //   1. Locale explicitly passed by the frontend (the visitor's
    //      active UI language at the moment of the request)
    //   2. Locale derived from the existing user record (country /
    //      languages / preferredLocale) - covers password-reset and
    //      login flows where the user already exists in our DB
    //   3. English fallback
    const existingUser = await this.userModel
      .findOne({ email: identifier })
      .select("country languages preferredLocale")
      .lean();
    const resolvedLocale: SupportedLocale = requestedLocale
      ? ((["en", "ka", "ru"].includes(requestedLocale)
          ? requestedLocale
          : "en") as SupportedLocale)
      : resolveUserLocale(existingUser as never);

    const sent = await this.emailService.sendOtp(identifier, code, resolvedLocale);
    if (!sent) {
      this.logger.warn(
        `Failed to send email OTP to ${identifier}, but OTP was created`,
      );
    }

    return {
      message: "Verification code sent to your email",
      expiresIn: 300, // 5 minutes
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const { identifier, code, type } = verifyOtpDto;

    // For phone verification
    if (type === OtpType.PHONE) {
      // Dev bypass: accept 0007 as a valid OTP - ONLY outside production.
      // In prod this backdoor must stay closed (a fixed code would let
      // anyone verify any phone). Mirrors the NODE_ENV !== 'production'
      // guard used elsewhere for dev-only shortcuts. In prod 0007 simply
      // falls through and is checked like any other (invalid) code.
      if (code === "0007" && process.env.NODE_ENV !== "production") {
        this.logger.warn(`Dev bypass OTP used for ${identifier}`);
        await this.otpModel.updateMany(
          { identifier, type, isUsed: false },
          { isUsed: true },
        );
        await this.createVerifiedMarker(identifier, type);
        return { verified: true };
      }

      // Look up the most recent unused OTP record to discover the
      // channel it was sent through. We need this so the provider
      // routing matches what `requestOtp` picked - critical for
      // WhatsApp on Georgian numbers, where the OTP was issued via
      // Prelude but the default verify routing would otherwise hit
      // UBill and fall through to local DB verification of a
      // PRELUDE_VERIFY placeholder that never matches.
      const recentOtpForChannel = await this.otpModel
        .findOne({
          identifier,
          type,
          isUsed: false,
          expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: -1 })
        .exec();
      const sentChannel: OtpChannelType =
        (recentOtpForChannel?.channel as OtpChannelType) || "sms";

      // First try Prelude verification for international numbers (or
      // for any WhatsApp OTP, regardless of country)
      const smsResult = await this.smsService.verifyOtp(
        identifier,
        code,
        sentChannel,
      );

      if (smsResult.provider === "prelude" && smsResult.verified) {
        // Prelude verified the code
        await this.otpModel.updateMany(
          { identifier, type, isUsed: false },
          { isUsed: true },
        );
        await this.createVerifiedMarker(identifier, type);
        return { verified: true };
      }

      // For UBill, dev mode, or Prelude not configured: verify with our stored OTP
      const otp = await this.otpModel
        .findOne({
          identifier,
          type,
          isUsed: false,
          expiresAt: { $gt: new Date() },
          // Only check real code records: skip the Prelude placeholder and
          // our own consumable "VERIFIED" markers.
          code: { $nin: ["PRELUDE_VERIFY", "VERIFIED"] },
        })
        .sort({ createdAt: -1 });

      if (otp && otp.code === code) {
        await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
        await this.createVerifiedMarker(identifier, type);
        this.logger.log(`OTP verified locally for ${identifier}`);
        return { verified: true };
      }

      // Every failure below used to collapse into a single "Invalid
      // verification code", which made a genuinely wrong digit, an expired
      // code and a code superseded by a resend indistinguishable - both for
      // the user and for us reading the logs. Work out which one it is.
      const lastReal = await this.otpModel
        .findOne({
          identifier,
          type,
          code: { $nin: ["PRELUDE_VERIFY", "VERIFIED"] },
        })
        .sort({ createdAt: -1 });

      // The code the user typed does exist, but that record was already
      // consumed or invalidated by a newer send. Almost always: they read an
      // older SMS, or a duplicate verify request beat this one.
      const stale = await this.otpModel
        .findOne({ identifier, type, code, isUsed: true })
        .sort({ createdAt: -1 });

      if (stale) {
        this.logger.warn(
          `OTP rejected for ${identifier}: superseded/already-used code`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: "Bad Request",
          code: "otp_superseded",
          message:
            "This code is no longer valid. Please use the latest code we sent.",
        });
      }

      if (!otp) {
        this.logger.warn(
          `OTP rejected for ${identifier}: no active code (expired or never sent)`,
        );
        throw new BadRequestException({
          statusCode: 400,
          error: "Bad Request",
          code: "otp_expired",
          message:
            "Verification code expired. Please request a new one.",
        });
      }

      this.logger.warn(
        `OTP rejected for ${identifier}: wrong code (active code issued ${
          lastReal?.get("createdAt") ?? "unknown"
        })`,
      );
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        code: "otp_invalid",
        message: "Invalid verification code",
      });
    }

    // For email, use our stored OTP
    const otp = await this.otpModel
      .findOne({
        identifier,
        type,
        isUsed: false,
        expiresAt: { $gt: new Date() },
        // Never match our own consumable "VERIFIED" markers as a code.
        code: { $ne: "VERIFIED" },
      })
      .sort({ createdAt: -1 });

    if (!otp) {
      throw new BadRequestException("Invalid or expired verification code");
    }

    // Check max attempts
    if (otp.attempts >= 5) {
      await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
      throw new BadRequestException(
        "Too many failed attempts. Please request a new code.",
      );
    }

    if (otp.code !== code) {
      await this.otpModel.updateOne(
        { _id: otp._id },
        { $inc: { attempts: 1 } },
      );
      throw new BadRequestException("Invalid verification code");
    }

    // Mark OTP as used
    await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
    await this.createVerifiedMarker(identifier, type);

    return { verified: true };
  }

  /**
   * Records a short-lived, single-use proof that `identifier` just passed
   * OTP verification. Consumers (register, mark-verified) require this proof
   * before trusting a "verified" flag, so a verified status can no longer be
   * forged by a direct API call. Mirrors the password-reset VERIFIED record.
   */
  private async createVerifiedMarker(
    identifier: string,
    type: OtpType,
  ): Promise<void> {
    await this.otpModel.create({
      identifier,
      code: "VERIFIED",
      type,
      purpose: OtpPurpose.VERIFICATION,
      // Generous window: the pro signup wizard verifies the phone, then the
      // user still fills name/city/password + uploads an avatar before
      // /auth/register consumes this. A short TTL would silently drop their
      // verified flag on a slow signup.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 60 min to consume
      isUsed: false,
    });
  }

  /**
   * Consumes a VERIFIED marker for `identifier`/`type` produced by a recent
   * successful verifyOtp. Returns true (and burns the marker) when the proof
   * exists, false otherwise. Callers decide whether absence is fatal.
   */
  async consumeVerificationMarker(
    identifier: string,
    type: OtpType,
  ): Promise<boolean> {
    const marker = await this.otpModel
      .findOne({
        identifier,
        type,
        purpose: OtpPurpose.VERIFICATION,
        code: "VERIFIED",
        isUsed: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });

    if (!marker) return false;
    await this.otpModel.updateOne({ _id: marker._id }, { isUsed: true });
    return true;
  }

  // Cleanup expired OTPs (can be called by a cron job)
  async cleanupExpiredOtps(): Promise<void> {
    await this.otpModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
  }

  // Password reset methods (phone-based)
  async sendPasswordResetOtp(
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string; expiresIn: number }> {
    const { phone } = forgotPasswordDto;

    // Check if user exists with this phone
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new NotFoundException("No account found with this phone number");
    }

    // Check rate limiting - max 3 password reset OTPs per phone in 10 minutes
    const recentOtps = await this.otpModel.countDocuments({
      identifier: phone,
      purpose: OtpPurpose.PASSWORD_RESET,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });

    if (recentOtps >= 3) {
      throw new BadRequestException(
        "Too many password reset requests. Please try again later.",
      );
    }

    // Invalidate any existing unused password reset OTPs for this phone
    await this.otpModel.updateMany(
      { identifier: phone, purpose: OtpPurpose.PASSWORD_RESET, isUsed: false },
      { isUsed: true },
    );

    const isGeorgian = this.isGeorgianNumber(phone);
    const code = isGeorgian ? this.generateOtp() : "";

    // Send OTP
    const result = await this.smsService.sendOtp(phone, code);
    if (!result.success) {
      throw new BadRequestException(
        result.error || "Failed to send verification code. Please try again.",
      );
    }

    // Track the request for rate limiting
    const otp = new this.otpModel({
      identifier: phone,
      code: result.provider === "prelude" ? "PRELUDE_VERIFY" : code,
      type: OtpType.PHONE,
      purpose: OtpPurpose.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });
    await otp.save();

    return {
      message: "Verification code sent to your phone",
      expiresIn: 300, // 5 minutes
    };
  }

  async verifyPasswordResetOtp(
    verifyResetCodeDto: VerifyResetCodeDto,
  ): Promise<{ verified: boolean }> {
    const { phone, code } = verifyResetCodeDto;

    // Check if user exists with this phone
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new NotFoundException("No account found with this phone number");
    }

    // Look up the most recent reset OTP so we know which provider it
    // came from (mirrors the verifyOtp flow above).
    const recentResetOtp = await this.otpModel
      .findOne({
        identifier: phone,
        purpose: OtpPurpose.PASSWORD_RESET,
        isUsed: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 })
      .exec();
    const resetChannel: OtpChannelType =
      (recentResetOtp?.channel as OtpChannelType) || "sms";

    // Try Prelude verification first for international numbers (or for
    // any WhatsApp OTP regardless of country)
    const smsResult = await this.smsService.verifyOtp(phone, code, resetChannel);

    if (smsResult.provider === "prelude" && smsResult.verified) {
      // Prelude verified
      await this.otpModel.updateMany(
        {
          identifier: phone,
          purpose: OtpPurpose.PASSWORD_RESET,
          isUsed: false,
        },
        { isUsed: true },
      );
    } else {
      // For UBill or dev mode: verify locally
      const otp = await this.otpModel
        .findOne({
          identifier: phone,
          purpose: OtpPurpose.PASSWORD_RESET,
          isUsed: false,
          expiresAt: { $gt: new Date() },
          code: { $ne: "PRELUDE_VERIFY" },
        })
        .sort({ createdAt: -1 });

      if (!otp || otp.code !== code) {
        throw new BadRequestException("Invalid verification code");
      }

      await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
    }

    // Create a verified record that allows password reset within next 5 minutes
    const verifiedOtp = new this.otpModel({
      identifier: phone,
      code: "VERIFIED",
      type: OtpType.PHONE,
      purpose: OtpPurpose.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes to reset password
      isUsed: false,
    });
    await verifiedOtp.save();

    return { verified: true };
  }

  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const { phone, newPassword } = resetPasswordDto;

    // Check for verified OTP record
    const verifiedOtp = await this.otpModel
      .findOne({
        identifier: phone,
        purpose: OtpPurpose.PASSWORD_RESET,
        code: "VERIFIED",
        isUsed: false,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });

    if (!verifiedOtp) {
      throw new BadRequestException(
        "Password reset session expired. Please verify your phone again.",
      );
    }

    // Find the user
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Validate password strength
    if (newPassword.length < 6) {
      throw new BadRequestException(
        "Password must be at least 6 characters long",
      );
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password
    await this.userModel.updateOne(
      { _id: user._id },
      { password: hashedPassword },
    );

    // Mark verified OTP as used
    await this.otpModel.updateOne({ _id: verifiedOtp._id }, { isUsed: true });

    return { message: "Password has been reset successfully" };
  }
}
