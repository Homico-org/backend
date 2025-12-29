import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio';

export type OtpChannelType = 'sms' | 'whatsapp';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: twilio.Twilio | null;
  private readonly verifySid: string;
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.verifySid = this.configService.get<string>('TWILIO_VERIFY_SID') || '';

    if (accountSid && authToken && this.verifySid) {
      this.client = twilio.default(accountSid, authToken);
      this.isConfigured = true;
      this.logger.log('Twilio Verify service configured');
    } else {
      this.client = null;
      this.isConfigured = false;
      this.logger.warn('Twilio credentials not configured - SMS will be logged only');
    }
  }

  async sendOtp(phoneNumber: string, code: string, channel: OtpChannelType = 'sms'): Promise<boolean> {
    if (!this.isConfigured || !this.client) {
      this.logger.log(`[DEV MODE] ${channel.toUpperCase()} OTP for ${phoneNumber}: ${code}`);
      return true;
    }

    try {
      // Format the phone number if needed (ensure it has + prefix)
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      // Use Twilio Verify to send the OTP via SMS or WhatsApp
      const verification = await this.client.verify.v2
        .services(this.verifySid)
        .verifications.create({
          to: formattedNumber,
          channel: channel, // 'sms' or 'whatsapp'
        });

      this.logger.log(`OTP ${channel.toUpperCase()} sent successfully to ${phoneNumber}, Status: ${verification.status}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send OTP ${channel.toUpperCase()} to ${phoneNumber}: ${error?.message || error}`);
      if (error?.code) {
        this.logger.error(`Twilio error code: ${error.code}, status: ${error.status}, moreInfo: ${error.moreInfo}`);
      }
      return false;
    }
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
    if (!this.isConfigured || !this.client) {
      // In dev mode, we'll let the verification service handle this with stored OTP
      return false;
    }

    try {
      const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

      const verificationCheck = await this.client.verify.v2
        .services(this.verifySid)
        .verificationChecks.create({
          to: formattedNumber,
          code: code,
        });

      return verificationCheck.status === 'approved';
    } catch (error: any) {
      this.logger.error(`Failed to verify OTP for ${phoneNumber}:`, error?.message || error);
      return false;
    }
  }
}
