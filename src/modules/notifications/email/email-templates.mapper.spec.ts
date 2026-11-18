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
      expect(text).toContain('2026-10-16T10:30:00.000Z');
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

      expect(text).toContain('2026-10-16T09:00:00.000Z');
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
});
