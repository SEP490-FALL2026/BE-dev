import { EmailTemplate } from './notifications.types';

export interface RenderedEmail {
  subject: string;
  text: string;
}

/** The activation link carries the token in the fragment, so it never reaches a server log or a Referer header. */
export function activationLink(appPublicUrl: string, token: string): string {
  return `${appPublicUrl.replace(/\/+$/, '')}/activate#token=${encodeURIComponent(token)}`;
}

export function renderEmail(
  _template: EmailTemplate,
  locale: string,
  payload: Record<string, unknown>,
  appPublicUrl: string,
): RenderedEmail {
  const link = activationLink(appPublicUrl, String(payload.token));
  const expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt : '';
  const name = typeof payload.fullName === 'string' && payload.fullName ? payload.fullName : '';

  if (locale === 'en') {
    return {
      subject: 'Activate your SaaS-Sentry account',
      text:
        `${name ? `Hello ${name},\n\n` : ''}An administrator created an account for you.\n` +
        `Open this link to set your password (single use${expiresAt ? `, valid until ${expiresAt}` : ''}):\n\n${link}\n\n` +
        'If you did not expect this message, ignore it. We never ask for your password by email.',
    };
  }

  return {
    subject: 'Kích hoạt tài khoản SaaS-Sentry',
    text:
      `${name ? `Xin chào ${name},\n\n` : ''}Quản trị viên đã tạo tài khoản cho bạn.\n` +
      `Mở liên kết sau để đặt mật khẩu (dùng một lần${expiresAt ? `, hiệu lực đến ${expiresAt}` : ''}):\n\n${link}\n\n` +
      'Nếu bạn không mong đợi thư này, hãy bỏ qua. Chúng tôi không bao giờ hỏi mật khẩu của bạn qua email.',
  };
}
