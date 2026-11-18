import { checkPasswordPolicy } from './password.policy';

describe('checkPasswordPolicy', () => {
  const email = 'bao@congty.vn';

  it('accepts a long passphrase with no composition rules', () => {
    expect(checkPasswordPolicy('correct horse battery', email)).toBeNull();
  });

  it('counts characters, not UTF-16 units, after NFC', () => {
    expect(checkPasswordPolicy('😀'.repeat(12), email)).toBeNull();
    expect(checkPasswordPolicy('😀'.repeat(11), email)).toBe('TOO_SHORT');
  });

  it('rejects fewer than 12 and more than 128 characters', () => {
    expect(checkPasswordPolicy('a'.repeat(11), email)).toBe('TOO_SHORT');
    expect(checkPasswordPolicy('a'.repeat(129), email)).toBe('TOO_LONG');
    expect(checkPasswordPolicy('a'.repeat(128), email)).toBeNull();
  });

  it('rejects the login email, including its +tag form, in any case', () => {
    expect(checkPasswordPolicy('BAO@congty.vn', 'bao@congty.vn')).toBe('EQUALS_LOGIN_EMAIL');
    expect(checkPasswordPolicy('bao@congty.vn', 'Bao+figma@CongTy.vn')).toBe('EQUALS_LOGIN_EMAIL');
  });

  it('does not trim: surrounding spaces count toward length', () => {
    expect(checkPasswordPolicy('   shorter   ', email)).toBeNull();
  });
});
