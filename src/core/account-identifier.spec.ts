import {
  emailDomainOf,
  hasInvalidCharacters,
  isCompanyAccount,
  looksLikeSecret,
  normalizeAccountIdentifier,
} from './account-identifier';

describe('normalizeAccountIdentifier (QĐ-43c: the same account whatever its case and spaces)', () => {
  it('trims and lower-cases, so " CI-Bot " is ci-bot', () => {
    expect(normalizeAccountIdentifier(' CI-Bot ')).toBe('ci-bot');
    expect(normalizeAccountIdentifier('E2@Congty.VN')).toBe('e2@congty.vn');
  });

  it('writes a compatible character form the same way (full-width letters and ligatures)', () => {
    expect(normalizeAccountIdentifier('ＣＩ-bot')).toBe('ci-bot');
  });
});

describe('hasInvalidCharacters', () => {
  it.each(['ci bot', 'ci\tbot', 'ci\nbot', 'ci\u0000bot', 'ci\u200bbot'])(
    'refuses %j, which holds a space or a control character',
    (value) => {
      expect(hasInvalidCharacters(value)).toBe(true);
    },
  );

  it.each(['ci-bot', 'release_bot', 'e2@congty.vn', 'a.b+c@congty.vn'])('accepts %j', (value) => {
    expect(hasInvalidCharacters(value)).toBe(false);
  });
});

describe('looksLikeSecret (AC-9: a token is not an account name and must never be stored)', () => {
  it.each([
    'ghp_abc123',
    'gho_abc',
    'ghu_x',
    'ghs_x',
    'ghr_x',
    'github_pat_11AAAA',
    'glpat-abcdef',
    'xoxb-1234',
    'xoxp-1234',
    'sk-abcdefghijklmnopqrstuvwxyz0123456789',
    'AKIAIOSFODNN7EXAMPLE',
    'AIzaSyA-1234567890abcdefghijklmnopqrstuv',
  ])('flags %j', (value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it.each([' ghp_abc123', 'ghp_abc​123', 'ghp_﻿abc', 'ｇｈｐ_abc123', 'gh p_abc', 'glpat-‍abc', 'xoxb -123'])(
    'flags %j once its spaces, invisible characters and compatibility forms are taken out (SEC-03)',
    (value) => {
      expect(looksLikeSecret(value)).toBe(true);
    },
  );

  it.each(['ci-bot', 'release-bot', 'sk-bot', 'akia@congty.vn', 'ghpage@congty.vn', 'design@congty.vn', 'xoxo-team'])(
    'does not flag %j',
    (value) => {
      expect(looksLikeSecret(value)).toBe(false);
    },
  );
});

describe('emailDomainOf', () => {
  it('is the lower-case part after the one @ of something that looks like an email', () => {
    expect(emailDomainOf('E4@CongTy.vn')).toBe('congty.vn');
  });

  it.each(['ci-bot', '@congty.vn', 'a@', 'a@@b.vn', 'a@b@c.vn', 'a@nodot', 'a@b..vn'])('is null for %j', (value) => {
    expect(emailDomainOf(value)).toBeNull();
  });
});

describe('isCompanyAccount (AC-13, FR-2.9: only an account on a company domain)', () => {
  const domains = ['congty.vn', 'gmail.com', 'sub.congty.vn'];

  it('accepts an email on a company domain', () => {
    expect(isCompanyAccount('e4@congty.vn', domains)).toBe(true);
    expect(isCompanyAccount('E4@CongTy.VN', domains)).toBe(true);
    expect(isCompanyAccount('e4@sub.congty.vn', domains)).toBe(true);
  });

  it("refuses a domain that is not the company's, and a free mail domain even when an employee listed it", () => {
    expect(isCompanyAccount('e4@other.vn', domains)).toBe(false);
    expect(isCompanyAccount('e4@gmail.com', domains)).toBe(false);
    expect(isCompanyAccount('e4@evilcongty.vn', domains)).toBe(false);
    expect(isCompanyAccount('e4@congty.vn.evil.com', domains)).toBe(false);
  });

  it('refuses what is not an email', () => {
    expect(isCompanyAccount('ci-bot', domains)).toBe(false);
  });
});
