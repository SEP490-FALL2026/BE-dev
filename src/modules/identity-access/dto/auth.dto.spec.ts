import { changePasswordBodySchema, loginBodySchema, passwordResetBodySchema } from './auth.dto';

/**
 * AUTH.2 / F-31: the transport limits of the password fields. Only the new password of the authenticated change grows
 * (256 → 1024), so the password policy (12–128) — not body parsing — decides and names the reason. Every other limit
 * stays as it is.
 */
describe('password transport limits', () => {
  const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
    schema.safeParse(value).success;

  it('lets a change-password body carry a new password up to 1024 characters, and refuses 1025', () => {
    const body = (length: number) => ({ currentPassword: 'current password', newPassword: 'n'.repeat(length) });

    expect(ok(changePasswordBodySchema, body(128))).toBe(true);
    expect(ok(changePasswordBodySchema, body(129))).toBe(true);
    expect(ok(changePasswordBodySchema, body(257))).toBe(true);
    expect(ok(changePasswordBodySchema, body(1024))).toBe(true);
    expect(ok(changePasswordBodySchema, body(1025))).toBe(false);
    expect(ok(changePasswordBodySchema, body(0))).toBe(false);
  });

  it('keeps the current password of a change at 256', () => {
    const body = (length: number) => ({ currentPassword: 'c'.repeat(length), newPassword: 'a long new passphrase' });

    expect(ok(changePasswordBodySchema, body(256))).toBe(true);
    expect(ok(changePasswordBodySchema, body(257))).toBe(false);
  });

  it('keeps the login password at 256 and the reset new password at 1024', () => {
    expect(ok(loginBodySchema, { email: 'a@b.vn', password: 'p'.repeat(256) })).toBe(true);
    expect(ok(loginBodySchema, { email: 'a@b.vn', password: 'p'.repeat(257) })).toBe(false);
    expect(ok(passwordResetBodySchema, { token: 't', newPassword: 'n'.repeat(1024) })).toBe(true);
    expect(ok(passwordResetBodySchema, { token: 't', newPassword: 'n'.repeat(1025) })).toBe(false);
    expect(ok(passwordResetBodySchema, { token: 't'.repeat(257), newPassword: 'a long new passphrase' })).toBe(false);
  });
});
