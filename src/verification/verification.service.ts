import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Otp, OtpType } from './schemas/otp.schema';
import { SendOtpDto, VerifyOtpDto } from './dto/send-otp.dto';

@Injectable()
export class VerificationService {
  constructor(
    @InjectModel(Otp.name) private otpModel: Model<Otp>,
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

    // In production, integrate with SMS/Email service
    // For now, we'll log the OTP (development only)
    if (type === OtpType.EMAIL) {
      console.log(`[DEV] Email OTP for ${identifier}: ${code}`);
      // TODO: Integrate with email service (SendGrid, AWS SES, etc.)
      // await this.emailService.sendOtp(identifier, code);
    } else if (type === OtpType.PHONE) {
      console.log(`[DEV] SMS OTP for ${identifier}: ${code}`);
      // TODO: Integrate with SMS service (Twilio, etc.)
      // await this.smsService.sendOtp(identifier, code);
    }

    return {
      message: type === OtpType.EMAIL
        ? 'Verification code sent to your email'
        : 'Verification code sent to your phone',
      expiresIn: 300, // 5 minutes in seconds
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ verified: boolean }> {
    const { identifier, code, type } = verifyOtpDto;

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
