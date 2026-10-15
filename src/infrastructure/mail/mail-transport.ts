import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { EnvironmentVariables } from '../config/env-schema';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/** `permanent` means retrying cannot help (a 5xx answer from the mail server). */
export class MailSendError extends Error {
  constructor(
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(`Mail delivery failed (${code}).`);
    this.name = 'MailSendError';
  }
}

export abstract class MailTransport {
  abstract send(mail: OutgoingMail): Promise<void>;
}

@Injectable()
export class SmtpMailTransport extends MailTransport {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    this.from = config.get('SMTP_FROM', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port,
      secure: port === 465,
      requireTLS: config.get('SMTP_TLS', { infer: true }),
      auth: user ? { user, pass: config.get('SMTP_PASSWORD', { infer: true }) } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(mail: OutgoingMail): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to: mail.to, subject: mail.subject, text: mail.text });
    } catch (error) {
      const failure = error as { responseCode?: number; code?: string };
      const status = failure.responseCode;
      if (typeof status === 'number' && status >= 500 && status < 600) throw new MailSendError(`SMTP_${status}`, true);
      throw new MailSendError(typeof status === 'number' ? `SMTP_${status}` : (failure.code ?? 'SMTP_ERROR'), false);
    }
  }
}
