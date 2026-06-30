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
  private readonly ubillBrandId: number;
  private readonly preludeApiKey: string;
  private readonly ubillBaseUrl = 'https://api.ubill.dev/v1';
  private readonly preludeBaseUrl = 'https://api.prelude.dev/v2';

  constructor(private configService: ConfigService) {
    this.ubillApiKey = this.configService.get<string>('UBILL_API_KEY') || '';
    this.ubillBrandId = parseInt(this.configService.get<string>('UBILL_BRAND_ID') || '0', 10);
    this.preludeApiKey = this.configService.get<string>('PRELUDE_API_KEY') || '';

    if (this.ubillApiKey && this.ubillBrandId) {
      this.logger.log(`UBill SMS service configured (brandID: ${this.ubillBrandId}) for Georgian +995 numbers`);
    }
    if (this.preludeApiKey) {
      this.logger.log('Prelude Verify service configured (for international numbers)');
    }
    if (!this.ubillApiKey && !this.preludeApiKey) {
      this.logger.warn('No SMS provider configured - OTPs will be logged only');
    }
  }

  /**
   * Determines which provider to use based on phone number AND channel.
   *
   * Routing rules:
   *   - Channel = 'whatsapp' → ALWAYS Prelude (UBill SMS-only - their
   *     /v1/sms/send endpoint has no WhatsApp dispatch field, so the
   *     previous "channel" arg was silently ignored and the user got
   *     a regular SMS or, more often, nothing because the request was
   *     identical to SMS but the user expected WhatsApp).
   *   - Channel = 'sms' on Georgian (+995) → UBill
   *   - Channel = 'sms' on other countries → Prelude
   *   - Either provider missing → fall through to whichever IS configured
   */
  private getProviderForNumber(
    phoneNumber: string,
    channel: OtpChannelType = 'sms',
  ): SmsProvider {
    const isGeorgianNumber = phoneNumber.startsWith('+995') || phoneNumber.startsWith('995');

    // WhatsApp goes through Prelude regardless of country - UBill does
    // not support WhatsApp on the integrated endpoint.
    if (channel === 'whatsapp') {
      if (this.preludeApiKey) return 'prelude';
      // If only UBill is configured we fall through to SMS via UBill.
      // The caller logs a warning so the channel-mismatch is visible.
      if (this.ubillApiKey && this.ubillBrandId) return 'ubill';
      return 'none';
    }

    if (isGeorgianNumber && this.ubillApiKey && this.ubillBrandId) {
      return 'ubill';
    } else if (!isGeorgianNumber && this.preludeApiKey) {
      return 'prelude';
    } else if (this.ubillApiKey && this.ubillBrandId) {
      // Fallback: UBill for all if only UBill is configured
      return 'ubill';
    } else if (this.preludeApiKey) {
      // Fallback: Prelude for all if only Prelude is configured
      return 'prelude';
    }
    return 'none';
  }

  /**
   * Strips phone number to just digits (no + or 00 prefix)
   * UBill requires: 995XXXXXXXXX format
   */
  private formatPhoneForUbill(phoneNumber: string): number {
    // Remove + and any leading zeros
    let cleaned = phoneNumber.replace(/^\+/, '').replace(/^00/, '');
    return parseInt(cleaned, 10);
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
    const provider = this.getProviderForNumber(formattedNumber, channel);

    if (provider === 'none') {
      this.logger.log(`[DEV MODE] ${channel.toUpperCase()} OTP for ${formattedNumber}: ${code}`);
      return { success: true, provider: 'none' };
    }

    // Surface the channel/provider mismatch when WhatsApp was requested
    // but only UBill is available - the user will receive an SMS not a
    // WhatsApp message. Keep the call going so they at least get the
    // code somewhere, but log it so we can spot the misconfiguration.
    if (channel === 'whatsapp' && provider === 'ubill') {
      this.logger.warn(
        `WhatsApp requested for ${formattedNumber} but only UBill is configured - falling back to SMS`,
      );
    }

    this.logger.log(
      `Routing ${formattedNumber} via ${channel} to ${provider.toUpperCase()} provider`,
    );

    if (provider === 'ubill') {
      const result = await this.sendOtpViaUbill(formattedNumber, code, channel);
      return { ...result, provider: 'ubill' };
    } else {
      const result = await this.sendOtpViaPrelude(formattedNumber, channel);
      return { ...result, provider: 'prelude' };
    }
  }

  // UBill SMS Provider (for Georgian +995 numbers)
  // API Docs: https://ubill.ge
  private async sendOtpViaUbill(phoneNumber: string, code: string, channel: OtpChannelType): Promise<SendOtpResult> {
    try {
      const ubillNumber = this.formatPhoneForUbill(phoneNumber);
      this.logger.log(`Sending OTP via UBill ${channel} to ${ubillNumber} (original: ${phoneNumber})`);

      const requestBody = {
        brandID: this.ubillBrandId,
        numbers: [ubillNumber],
        text: `თქვენი Homico დამადასტურებელი კოდია: ${code}`,
        stopList: false,
      };

      this.logger.debug(`UBill request: ${JSON.stringify(requestBody)}`);

      const response = await fetch(`${this.ubillBaseUrl}/sms/send`, {
        method: 'POST',
        headers: {
          'key': this.ubillApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      this.logger.debug(`UBill response status: ${response.status}, body: ${responseText}`);

      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok) {
        this.logger.error(`UBill: Failed to send OTP to ${phoneNumber}: ${response.status} - ${responseText}`);
        return {
          success: false,
          error: this.getErrorMessage(data.code || data.error_code, data.message || data.error || responseText),
          errorCode: data.code || data.error_code,
        };
      }

      // HTTP 200 does NOT guarantee the SMS was actually accepted. UBill can
      // answer 200 while the body carries an application-level failure
      // (invalid brandID, insufficient balance, blocked region, bad number).
      // If we trust response.ok alone we store the OTP and the user never gets
      // it, then hits "invalid code" at verify time. So inspect the body and
      // surface real failures as success:false.
      //
      // Field conventions are the same ones the !response.ok branch and
      // getErrorMessage already rely on:
      //   - error code  -> data.code | data.error_code
      //   - error text  -> data.message | data.error
      // and the documented success shape exposes a numeric status code
      // (data.status, 200-range = OK). We stay CONSERVATIVE: only treat the
      // response as a failure on UNAMBIGUOUS failure signals, otherwise fall
      // back to the old "ok => sent" behaviour so a genuine send is never
      // blocked by an unexpected body shape.
      const appErrorCode = data.code || data.error_code;
      const appStatus = data.status ?? data.statusCode;
      const hasExplicitSuccessFlag =
        data.success === false || data.error === true;
      // A numeric status outside the 2xx range is an application error.
      const hasFailingStatus =
        typeof appStatus === 'number' && (appStatus < 200 || appStatus >= 300);
      // An error code string that is not a neutral "ok"/"success"/"0" marker.
      const hasFailingCode =
        typeof appErrorCode === 'string' &&
        appErrorCode.length > 0 &&
        !['ok', 'success', '0', '200'].includes(appErrorCode.toLowerCase());

      if (hasExplicitSuccessFlag || hasFailingStatus || hasFailingCode) {
        this.logger.error(
          `UBill: HTTP 200 but application-level failure for ${phoneNumber}: ${responseText}`,
        );
        return {
          success: false,
          error: this.getErrorMessage(
            appErrorCode,
            data.message || data.error || responseText,
          ),
          errorCode: typeof appErrorCode === 'string' ? appErrorCode : undefined,
        };
      }

      this.logger.log(`UBill: OTP sent successfully to ${phoneNumber}, response: ${JSON.stringify(data)}`);
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
   *
   * Channel must match what was used in `sendOtp` so we hit the same
   * provider here. A WhatsApp OTP sent via Prelude needs to be checked
   * against Prelude even on a Georgian number that would otherwise
   * route SMS through UBill.
   */
  async verifyOtp(
    phoneNumber: string,
    code: string,
    channel: OtpChannelType = 'sms',
  ): Promise<{ verified: boolean; provider: SmsProvider }> {
    const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
    const provider = this.getProviderForNumber(formattedNumber, channel);

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

  /**
   * Send a notification SMS (non-OTP) to a phone number
   * Currently only supports UBill (Georgian numbers)
   */
  async sendNotificationSms(phoneNumber: string, message: string): Promise<{ success: boolean; error?: string }> {
    // Normalize Georgian local numbers (5XXXXXXXX or 05XXXXXXXX) to +995 format
    let normalized = phoneNumber.replace(/\s+/g, '').replace(/^0+/, '');
    if (/^5\d{8}$/.test(normalized)) {
      normalized = `+995${normalized}`;
    } else if (!normalized.startsWith('+')) {
      normalized = `+${normalized}`;
    }
    const formattedNumber = normalized;
    const provider = this.getProviderForNumber(formattedNumber);

    if (provider === 'none' || provider === 'prelude') {
      // Prelude only supports OTP, log notification instead
      this.logger.log(`[DEV MODE] Notification SMS to ${formattedNumber}: ${message}`);
      return { success: true };
    }

    try {
      const ubillNumber = this.formatPhoneForUbill(formattedNumber);
      this.logger.log(`Sending notification SMS via UBill to ${ubillNumber}`);

      const requestBody = {
        brandID: this.ubillBrandId,
        numbers: [ubillNumber],
        text: message,
        stopList: false,
      };

      const response = await fetch(`${this.ubillBaseUrl}/sms/send`, {
        method: 'POST',
        headers: {
          'key': this.ubillApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      this.logger.debug(`UBill notification response: ${response.status}, body: ${responseText}`);

      if (!response.ok) {
        this.logger.error(`UBill notification failed: ${response.status} - ${responseText}`);
        return { success: false, error: 'Failed to send notification SMS' };
      }

      this.logger.log(`Notification SMS sent successfully to ${formattedNumber}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send notification SMS to ${formattedNumber}: ${error?.message || error}`);
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }
}
