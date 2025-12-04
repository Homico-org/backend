import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Otp, OtpType } from './schemas/otp.schema';
import { SendOtpDto, VerifyOtpDto } from './dto/send-otp.dto';
import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    @InjectModel(Otp.name) private otpModel: Model<Otp>,
    private emailService: EmailService,
    private smsService: SmsService,
  ) {}

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string; expiresIn: number }> {
    const { identifier, type } = sendOtpDto;

    // Check rate limiting - max 3 OTPs per identifier in 10 minutes
    const recentOtps = await this.otpModel.countDocuments({
      identifier,
      type,
      createdAt: { $gte: new Date(Date.now() - 10 * 60 * 1000) },
    });

    if (recentOtps >= 3) {
      throw new BadRequestException('Too many OTP requests. Please try again later.');
    }

    // For phone verification with Twilio Verify, let Twilio handle the OTP
    if (type === OtpType.PHONE) {
      const sent = await this.smsService.sendOtp(identifier, '');
      if (!sent) {
        throw new BadRequestException('Failed to send verification code. Please try again.');
      }

      // Still track the request for rate limiting
      const otp = new this.otpModel({
        identifier,
        code: 'TWILIO_VERIFY', // Placeholder - actual code is managed by Twilio
        type,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes for Twilio
      });
      await otp.save();

      return {
        message: 'Verification code sent to your phone',
        expiresIn: 600, // 10 minutes for Twilio Verify
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
      expiresIn: 300, // 5 minutes in seconds
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const { identifier, code, type } = verifyOtpDto;

    // For phone verification, use Twilio Verify
    if (type === OtpType.PHONE) {
      const verified = await this.smsService.verifyOtp(identifier, code);
      if (verified) {
        // Mark our tracking record as used
        await this.otpModel.updateMany(
          { identifier, type, isUsed: false },
          { isUsed: true },
        );
        return { verified: true };
      }

      // If Twilio is not configured, fall back to our stored OTP
      const otp = await this.otpModel.findOne({
        identifier,
        type,
        isUsed: false,
        expiresAt: { $gt: new Date() },
        code: { $ne: 'TWILIO_VERIFY' }, // Only check non-Twilio records
      }).sort({ createdAt: -1 });

      if (otp && otp.code === code) {
        await this.otpModel.updateOne({ _id: otp._id }, { isUsed: true });
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
}
