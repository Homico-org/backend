import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OtpChannelType = 'sms' | 'whatsapp';

export interface SendOtpResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly apiKey: string;
  private readonly isConfigured: boolean;
  private readonly baseUrl = 'https://api.prelude.dev/v2';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('PRELUDE_API_KEY') || '';

    if (this.apiKey) {
      this.isConfigured = true;
      this.logger.log('Prelude Verify service configured');
    } else {
      this.isConfigured = false;
      this.logger.warn('Prelude API key not configured - SMS will be logged only');
    }
  }

  private getErrorMessage(errorCode: string, errorMessage: string): string {
    switch (errorCode) {
      case 'region_blocked_by_customer':
        return 'SMS verification is not available for this region. Please contact support.';
      case 'insufficient_balance':
        return 'SMS service temporarily unavailable. Please try again later.';
      case 'invalid_phone_number':
        return 'Invalid phone number format. Please check and try again.';
      case 'rate_limited':
        return 'Too many requests. Please wait a moment and try again.';
      default:
        return errorMessage || 'Failed to send verification code. Please try again.';
    }
  }

  async sendOtp(phoneNumber: string, _code: string, _channel: OtpChannelType = 'sms'): Promise<SendOtpResult> {
    // Format the phone number (ensure it has + prefix)
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] SMS OTP for ${formattedNumber}: (code managed by Prelude in production)`);
      return { success: true };
    }

    try {
      // Use Prelude Verify API to send OTP
      const response = await fetch(`${this.baseUrl}/verification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: {
            type: 'phone_number',
            value: formattedNumber,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(`Failed to send OTP to ${formattedNumber}: ${response.status} - ${JSON.stringify(errorData)}`);
        return {
          success: false,
          error: this.getErrorMessage(errorData.code, errorData.message),
          errorCode: errorData.code,
        };
      }

      const data = await response.json();
      this.logger.log(`OTP sent successfully to ${formattedNumber}, verification_id: ${data.id}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send OTP to ${formattedNumber}: ${error?.message || error}`);
      return {
        success: false,
        error: 'Failed to send verification code. Please try again.',
      };
    }
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    if (!this.isConfigured) {
      // In dev mode, let the verification service handle it with stored OTP
      return false;
    }

    try {
      // Use Prelude Verify API to validate OTP
      const response = await fetch(`${this.baseUrl}/verification/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: {
            type: 'phone_number',
            value: formattedNumber,
          },
          code: code,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(`Failed to verify OTP for ${formattedNumber}: ${response.status} - ${JSON.stringify(errorData)}`);
        return false;
      }

      const data = await response.json();

      if (data.status === 'success') {
        this.logger.log(`OTP verified successfully for ${formattedNumber}`);
        return true;
      } else {
        this.logger.warn(`OTP verification failed for ${formattedNumber}: ${data.status}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Failed to verify OTP for ${formattedNumber}: ${error?.message || error}`);
      return false;
    }
  }
}
