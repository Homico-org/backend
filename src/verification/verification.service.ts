import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { ForgotPasswordDto, OtpChannel, ResetPasswordDto, SendOtpDto, VerifyOtpDto, VerifyResetCodeDto } from './dto/send-otp.dto';
import { Otp, OtpPurpose, OtpType } from './schemas/otp.schema';
import { EmailService } from './services/email.service';
import { OtpChannelType, SmsService } from './services/sms.service';

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
    return phone.startsWith('+995') || phone.startsWith('995');
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string; expiresIn: number; channel?: string }> {
    const { identifier, type, channel } = sendOtpDto;

    // Check rate limiting - max 3 OTPs per identifier in 10 minutes
    const recentOtps = await this.otpModel.countDocuments({
      identifier,
      type,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });

    if (recentOtps >= 3) {
      throw new BadRequestException('Too many OTP requests. Please try again later.');
    }

    // For phone verification
    if (type === OtpType.PHONE) {
      const otpChannel: OtpChannelType = channel === OtpChannel.WHATSAPP ? 'whatsapp' : 'sms';
      const isGeorgian = this.isGeorgianNumber(identifier);

      // Invalidate any existing unused OTPs for this identifier
      await this.otpModel.updateMany(
        { identifier, type, isUsed: false },
        { isUsed: true },
      );

      // For Georgian numbers (UBill) or dev mode: Generate our own OTP
      // For international numbers (Prelude): Let Prelude manage the OTP
      const code = isGeorgian ? this.generateOtp() : '';
      
      const result = await this.smsService.sendOtp(identifier, code, otpChannel);
      if (!result.success) {
        throw new BadRequestException(result.error || 'Failed to send verification code. Please try again.');
      }

      // Store OTP record
      // For UBill/dev: Store actual code for local verification
      // For Prelude: Store placeholder (Prelude manages the code)
      const otp = new this.otpModel({
        identifier,
        code: result.provider === 'prelude' ? 'PRELUDE_VERIFY' : code,
        type,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      });
      await otp.save();

      const channelLabel = otpChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';
      const providerLabel = isGeorgian ? 'UBill' : 'Prelude';
      this.logger.log(`OTP sent via ${providerLabel} (${channelLabel}) to ${identifier}`);

      return {
        message: `Verification code sent via ${channelLabel}`,
        expiresIn: 300, // 5 minutes
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

    const sent = await this.emailService.sendOtp(identifier, code);
    if (!sent) {
      this.logger.warn(`Failed to send email OTP to ${identifier}, but OTP was created`);
    }

    return {
      message: 'Verification code sent to your email',
      expiresIn: 300, // 5 minutes
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const { identifier, code, type } = verifyOtpDto;

    // For phone verification
    if (type === OtpType.PHONE) {
      // First try Prelude verification for international numbers
      const smsResult = await this.smsService.verifyOtp(identifier, code);
      
      if (smsResult.provider === 'prelude' && smsResult.verified) {
        // Prelude verified the code
        await this.otpModel.updateMany(
          { identifier, type, isUsed: false },
          { isUsed: true },
        );
        return { verified: true };
      }

      // For UBill, dev mode, or Prelude not configured: verify with our stored OTP
      const otp = await this.otpModel.findOne({
        identifier,
        type,
        isUsed: false,
        expiresAt: { $gt: new Date() },
        code: { $ne: 'PRELUDE_VERIFY' }, // Only check non-Prelude records
      }).sort({ createdAt: -1 });

      if (otp && otp.code === code) {
        await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
        this.logger.log(`OTP verified locally for ${identifier}`);
        return { verified: true };
      }

      throw new BadRequestException('Invalid verification code');
    }

    // For email, use our stored OTP
    const otp = await this.otpModel.findOne({
      identifier,
      type,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otp) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Check max attempts
    if (otp.attempts >= 5) {
      await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
      throw new BadRequestException('Too many failed attempts. Please request a new code.');
    }

    if (otp.code !== code) {
      await this.otpModel.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      throw new BadRequestException('Invalid verification code');
    }

    // Mark OTP as used
    await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });

    return { verified: true };
  }

  // Cleanup expired OTPs (can be called by a cron job)
  async cleanupExpiredOtps(): Promise<void> {
    await this.otpModel.deleteMany({
      expiresAt: { $lt: new Date() },
    });
  }

  // Password reset methods (phone-based)
  async sendPasswordResetOtp(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string; expiresIn: number }> {
    const { phone } = forgotPasswordDto;

    // Check if user exists with this phone
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new NotFoundException('No account found with this phone number');
    }

    // Check rate limiting - max 3 password reset OTPs per phone in 10 minutes
    const recentOtps = await this.otpModel.countDocuments({
      identifier: phone,
      purpose: OtpPurpose.PASSWORD_RESET,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });

    if (recentOtps >= 3) {
      throw new BadRequestException('Too many password reset requests. Please try again later.');
    }

    // Invalidate any existing unused password reset OTPs for this phone
    await this.otpModel.updateMany(
      { identifier: phone, purpose: OtpPurpose.PASSWORD_RESET, isUsed: false },
      { isUsed: true },
    );

    const isGeorgian = this.isGeorgianNumber(phone);
    const code = isGeorgian ? this.generateOtp() : '';

    // Send OTP
    const result = await this.smsService.sendOtp(phone, code);
    if (!result.success) {
      throw new BadRequestException(result.error || 'Failed to send verification code. Please try again.');
    }

    // Track the request for rate limiting
    const otp = new this.otpModel({
      identifier: phone,
      code: result.provider === 'prelude' ? 'PRELUDE_VERIFY' : code,
      type: OtpType.PHONE,
      purpose: OtpPurpose.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });
    await otp.save();

    return {
      message: 'Verification code sent to your phone',
      expiresIn: 300, // 5 minutes
    };
  }

  async verifyPasswordResetOtp(verifyResetCodeDto: VerifyResetCodeDto): Promise<{ verified: boolean }> {
    const { phone, code } = verifyResetCodeDto;

    // Check if user exists with this phone
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new NotFoundException('No account found with this phone number');
    }

    // Try Prelude verification first for international numbers
    const smsResult = await this.smsService.verifyOtp(phone, code);
    
    if (smsResult.provider === 'prelude' && smsResult.verified) {
      // Prelude verified
      await this.otpModel.updateMany(
        { identifier: phone, purpose: OtpPurpose.PASSWORD_RESET, isUsed: false },
        { isUsed: true },
      );
    } else {
      // For UBill or dev mode: verify locally
      const otp = await this.otpModel.findOne({
        identifier: phone,
        purpose: OtpPurpose.PASSWORD_RESET,
        isUsed: false,
        expiresAt: { $gt: new Date() },
        code: { $ne: 'PRELUDE_VERIFY' },
      }).sort({ createdAt: -1 });

      if (!otp || otp.code !== code) {
        throw new BadRequestException('Invalid verification code');
      }

      await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
    }

    // Create a verified record that allows password reset within next 5 minutes
    const verifiedOtp = new this.otpModel({
      identifier: phone,
      code: 'VERIFIED',
      type: OtpType.PHONE,
      purpose: OtpPurpose.PASSWORD_RESET,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes to reset password
      isUsed: false,
    });
    await verifiedOtp.save();

    return { verified: true };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { phone, newPassword } = resetPasswordDto;

    // Check for verified OTP record
    const verifiedOtp = await this.otpModel.findOne({
      identifier: phone,
      purpose: OtpPurpose.PASSWORD_RESET,
      code: 'VERIFIED',
      isUsed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!verifiedOtp) {
      throw new BadRequestException('Password reset session expired. Please verify your phone again.');
    }

    // Find the user
    const user = await this.userModel.findOne({ phone });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate password strength
    if (newPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long');
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

    return { message: 'Password has been reset successfully' };
  }
}
