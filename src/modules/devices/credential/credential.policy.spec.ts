import {
  CREDENTIAL_TTL_MS,
  ROTATION_GRACE_MS,
  displayEnrollmentCode,
  generateEnrollmentCode,
  generateSecret,
  judgeCredential,
  matchSecret,
  normalizeEnrollmentCode,
  rotationPlan,
  sha256Hex,
  tokenOf,
  type VerificationFacts,
} from './credential.policy';
import { parseDeviceToken } from '../../../infrastructure/security/tokens/device-token';

const now = new Date('2026-11-05T10:00:00.000Z');
const later = (ms: number) => new Date(now.getTime() + ms);

const facts = (secret: string, over: Partial<VerificationFacts> = {}): VerificationFacts => ({
  secretHash: sha256Hex(secret),
  secretUsedAt: now,
  previousSecretHash: null,
  previousValidUntil: null,
  expiresAt: later(CREDENTIAL_TTL_MS),
  revokedAt: null,
  registrationEndedAt: null,
  deviceRetiredAt: null,
  holderTerminated: false,
  ...over,
});

describe('the code of an enrollment', () => {
  it('is twelve characters of the alphabet that cannot be misread, shown in three groups', () => {
    const code = generateEnrollmentCode();

    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(displayEnrollmentCode(code)).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(generateEnrollmentCode()).not.toBe(code);
  });

  it('is read back however the installer typed it, and refused when it is not a code', () => {
    expect(normalizeEnrollmentCode(' abcd-efgh-jkmn ')).toBe('ABCDEFGHJKMN');
    expect(normalizeEnrollmentCode('ABCD EFGH JKMN')).toBe('ABCDEFGHJKMN');
    expect(normalizeEnrollmentCode('ABCD-EFGH-JKM')).toBeNull();
    expect(normalizeEnrollmentCode('ABCD-EFGH-JKMI')).toBeNull();
    expect(normalizeEnrollmentCode('')).toBeNull();
  });
});

describe('the token of a credential', () => {
  it('carries the id and a 43-character secret and is read back by the one pattern the guard uses', () => {
    const secret = generateSecret();
    const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

    expect(secret).toHaveLength(43);
    expect(parseDeviceToken(tokenOf(id, secret))).toEqual({ credentialId: id, secret });
    expect(parseDeviceToken(`sstd_${id}_short`)).toBeNull();
    expect(parseDeviceToken(`Bearer ${tokenOf(id, secret)}`)).toBeNull();
  });
});

describe('matchSecret', () => {
  const secret = generateSecret();
  const previous = generateSecret();
  const rotated = facts(secret, {
    secretUsedAt: null,
    previousSecretHash: sha256Hex(previous),
    previousValidUntil: later(ROTATION_GRACE_MS),
  });

  it('accepts the current secret and the previous one while the new one has not been used and the grace day lasts', () => {
    expect(matchSecret(rotated, secret, now)).toBe('CURRENT');
    expect(matchSecret(rotated, previous, now)).toBe('PREVIOUS');
  });

  it('ends the previous secret at the first use of the new one and at the end of the grace day', () => {
    expect(matchSecret({ ...rotated, secretUsedAt: now }, previous, now)).toBe('NONE');
    expect(matchSecret(rotated, previous, later(ROTATION_GRACE_MS))).toBe('NONE');
  });

  it('refuses a secret that is neither', () => {
    expect(matchSecret(rotated, generateSecret(), now)).toBe('NONE');
  });
});

describe('rotationPlan', () => {
  it('keeps the secret it replaces for a grace day when the current one is used', () => {
    expect(
      rotationPlan(
        { match: 'CURRENT', currentSecretHash: 'h', previousSecretHash: null, previousValidUntil: null },
        now,
      ),
    ).toEqual({
      previousSecretHash: 'h',
      previousValidUntil: later(ROTATION_GRACE_MS),
    });
  });

  it('G-M2: keeps the previous secret and its end, without extending them, when the previous secret is the one used', () => {
    expect(
      rotationPlan(
        { match: 'PREVIOUS', currentSecretHash: 'h', previousSecretHash: 'old', previousValidUntil: later(1000) },
        now,
      ),
    ).toEqual({ previousSecretHash: 'old', previousValidUntil: later(1000) });
  });
});

describe('judgeCredential', () => {
  const secret = generateSecret();

  it('is OK for a credential in force', () => {
    expect(judgeCredential(facts(secret), secret, now)).toBe('OK');
  });

  it('says nothing of the state of a credential to a secret that does not match', () => {
    const gone = facts(secret, { revokedAt: now, expiresAt: now });

    expect(judgeCredential(gone, generateSecret(), now)).toBe('INVALID');
  });

  it.each([
    ['revoked', { revokedAt: now }],
    ['its registration ended', { registrationEndedAt: now }],
    ['its machine retired', { deviceRetiredAt: now }],
    ['its holder terminated', { holderTerminated: true }],
  ])('is REVOKED when the secret matches and the credential is %s', (_name, over) => {
    expect(judgeCredential(facts(secret, over), secret, now)).toBe('REVOKED');
  });

  it('is EXPIRED at the expiry, and REVOKED rather than EXPIRED when both are true', () => {
    expect(judgeCredential(facts(secret, { expiresAt: now }), secret, now)).toBe('EXPIRED');
    expect(judgeCredential(facts(secret, { expiresAt: now, revokedAt: now }), secret, now)).toBe('REVOKED');
  });
});
