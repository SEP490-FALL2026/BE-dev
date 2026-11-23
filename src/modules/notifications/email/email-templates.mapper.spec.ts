import { activationLink, passwordResetLink, renderEmail } from './email-templates.mapper';

const APP_URL = 'https://app.acme.test/';
const TOKEN = 'tok_AbC-123_xyz';

describe('email templates', () => {
  describe('links', () => {
    it('carries the activation token in the URL fragment, never in the path or query', () => {
      expect(activationLink(APP_URL, TOKEN)).toBe(`https://app.acme.test/activate#token=${TOKEN}`);
    });

    it('carries the reset token in the URL fragment of /reset-password (T-8)', () => {
      expect(passwordResetLink(APP_URL, TOKEN)).toBe(`https://app.acme.test/reset-password#token=${TOKEN}`);
    });
  });

  describe('ACCOUNT_INVITATION', () => {
    it.each(['vi', 'en'])('renders the activation link in %s', (locale) => {
      const { text } = renderEmail('ACCOUNT_INVITATION', locale, { token: TOKEN, fullName: 'An' }, APP_URL);

      expect(text).toContain(`https://app.acme.test/activate#token=${TOKEN}`);
      expect(text).not.toContain('reset-password');
    });
  });

  describe('PASSWORD_RESET', () => {
    it.each(['vi', 'en'])('renders the reset link, not the activation link, in %s', (locale) => {
      const { subject, text } = renderEmail(
        'PASSWORD_RESET',
        locale,
        { token: TOKEN, expiresAt: '2026-10-16T10:30:00.000Z', fullName: 'An' },
        APP_URL,
      );

      expect(text).toContain(`https://app.acme.test/reset-password#token=${TOKEN}`);
      expect(text).not.toContain('/activate');
      expect(text).toContain('16/10/2026 17:30');
      expect(text).not.toContain('2026-10-16T10:30:00.000Z');
      expect(subject).not.toMatch(/activate|kích hoạt/i);
    });
  });

  describe('PASSWORD_CHANGED_NOTICE (AC-12)', () => {
    it.each(['vi', 'en'])('reports the event without any link or token in %s', (locale) => {
      const { text } = renderEmail(
        'PASSWORD_CHANGED_NOTICE',
        locale,
        { event: 'PASSWORD_RESET', at: '2026-10-16T09:00:00.000Z', fullName: 'An' },
        APP_URL,
      );

      expect(text).toContain('16/10/2026 16:00');
      expect(text).not.toContain('#token=');
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toContain('undefined');
    });

    it('tells apart a reset from a change by the event in the payload', () => {
      const reset = renderEmail('PASSWORD_CHANGED_NOTICE', 'en', { event: 'PASSWORD_RESET', at: 'T' }, APP_URL);
      const changed = renderEmail('PASSWORD_CHANGED_NOTICE', 'en', { event: 'PASSWORD_CHANGED', at: 'T' }, APP_URL);

      expect(reset.text).not.toEqual(changed.text);
    });
  });

  describe('the time in a mail is the local time of the organization', () => {
    const instant = '2026-11-28T03:00:00.000Z';
    const reset = (locale: string, extra: Record<string, unknown> = {}) =>
      renderEmail('PASSWORD_RESET', locale, { token: TOKEN, expiresAt: instant, ...extra }, APP_URL).text;

    it('writes dd/MM/yyyy HH:mm in Asia/Ho_Chi_Minh when the payload has no time zone (a row written before the field existed)', () => {
      expect(reset('vi')).toContain('hiệu lực đến 28/11/2026 10:00)');
      expect(reset('vi')).not.toContain(instant);
    });

    it('writes the same time when the payload names Asia/Ho_Chi_Minh', () => {
      expect(reset('vi', { timeZone: 'Asia/Ho_Chi_Minh' })).toContain('28/11/2026 10:00');
    });

    it('follows the time zone the payload names', () => {
      expect(reset('vi', { timeZone: 'UTC' })).toContain('28/11/2026 03:00');
    });

    it('names the offset in the English text', () => {
      expect(reset('en')).toContain('valid until 28/11/2026 10:00 (GMT+7)');
    });

    it('falls back to the default time zone when the payload names one that does not exist', () => {
      expect(reset('vi', { timeZone: 'Not/AZone' })).toContain('28/11/2026 10:00');
    });

    it('formats the time of the notices of a changed password and a changed login email too', () => {
      const changed = renderEmail('PASSWORD_CHANGED_NOTICE', 'vi', { event: 'PASSWORD_CHANGED', at: instant }, APP_URL);
      const email = renderEmail(
        'LOGIN_EMAIL_CHANGED_NOTICE',
        'en',
        { previousEmail: 'a@acme.test', currentEmail: 'b@acme.test', at: instant, timeZone: 'UTC' },
        APP_URL,
      );

      expect(changed.text).toContain('lúc 28/11/2026 10:00');
      expect(email.text).toContain('at 28/11/2026 03:00 (GMT)');
    });
  });

  describe('LOGIN_EMAIL_CHANGED_NOTICE', () => {
    const payload = {
      previousEmail: 'old@acme.test',
      currentEmail: 'new@acme.test',
      at: '2026-11-19T09:00:00.000Z',
      fullName: 'An',
    };

    it.each(['vi', 'en'])('names both addresses and the time, with no link or token, in %s', (locale) => {
      const { text } = renderEmail('LOGIN_EMAIL_CHANGED_NOTICE', locale, { ...payload, audience: 'CURRENT' }, APP_URL);

      expect(text).toContain('old@acme.test');
      expect(text).toContain('new@acme.test');
      expect(text).toContain('19/11/2026 16:00');
      expect(text).not.toContain('#token=');
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toContain('undefined');
    });

    it('adds the warning for the previous address only', () => {
      const previous = renderEmail('LOGIN_EMAIL_CHANGED_NOTICE', 'vi', { ...payload, audience: 'PREVIOUS' }, APP_URL);
      const current = renderEmail('LOGIN_EMAIL_CHANGED_NOTICE', 'vi', { ...payload, audience: 'CURRENT' }, APP_URL);

      expect(previous.text).toContain('Nếu bạn không yêu cầu thay đổi này, hãy liên hệ quản trị viên.');
      expect(current.text).not.toContain('Nếu bạn không yêu cầu');
      expect(
        renderEmail('LOGIN_EMAIL_CHANGED_NOTICE', 'en', { ...payload, audience: 'PREVIOUS' }, APP_URL).text,
      ).toContain('If you did not ask for this change');
    });
  });
});
