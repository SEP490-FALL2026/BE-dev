import { EmailTemplate } from './notifications.types';

export interface RenderedEmail {
  subject: string;
  text: string;
}

function baseUrl(appPublicUrl: string): string {
  return appPublicUrl.replace(/\/+$/, '');
}

/** The activation link carries the token in the fragment, so it never reaches a server log or a Referer header. */
export function activationLink(appPublicUrl: string, token: string): string {
  return `${baseUrl(appPublicUrl)}/activate#token=${encodeURIComponent(token)}`;
}

/** Same rule as the activation link: the reset token travels in the fragment (T-8). */
export function passwordResetLink(appPublicUrl: string, token: string): string {
  return `${baseUrl(appPublicUrl)}/reset-password#token=${encodeURIComponent(token)}`;
}

/** The row names a template this build does not have (for example one written by a newer build). It can never be sent. */
export class UnknownEmailTemplateError extends Error {
  constructor(readonly template: string) {
    super(`Unknown email template: ${template}`);
    this.name = 'UnknownEmailTemplateError';
  }
}

export function renderEmail(
  template: EmailTemplate,
  locale: string,
  payload: Record<string, unknown>,
  appPublicUrl: string,
): RenderedEmail {
  const english = locale === 'en';
  const name = typeof payload.fullName === 'string' && payload.fullName ? payload.fullName : '';
  const greeting = name ? (english ? `Hello ${name},\n\n` : `Xin chào ${name},\n\n`) : '';

  switch (template) {
    case 'PASSWORD_RESET':
      return renderPasswordReset(english, greeting, payload, appPublicUrl);
    case 'PASSWORD_CHANGED_NOTICE':
      return renderPasswordChangedNotice(english, greeting, payload);
    case 'ACCOUNT_INVITATION':
      return renderInvitation(english, greeting, payload, appPublicUrl);
    default:
      throw new UnknownEmailTemplateError(String(template));
  }
}

function expiry(payload: Record<string, unknown>): string {
  return typeof payload.expiresAt === 'string' ? payload.expiresAt : '';
}

function renderInvitation(
  english: boolean,
  greeting: string,
  payload: Record<string, unknown>,
  appPublicUrl: string,
): RenderedEmail {
  const link = activationLink(appPublicUrl, String(payload.token));
  const expiresAt = expiry(payload);

  if (english) {
    return {
      subject: 'Activate your SaaS-Sentry account',
      text:
        `${greeting}An administrator created an account for you.\n` +
        `Open this link to set your password (single use${expiresAt ? `, valid until ${expiresAt}` : ''}):\n\n${link}\n\n` +
        'If you did not expect this message, ignore it. We never ask for your password by email.',
    };
  }

  return {
    subject: 'Kích hoạt tài khoản SaaS-Sentry',
    text:
      `${greeting}Quản trị viên đã tạo tài khoản cho bạn.\n` +
      `Mở liên kết sau để đặt mật khẩu (dùng một lần${expiresAt ? `, hiệu lực đến ${expiresAt}` : ''}):\n\n${link}\n\n` +
      'Nếu bạn không mong đợi thư này, hãy bỏ qua. Chúng tôi không bao giờ hỏi mật khẩu của bạn qua email.',
  };
}

function renderPasswordReset(
  english: boolean,
  greeting: string,
  payload: Record<string, unknown>,
  appPublicUrl: string,
): RenderedEmail {
  const link = passwordResetLink(appPublicUrl, String(payload.token));
  const expiresAt = expiry(payload);

  if (english) {
    return {
      subject: 'Reset your SaaS-Sentry password',
      text:
        `${greeting}We received a request to reset your password.\n` +
        `Open this link to choose a new one (single use${expiresAt ? `, valid until ${expiresAt}` : ''}):\n\n${link}\n\n` +
        'If you did not ask for this, ignore this message: your password stays as it is. We never ask for your password by email.',
    };
  }

  return {
    subject: 'Đặt lại mật khẩu SaaS-Sentry',
    text:
      `${greeting}Chúng tôi nhận được yêu cầu đặt lại mật khẩu của bạn.\n` +
      `Mở liên kết sau để chọn mật khẩu mới (dùng một lần${expiresAt ? `, hiệu lực đến ${expiresAt}` : ''}):\n\n${link}\n\n` +
      'Nếu bạn không yêu cầu, hãy bỏ qua thư này: mật khẩu của bạn không đổi. Chúng tôi không bao giờ hỏi mật khẩu của bạn qua email.',
  };
}

/** Says only that the password changed and when; it carries no link, token or secret (QĐ-73a, AC-12). */
function renderPasswordChangedNotice(
  english: boolean,
  greeting: string,
  payload: Record<string, unknown>,
): RenderedEmail {
  const at = typeof payload.at === 'string' ? payload.at : '';
  const wasReset = payload.event === 'PASSWORD_RESET';

  if (english) {
    return {
      subject: 'Your SaaS-Sentry password was changed',
      text:
        `${greeting}Your password was ${wasReset ? 'reset' : 'changed'}${at ? ` at ${at}` : ''}.\n` +
        'All your sessions were signed out; sign in again with the new password.\n\n' +
        'If this was not you, contact your administrator immediately.',
    };
  }

  return {
    subject: 'Mật khẩu SaaS-Sentry của bạn đã được thay đổi',
    text:
      `${greeting}Mật khẩu của bạn đã được ${wasReset ? 'đặt lại' : 'đổi'}${at ? ` lúc ${at}` : ''}.\n` +
      'Mọi phiên đăng nhập đã bị đăng xuất; hãy đăng nhập lại bằng mật khẩu mới.\n\n' +
      'Nếu đây không phải bạn, hãy liên hệ quản trị viên ngay.',
  };
}
