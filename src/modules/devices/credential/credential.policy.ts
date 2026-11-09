import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { formatDeviceToken } from '../../../infrastructure/security/tokens/device-token';

/** The code is shown once and good for a day; the credential it buys lasts ninety days from each issue or rotation. */
export const ENROLLMENT_CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** After a rotation the old secret keeps working this long, until the tool first uses the new one. */
export const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_LENGTH = 12;
const NORMALIZED_CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

/** A fresh code of twelve Crockford base32 characters (about 60 bits): no I, L, O or U to be misread when read aloud or typed. */
export function generateEnrollmentCode(): string {
  const bytes = randomBytes(CODE_LENGTH);

  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

/** The code as the IT Admin reads it out: `XXXX-XXXX-XXXX`. */
export const displayEnrollmentCode = (code: string): string =>
  `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;

/** What the installer typed, upper-cased with the dashes and blanks removed; null when that is not a code at all. */
export function normalizeEnrollmentCode(input: string): string | null {
  const normalized = input.toUpperCase().replace(/[-\s]/g, '');

  return NORMALIZED_CODE.test(normalized) ? normalized : null;
}

/** A new secret: 256 random bits, 43 characters of base64url. Only its hash is ever kept. */
export const generateSecret = (): string => randomBytes(32).toString('base64url');

export const tokenOf = formatDeviceToken;

/** Whether a secret is the one a hash was made of, in constant time. */
export function secretMatches(secret: string, storedHash: string): boolean {
  const given = Buffer.from(sha256Hex(secret), 'hex');
  const stored = Buffer.from(storedHash, 'hex');

  return given.length === stored.length && timingSafeEqual(given, stored);
}

export interface SecretFacts {
  secretHash: string;
  secretUsedAt: Date | null;
  previousSecretHash: string | null;
  previousValidUntil: Date | null;
}

export type SecretMatch = 'CURRENT' | 'PREVIOUS' | 'NONE';

/**
 * Which secret of the credential a token carries. The current one always works. The one before a rotation works only while the
 * tool has not used the new one yet and only until the end of the grace day: the first use of the new secret ends the old one.
 */
export function matchSecret(facts: SecretFacts, secret: string, now: Date): SecretMatch {
  if (secretMatches(secret, facts.secretHash)) return 'CURRENT';
  const previousStillGood =
    facts.previousSecretHash !== null &&
    facts.previousValidUntil !== null &&
    facts.secretUsedAt === null &&
    now < facts.previousValidUntil;

  return previousStillGood && secretMatches(secret, facts.previousSecretHash as string) ? 'PREVIOUS' : 'NONE';
}

export interface RotationFacts {
  match: Exclude<SecretMatch, 'NONE'>;
  currentSecretHash: string;
  /** The secret before the last rotation and until when it works, as the row holds them. */
  previousSecretHash: string | null;
  previousValidUntil: Date | null;
}

export interface RotationPlan {
  /** The hash that becomes `previous`, and until when; null when nothing is kept. */
  previousSecretHash: string | null;
  previousValidUntil: Date | null;
}

/**
 * What a rotation keeps of the old secrets. Rotating with the current secret keeps it for a grace day. Rotating with the previous one
 * (the tool never used the secret it was given) replaces only the current one and leaves the previous secret and its end as they are:
 * the answer of the rotation may be lost again, and the secret the tool still holds must work until its own day ends, not a day more.
 */
export function rotationPlan(facts: RotationFacts, now: Date): RotationPlan {
  if (facts.match === 'PREVIOUS') {
    return { previousSecretHash: facts.previousSecretHash, previousValidUntil: facts.previousValidUntil };
  }

  return {
    previousSecretHash: facts.currentSecretHash,
    previousValidUntil: new Date(now.getTime() + ROTATION_GRACE_MS),
  };
}

export type CredentialVerdictStatus = 'OK' | 'INVALID' | 'REVOKED' | 'EXPIRED';

export interface VerificationFacts extends SecretFacts {
  expiresAt: Date;
  revokedAt: Date | null;
  registrationEndedAt: Date | null;
  deviceRetiredAt: Date | null;
  holderTerminated: boolean;
}

/**
 * The verdict on a credential whose id was found, in the order that tells a guesser nothing: a secret that does not match is
 * `INVALID` whatever the credential's state; only a matching secret is told `REVOKED` (revoked, its registration ended, its
 * machine retired, its holder gone) or `EXPIRED`.
 */
export function judgeCredential(facts: VerificationFacts, secret: string, now: Date): CredentialVerdictStatus {
  if (matchSecret(facts, secret, now) === 'NONE') return 'INVALID';
  const gone =
    facts.revokedAt !== null ||
    facts.registrationEndedAt !== null ||
    facts.deviceRetiredAt !== null ||
    facts.holderTerminated;
  if (gone) return 'REVOKED';

  return now >= facts.expiresAt ? 'EXPIRED' : 'OK';
}
