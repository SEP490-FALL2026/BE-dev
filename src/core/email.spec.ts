import { InvalidEmailError, normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('lower-cases and trims', () => {
    expect(normalizeEmail('  Bao@CongTy.VN ')).toBe('bao@congty.vn');
  });

  it('drops the +tag of the local part so aliases share one identity (US-02-01 AC-6)', () => {
    expect(normalizeEmail('Bao+figma@CongTy.vn')).toBe(normalizeEmail('bao@congty.vn'));
    expect(normalizeEmail('a+b+c@x.io')).toBe('a@x.io');
  });

  it('keeps a plus that is the whole local part from becoming empty', () => {
    expect(() => normalizeEmail('+tag@x.io')).toThrow(InvalidEmailError);
  });

  it.each(['', 'no-at-sign', 'two@@x.io', 'a@', '@x.io', 'a b@x.io', 'a@x', 'a@x..io'])('rejects %p', (value) => {
    expect(() => normalizeEmail(value)).toThrow(InvalidEmailError);
  });

  it('rejects values longer than 254 characters', () => {
    expect(() => normalizeEmail(`${'a'.repeat(250)}@x.io`)).toThrow(InvalidEmailError);
  });
});
