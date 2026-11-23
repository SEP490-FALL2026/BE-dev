import { UnknownEmailTemplateError } from '../notifications.errors';
import { EmailTemplate } from '../public/notifications.types';

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
    case 'LOGIN_EMAIL_CHANGED_NOTICE':
      return renderLoginEmailChangedNotice(english, greeting, payload);
    case 'ACCOUNT_INVITATION':
      return renderInvitation(english, greeting, payload, appPublicUrl);
    default:
      throw new UnknownEmailTemplateError(String(template));
  }
}

/** The zone a mail written before the payload carried one is read in: the one of the installation, as the organization defaults to. */
const DEFAULT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function timePartsIn(date: Date, timeZone: string): Map<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  return new Map(parts.map((part) => [part.type, part.value]));
}

/**
 * The offset of the zone at that instant, written `GMT`, `GMT+7`, `GMT+5:30` or `GMT-3`. It is computed from the clock the zone shows, not read from the
 * name the ICU data of the runtime gives it (`GMT` on one Node version, `GMT+0` on another), so the same mail reads the same everywhere.
 */
function offsetLabel(date: Date, parts: Map<string, string>): string {
  const shown = Date.UTC(
    Number(parts.get('year')),
    Number(parts.get('month')) - 1,
    Number(parts.get('day')),
    Number(parts.get('hour')),
    Number(parts.get('minute')),
  );
  const minuteOfInstant = Math.floor(date.getTime() / 60_000) * 60_000;
  const minutes = Math.round((shown - minuteOfInstant) / 60_000);
  if (minutes === 0) return 'GMT';
  const sign = minutes < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;

  return `GMT${sign}${hours}${rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`}`;
}

/**
 * An instant of the payload (ISO, as the writer of the mail records it) as `dd/MM/yyyy HH:mm` in the time zone of the organization the payload names, so a
 * person reads their own clock; the English text adds the offset, for example `(GMT+7)`. What is not an instant is left as it is, and a zone that does not exist
 * gives way to the default one.
 */
function localTime(value: unknown, timeZone: unknown, english: boolean): string {
  if (typeof value !== 'string' || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  let parts: Map<string, string>;
  try {
    parts = timePartsIn(date, typeof timeZone === 'string' && timeZone !== '' ? timeZone : DEFAULT_TIME_ZONE);
  } catch {
    parts = timePartsIn(date, DEFAULT_TIME_ZONE);
  }
  const text = `${parts.get('day')}/${parts.get('month')}/${parts.get('year')} ${parts.get('hour')}:${parts.get('minute')}`;

  return english ? `${text} (${offsetLabel(date, parts)})` : text;
}

function expiry(payload: Record<string, unknown>, english: boolean): string {
  return localTime(payload.expiresAt, payload.timeZone, english);
}

function renderInvitation(
  english: boolean,
  greeting: string,
  payload: Record<string, unknown>,
  appPublicUrl: string,
): RenderedEmail {
  const link = activationLink(appPublicUrl, String(payload.token));
  const expiresAt = expiry(payload, english);

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
  const expiresAt = expiry(payload, english);

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
  const at = localTime(payload.at, payload.timeZone, english);
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

/**
 * Says that the login email changed, from which address to which, and when; it carries no link, token or secret. The same notice goes to the
 * previous address (`audience: 'PREVIOUS'`, which also says what to do if the change was not wanted) and to the new one.
 */
function renderLoginEmailChangedNotice(
  english: boolean,
  greeting: string,
  payload: Record<string, unknown>,
): RenderedEmail {
  const at = localTime(payload.at, payload.timeZone, english);
  const previous = typeof payload.previousEmail === 'string' ? payload.previousEmail : '';
  const current = typeof payload.currentEmail === 'string' ? payload.currentEmail : '';
  const toPrevious = payload.audience === 'PREVIOUS';

  if (english) {
    return {
      subject: 'Your SaaS-Sentry login email was changed',
      text:
        `${greeting}Your SaaS-Sentry login email was changed from ${previous} to ${current}${at ? ` at ${at}` : ''}, ` +
        'because an administrator updated your profile.\n' +
        'Sign in with the new address from now on; your password and your open sessions are unchanged.' +
        (toPrevious ? '\n\nIf you did not ask for this change, contact your administrator.' : ''),
    };
  }

  return {
    subject: 'Email đăng nhập SaaS-Sentry của bạn đã được thay đổi',
    text:
      `${greeting}Email đăng nhập SaaS-Sentry của bạn đã được đổi từ ${previous} sang ${current}${at ? ` lúc ${at}` : ''}, ` +
      'do quản trị viên cập nhật hồ sơ của bạn.\n' +
      'Từ nay hãy đăng nhập bằng địa chỉ mới; mật khẩu và các phiên đang mở của bạn không đổi.' +
      (toPrevious ? '\n\nNếu bạn không yêu cầu thay đổi này, hãy liên hệ quản trị viên.' : ''),
  };
}
