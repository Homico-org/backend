import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sgMail = require('@sendgrid/mail');

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    if (apiKey) {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
      this.logger.log('SendGrid email service configured');
    } else {
      this.isConfigured = false;
      this.logger.warn('SendGrid API key not configured - emails will be logged only');
    }
  }

  async sendOtp(email: string, code: string): Promise<boolean> {
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@homico.ge';
    const appName = 'Homico';

    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Email OTP for ${email}: ${code}`);
      return true;
    }

    try {
      const msg = {
        to: email,
        from: {
          email: fromEmail,
          name: appName,
        },
        subject: `${appName} - თქვენი დადასტურების კოდი / Your Verification Code`,
        text: `თქვენი დადასტურების კოდია: ${code}\n\nYour verification code is: ${code}\n\nკოდი მოქმედებს 5 წუთის განმავლობაში.\nThis code expires in 5 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">${appName}</h1>
            </div>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 30px; text-align: center;">
              <h2 style="color: #1e293b; margin-bottom: 10px;">დადასტურების კოდი</h2>
              <p style="color: #64748b; margin-bottom: 20px;">Verification Code</p>

              <div style="background-color: #2563eb; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 40px; border-radius: 8px; display: inline-block;">
                ${code}
              </div>

              <p style="color: #64748b; margin-top: 20px; font-size: 14px;">
                კოდი მოქმედებს 5 წუთის განმავლობაში<br/>
                This code expires in 5 minutes
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
              <p>თუ თქვენ არ მოითხოვეთ ეს კოდი, გთხოვთ უგულებელყოთ ეს წერილი.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
          </div>
        `,
      };

      await sgMail.send(msg);
      this.logger.log(`OTP email sent successfully to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      // In production, you might want to throw an error
      // For now, log and return false
      return false;
    }
  }

  async sendPasswordResetOtp(email: string, code: string, userName: string): Promise<boolean> {
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@homico.ge';
    const appName = 'Homico';

    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Password Reset OTP for ${email}: ${code}`);
      return true;
    }

    this.logger.log(`Attempting to send password reset email to ${email} from ${fromEmail}`);

    try {
      const msg = {
        to: email,
        from: {
          email: fromEmail,
          name: appName,
        },
        subject: `${appName} - პაროლის აღდგენა / Password Reset`,
        text: `გამარჯობა ${userName},\n\nთქვენი პაროლის აღდგენის კოდია: ${code}\n\nHello ${userName},\n\nYour password reset code is: ${code}\n\nკოდი მოქმედებს 5 წუთის განმავლობაში.\nThis code expires in 5 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #004B3B; margin: 0;">${appName}</h1>
            </div>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 30px; text-align: center;">
              <h2 style="color: #1e293b; margin-bottom: 10px;">პაროლის აღდგენა</h2>
              <p style="color: #64748b; margin-bottom: 5px;">Password Reset</p>

              <p style="color: #475569; margin-bottom: 20px;">
                გამარჯობა ${userName},<br/>
                Hello ${userName},
              </p>

              <div style="background-color: #004B3B; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 40px; border-radius: 8px; display: inline-block;">
                ${code}
              </div>

              <p style="color: #64748b; margin-top: 20px; font-size: 14px;">
                კოდი მოქმედებს 5 წუთის განმავლობაში<br/>
                This code expires in 5 minutes
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
              <p>თუ თქვენ არ მოითხოვეთ პაროლის აღდგენა, გთხოვთ უგულებელყოთ ეს წერილი.</p>
              <p>If you didn't request a password reset, please ignore this email.</p>
            </div>
          </div>
        `,
      };

      await sgMail.send(msg);
      this.logger.log(`Password reset email sent successfully to ${email}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error?.response?.body || error?.message || error);
      return false;
    }
  }
}
