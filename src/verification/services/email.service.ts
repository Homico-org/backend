import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupportedLocale } from '../../common/countries';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sgMail = require('@sendgrid/mail');

// Per-locale strings used to compose OTP and password-reset emails.
// All locales share the same visual template - we only swap the body
// copy and subject line. Adding a new locale means appending a column
// to this table and the corresponding type union in common/countries.
type OtpCopy = {
  subject: string;
  heading: string;
  subheading: string;
  expiresLine: string;
  ignoreLine: string;
};
type ResetCopy = OtpCopy & {
  greeting: (name: string) => string;
};

const OTP_COPY: Record<SupportedLocale, OtpCopy> = {
  en: {
    subject: 'Homico - Your Verification Code',
    heading: 'Verification Code',
    subheading: 'Use the code below to verify your email',
    expiresLine: 'This code expires in 5 minutes',
    ignoreLine: "If you didn't request this code, please ignore this email.",
  },
  ka: {
    subject: 'Homico - თქვენი დადასტურების კოდი',
    heading: 'დადასტურების კოდი',
    subheading: 'ელფოსტის დასადასტურებლად შეიყვანეთ ქვემოთ მითითებული კოდი',
    expiresLine: 'კოდი მოქმედებს 5 წუთის განმავლობაში',
    ignoreLine: 'თუ ეს კოდი არ მოგითხოვიათ, უგულებელყავით ეს წერილი.',
  },
  ru: {
    subject: 'Homico - Ваш код подтверждения',
    heading: 'Код подтверждения',
    subheading: 'Введите код ниже для подтверждения email',
    expiresLine: 'Код действителен в течение 5 минут',
    ignoreLine: 'Если вы не запрашивали этот код, проигнорируйте это письмо.',
  },
};

const RESET_COPY: Record<SupportedLocale, ResetCopy> = {
  en: {
    subject: 'Homico - Password Reset',
    heading: 'Password Reset',
    subheading: 'Use the code below to reset your password',
    greeting: (name) => `Hello ${name},`,
    expiresLine: 'This code expires in 5 minutes',
    ignoreLine: "If you didn't request a password reset, please ignore this email.",
  },
  ka: {
    subject: 'Homico - პაროლის აღდგენა',
    heading: 'პაროლის აღდგენა',
    subheading: 'პაროლის აღსადგენად შეიყვანეთ ქვემოთ მითითებული კოდი',
    greeting: (name) => `გამარჯობა ${name},`,
    expiresLine: 'კოდი მოქმედებს 5 წუთის განმავლობაში',
    ignoreLine: 'თუ პაროლის აღდგენა არ მოგითხოვიათ, უგულებელყავით ეს წერილი.',
  },
  ru: {
    subject: 'Homico - Сброс пароля',
    heading: 'Сброс пароля',
    subheading: 'Введите код ниже для сброса пароля',
    greeting: (name) => `Здравствуйте, ${name},`,
    expiresLine: 'Код действителен в течение 5 минут',
    ignoreLine: 'Если вы не запрашивали сброс пароля, проигнорируйте это письмо.',
  },
};

function normalizeLocale(input?: string | null): SupportedLocale {
  const v = (input || '').toLowerCase();
  if (v === 'ka' || v === 'ru') return v;
  return 'en';
}

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

  /**
   * Send a verification OTP email. The caller resolves the locale
   * (from the user's stored preference, the request DTO, or the
   * marketplace default) and passes it in. Falls back to English
   * for unknown locale codes.
   */
  async sendOtp(email: string, code: string, locale?: string): Promise<boolean> {
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@homico.ge';
    const appName = 'Homico';
    const loc = normalizeLocale(locale);
    const copy = OTP_COPY[loc];

    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Email OTP for ${email} (${loc}): ${code}`);
      return true;
    }

    try {
      const msg = {
        to: email,
        from: { email: fromEmail, name: appName },
        subject: copy.subject,
        text: `${copy.heading}: ${code}\n\n${copy.expiresLine}.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">${appName}</h1>
            </div>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 30px; text-align: center;">
              <h2 style="color: #1e293b; margin-bottom: 10px;">${copy.heading}</h2>
              <p style="color: #64748b; margin-bottom: 20px;">${copy.subheading}</p>

              <div style="background-color: #2563eb; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 40px; border-radius: 8px; display: inline-block;">
                ${code}
              </div>

              <p style="color: #64748b; margin-top: 20px; font-size: 14px;">
                ${copy.expiresLine}
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
              <p>${copy.ignoreLine}</p>
            </div>
          </div>
        `,
      };

      await sgMail.send(msg);
      this.logger.log(`OTP email sent successfully to ${email} (${loc})`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      // In production, you might want to throw an error
      // For now, log and return false
      return false;
    }
  }

  /**
   * Email-based password reset. Currently unused (the live password
   * reset flow is phone-based via SMS), but kept here so a future
   * "Forgot password? send email instead" surface can drop in
   * without rewriting the template.
   */
  async sendPasswordResetOtp(
    email: string,
    code: string,
    userName: string,
    locale?: string,
  ): Promise<boolean> {
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@homico.ge';
    const appName = 'Homico';
    const loc = normalizeLocale(locale);
    const copy = RESET_COPY[loc];

    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Password Reset OTP for ${email} (${loc}): ${code}`);
      return true;
    }

    this.logger.log(`Attempting to send password reset email to ${email} from ${fromEmail}`);

    try {
      const msg = {
        to: email,
        from: { email: fromEmail, name: appName },
        subject: copy.subject,
        text: `${copy.greeting(userName)}\n\n${copy.heading}: ${code}\n\n${copy.expiresLine}.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #004B3B; margin: 0;">${appName}</h1>
            </div>

            <div style="background-color: #f8fafc; border-radius: 12px; padding: 30px; text-align: center;">
              <h2 style="color: #1e293b; margin-bottom: 10px;">${copy.heading}</h2>
              <p style="color: #64748b; margin-bottom: 5px;">${copy.subheading}</p>

              <p style="color: #475569; margin-bottom: 20px;">
                ${copy.greeting(userName)}
              </p>

              <div style="background-color: #004B3B; color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px 40px; border-radius: 8px; display: inline-block;">
                ${code}
              </div>

              <p style="color: #64748b; margin-top: 20px; font-size: 14px;">
                ${copy.expiresLine}
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
              <p>${copy.ignoreLine}</p>
            </div>
          </div>
        `,
      };

      await sgMail.send(msg);
      this.logger.log(`Password reset email sent successfully to ${email} (${loc})`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error?.response?.body || error?.message || error);
      return false;
    }
  }
}
