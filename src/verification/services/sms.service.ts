import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OtpChannelType = 'sms' | 'whatsapp';
export type SmsProvider = 'ubill' | 'prelude' | 'none';

export interface SendOtpResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  provider?: SmsProvider;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly ubillApiKey: string;
  private readonly preludeApiKey: string;
  private readonly ubillBaseUrl = 'https://api.ubill.ge/v1';
  private readonly preludeBaseUrl = 'https://api.prelude.dev/v2';

  constructor(private configService: ConfigService) {
    this.ubillApiKey = this.configService.get<string>('UBILL_API_KEY') || '';
    this.preludeApiKey = this.configService.get<string>('PRELUDE_API_KEY') || '';

    if (this.ubillApiKey) {
      this.logger.log('UBill.ge SMS service configured (for Georgian +995 numbers)');
    }
    if (this.preludeApiKey) {
      this.logger.log('Prelude Verify service configured (for international numbers)');
    }
    if (!this.ubillApiKey && !this.preludeApiKey) {
      this.logger.warn('No SMS provider configured - OTPs will be logged only');
    }
  }

  /**
   * Determines which provider to use based on phone number
   * - Georgian numbers (+995) → UBill
   * - All other numbers → Prelude
   */
  private getProviderForNumber(phoneNumber: string): SmsProvider {
    const isGeorgianNumber = phoneNumber.startsWith('+995') || phoneNumber.startsWith('995');

    if (isGeorgianNumber && this.ubillApiKey) {
      return 'ubill';
    } else if (!isGeorgianNumber && this.preludeApiKey) {
      return 'prelude';
    } else if (this.ubillApiKey) {
      // Fallback: UBill for all if only UBill is configured
      return 'ubill';
    } else if (this.preludeApiKey) {
      // Fallback: Prelude for all if only Prelude is configured
      return 'prelude';
    }
    return 'none';
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

  async sendOtp(phoneNumber: string, code: string, channel: OtpChannelType = 'sms'): Promise<SendOtpResult> {
    // Format the phone number (ensure it has + prefix)
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const provider = this.getProviderForNumber(formattedNumber);

    if (provider === 'none') {
      this.logger.log(`[DEV MODE] ${channel.toUpperCase()} OTP for ${formattedNumber}: ${code}`);
      return { success: true, provider: 'none' };
    }

    this.logger.log(`Routing ${formattedNumber} to ${provider.toUpperCase()} provider`);

    if (provider === 'ubill') {
      const result = await this.sendOtpViaUbill(formattedNumber, code, channel);
      return { ...result, provider: 'ubill' };
    } else {
      const result = await this.sendOtpViaPrelude(formattedNumber, channel);
      return { ...result, provider: 'prelude' };
    }
  }

  // UBill.ge SMS Provider (for Georgian +995 numbers)
  private async sendOtpViaUbill(phoneNumber: string, code: string, channel: OtpChannelType): Promise<SendOtpResult> {
    try {
      this.logger.log(`Sending OTP via UBill ${channel} to ${phoneNumber}`);

      // UBill SMS API
      const response = await fetch(`${this.ubillBaseUrl}/sms/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.ubillApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phoneNumber,
          message: `Your Homico verification code is: ${code}`,
          // For WhatsApp, UBill might use different endpoint or parameter
          ...(channel === 'whatsapp' && { channel: 'whatsapp' }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(`UBill: Failed to send OTP to ${phoneNumber}: ${response.status} - ${JSON.stringify(errorData)}`);
        return {
          success: false,
          error: this.getErrorMessage(errorData.code || errorData.error_code, errorData.message || errorData.error),
          errorCode: errorData.code || errorData.error_code,
        };
      }

      const data = await response.json();
      this.logger.log(`UBill: OTP sent successfully to ${phoneNumber}, message_id: ${data.id || data.message_id}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`UBill: Failed to send OTP to ${phoneNumber}: ${error?.message || error}`);
      return {
        success: false,
        error: 'Failed to send verification code. Please try again.',
      };
    }
  }

  // Prelude Verify API Provider (for international numbers)
  private async sendOtpViaPrelude(phoneNumber: string, channel: OtpChannelType): Promise<SendOtpResult> {
    try {
      const requestBody: {
        target: { type: string; value: string };
        dispatch?: { type: string };
      } = {
        target: {
          type: 'phone_number',
          value: phoneNumber,
        },
      };

      if (channel === 'whatsapp') {
        requestBody.dispatch = { type: 'whatsapp' };
      }

      this.logger.log(`Sending OTP via Prelude ${channel} to ${phoneNumber}`);

      const response = await fetch(`${this.preludeBaseUrl}/verification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.preludeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(`Prelude: Failed to send OTP to ${phoneNumber}: ${response.status} - ${JSON.stringify(errorData)}`);
        return {
          success: false,
          error: this.getErrorMessage(errorData.code, errorData.message),
          errorCode: errorData.code,
        };
      }

      const data = await response.json();
      this.logger.log(`Prelude: OTP sent successfully to ${phoneNumber}, verification_id: ${data.id}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Prelude: Failed to send OTP to ${phoneNumber}: ${error?.message || error}`);
      return {
        success: false,
        error: 'Failed to send verification code. Please try again.',
      };
    }
  }

  /**
   * Verify OTP - returns which provider was used
   * - UBill: Returns false (we verify locally with stored OTP)
   * - Prelude: Verifies via their API
   */
  async verifyOtp(phoneNumber: string, code: string): Promise<{ verified: boolean; provider: SmsProvider }> {
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const provider = this.getProviderForNumber(formattedNumber);

    if (provider === 'none') {
      // In dev mode, let the verification service handle it with stored OTP
      return { verified: false, provider: 'none' };
    }

    // UBill doesn't have server-side OTP verification - we verify locally
    // The OTP is stored in our database and verified by verification.service.ts
    if (provider === 'ubill') {
      // Return false to let verification service handle it with stored OTP
      return { verified: false, provider: 'ubill' };
    }

    // Prelude has server-side verification
    const verified = await this.verifyOtpViaPrelude(formattedNumber, code);
    return { verified, provider: 'prelude' };
  }

  private async verifyOtpViaPrelude(phoneNumber: string, code: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.preludeBaseUrl}/verification/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.preludeApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: {
            type: 'phone_number',
            value: phoneNumber,
          },
          code: code,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        this.logger.error(`Prelude: Failed to verify OTP for ${phoneNumber}: ${response.status} - ${JSON.stringify(errorData)}`);
        return false;
      }

      const data = await response.json();

      if (data.status === 'success') {
        this.logger.log(`Prelude: OTP verified successfully for ${phoneNumber}`);
        return true;
      } else {
        this.logger.warn(`Prelude: OTP verification failed for ${phoneNumber}: ${data.status}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Prelude: Failed to verify OTP for ${phoneNumber}: ${error?.message || error}`);
      return false;
    }
  }
}
