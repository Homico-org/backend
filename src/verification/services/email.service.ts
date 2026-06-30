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

// Copy for the profile-change moderation decision emails. One block per
// outcome (approved / rejected); the rejected block also labels the reason.
type ProfileChangeCopy = {
  subject: string;
  heading: string;
  body: string;
  reasonLabel: string;
};
const PROFILE_CHANGE_COPY: Record<
  SupportedLocale,
  { approved: ProfileChangeCopy; rejected: ProfileChangeCopy }
> = {
  en: {
    approved: {
      subject: 'Homico - Your profile changes were approved',
      heading: 'Profile changes approved',
      body: 'The changes you requested to your profile have been approved and are now live.',
      reasonLabel: 'Note',
    },
    rejected: {
      subject: 'Homico - Your profile changes were not approved',
      heading: 'Profile changes not approved',
      body: 'The changes you requested to your profile were not approved. Please review and submit again.',
      reasonLabel: 'Reason',
    },
  },
  ka: {
    approved: {
      subject: 'Homico - თქვენი პროფილის ცვლილებები დამტკიცდა',
      heading: 'პროფილის ცვლილებები დამტკიცდა',
      body: 'თქვენ მიერ მოთხოვნილი ცვლილებები დამტკიცდა და უკვე აქტიურია.',
      reasonLabel: 'შენიშვნა',
    },
    rejected: {
      subject: 'Homico - თქვენი პროფილის ცვლილებები არ დამტკიცდა',
      heading: 'პროფილის ცვლილებები არ დამტკიცდა',
      body: 'თქვენ მიერ მოთხოვნილი ცვლილებები არ დამტკიცდა. გთხოვთ გადახედოთ და ხელახლა გააგზავნოთ.',
      reasonLabel: 'მიზეზი',
    },
  },
  ru: {
    approved: {
      subject: 'Homico - Изменения вашего профиля одобрены',
      heading: 'Изменения профиля одобрены',
      body: 'Запрошенные вами изменения профиля одобрены и теперь активны.',
      reasonLabel: 'Примечание',
    },
    rejected: {
      subject: 'Homico - Изменения вашего профиля не одобрены',
      heading: 'Изменения профиля не одобрены',
      body: 'Запрошенные вами изменения профиля не одобрены. Пожалуйста, проверьте и отправьте снова.',
      reasonLabel: 'Причина',
    },
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

  /**
   * Order confirmation after a product order is paid. `order` is a lean/doc
   * with orderNumber, items, totalMinor (tetri), deliveryAddress.
   */
  async sendOrderConfirmation(email: string, order: any): Promise<boolean> {
    const total = ((order.totalMinor || 0) / 100).toLocaleString();
    const subject = `Homico - order ${order.orderNumber} confirmed`;
    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Order confirmation for ${email}: ${order.orderNumber} total ${total} GEL`);
      return true;
    }
    return this.sendOrderEmail(email, subject, `
      <h2 style="color:#1e293b;">Order ${order.orderNumber} confirmed</h2>
      <p style="color:#64748b;">Thank you - we've received your payment of <strong>${total} ₾</strong> and started processing your order. We'll keep you posted as it ships.</p>
      ${this.itemsHtml(order)}
    `);
  }

  /** Notify the customer when an order's fulfilment status changes. */
  async sendOrderStatusUpdate(email: string, order: any, status: string): Promise<boolean> {
    const subject = `Homico - order ${order.orderNumber} ${status}`;
    if (!this.isConfigured) {
      this.logger.log(`[DEV MODE] Order ${order.orderNumber} status -> ${status} for ${email}`);
      return true;
    }
    return this.sendOrderEmail(email, subject, `
      <h2 style="color:#1e293b;">Order ${order.orderNumber}: ${status}</h2>
      <p style="color:#64748b;">Your order status is now <strong>${status}</strong>.</p>
      ${this.itemsHtml(order)}
    `);
  }

  /**
   * Notify a pro that an admin reviewed their requested profile changes.
   * `approved=false` includes the rejection reason so they know what to fix.
   * Localized to the pro's stored locale (en/ka/ru), English fallback.
   */
  async sendProfileChangeDecision(
    email: string,
    approved: boolean,
    locale?: string,
    reason?: string,
  ): Promise<boolean> {
    const fromEmail =
      this.configService.get<string>('SENDGRID_FROM_EMAIL') ||
      'noreply@homico.ge';
    const appName = 'Homico';
    const loc = normalizeLocale(locale);
    const copy = PROFILE_CHANGE_COPY[loc][approved ? 'approved' : 'rejected'];
    const accent = approved ? '#16A34A' : '#EF4E24';

    if (!this.isConfigured) {
      this.logger.log(
        `[DEV MODE] Profile-change ${approved ? 'approved' : 'rejected'} email for ${email} (${loc})${reason ? ` reason: ${reason}` : ''}`,
      );
      return true;
    }

    const reasonBlock =
      !approved && reason
        ? `<p style="color:#475569;margin-top:16px;"><strong>${copy.reasonLabel}:</strong> ${reason}</p>`
        : '';

    try {
      await sgMail.send({
        to: email,
        from: { email: fromEmail, name: appName },
        subject: copy.subject,
        text: `${copy.heading}\n\n${copy.body}${!approved && reason ? `\n\n${copy.reasonLabel}: ${reason}` : ''}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="text-align:center;margin-bottom:24px;"><h1 style="color:${accent};margin:0;">${appName}</h1></div>
            <div style="background-color:#f8fafc;border-radius:12px;padding:24px;">
              <h2 style="color:#1e293b;margin-bottom:10px;">${copy.heading}</h2>
              <p style="color:#64748b;">${copy.body}</p>
              ${reasonBlock}
            </div>
          </div>`,
      });
      this.logger.log(
        `Profile-change decision email sent to ${email} (${loc}, approved=${approved})`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `Failed to send profile-change email to ${email}:`,
        error?.response?.body || error?.message || error,
      );
      return false;
    }
  }

  private itemsHtml(order: any): string {
    const rows = (order.items || [])
      .map(
        (i: any) =>
          `<tr><td style="padding:6px 0;color:#334155;">${i.qty} x ${i.name}</td><td style="padding:6px 0;text-align:right;color:#334155;">${(((i.lineTotalMinor || 0) / 100)).toLocaleString()} ₾</td></tr>`,
      )
      .join('');
    return `<table style="width:100%;border-collapse:collapse;margin-top:16px;">${rows}</table>`;
  }

  /** Confirmation sent to a pro right after their premium charge clears. */
  async sendPremiumPurchaseConfirmation(
    email: string,
    info: { tierLabel: string; amountGel: number },
  ): Promise<boolean> {
    const subject = `Your Homico ${info.tierLabel} plan is active`;
    return this.sendOrderEmail(
      email,
      subject,
      `<h2 style="color:#0f172a;margin-top:0;">Premium activated 🎉</h2>
       <p style="color:#334155;">Your <strong>${info.tierLabel}</strong> plan is now active. Thank you for upgrading!</p>
       <p style="color:#334155;">Amount paid: <strong>${info.amountGel} ₾</strong></p>`,
    );
  }

  /** Alert sent to each admin when a pro buys premium (revenue heads-up). */
  async sendPremiumPurchaseAdminAlert(
    email: string,
    info: { tierLabel: string; amountGel: number; buyerName: string; buyerEmail: string },
  ): Promise<boolean> {
    const subject = `New premium purchase: ${info.tierLabel} (${info.amountGel} ₾)`;
    return this.sendOrderEmail(
      email,
      subject,
      `<h2 style="color:#0f172a;margin-top:0;">New premium purchase</h2>
       <p style="color:#334155;"><strong>${info.buyerName}</strong> (${info.buyerEmail || "no email"}) just bought the <strong>${info.tierLabel}</strong> plan.</p>
       <p style="color:#334155;">Amount: <strong>${info.amountGel} ₾</strong></p>`,
    );
  }

  private async sendOrderEmail(email: string, subject: string, inner: string): Promise<boolean> {
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL') || 'noreply@homico.ge';
    try {
      await sgMail.send({
        to: email,
        from: { email: fromEmail, name: 'Homico' },
        subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#EF4E24;margin:0;">Homico</h1></div>
            <div style="background-color:#f8fafc;border-radius:12px;padding:24px;">${inner}</div>
          </div>`,
      });
      this.logger.log(`Order email sent to ${email}: ${subject}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send order email to ${email}:`, error?.response?.body || error?.message || error);
      return false;
    }
  }
}
