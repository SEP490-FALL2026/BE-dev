import { normalizeEmail } from '../../core/email';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordPolicyViolation = 'TOO_SHORT' | 'TOO_LONG' | 'EQUALS_LOGIN_EMAIL';

/** Canonical form of a password before hashing or comparing: Unicode NFC, never trimmed or case-folded. */
export function canonicalizePassword(password: string): string {
  return password.normalize('NFC');
}

/**
 * Length-based policy (OWASP, NIST SP 800-63B): 12–128 characters after NFC, and not the login
 * email. No composition rules. Returns the violation, or null when acceptable.
 */
export function checkPasswordPolicy(password: string, loginEmail: string): PasswordPolicyViolation | null {
  const canonical = canonicalizePassword(password);
  const length = [...canonical].length;

  if (length < PASSWORD_MIN_LENGTH) return 'TOO_SHORT';
  if (length > PASSWORD_MAX_LENGTH) return 'TOO_LONG';

  const lowered = canonical.trim().toLowerCase();
  let normalizedEmail: string | null = null;
  try {
    normalizedEmail = normalizeEmail(loginEmail);
  } catch {
    // An unparseable email cannot equal the password in a way that matters; compare raw below.
  }
  if (lowered === loginEmail.trim().toLowerCase() || (normalizedEmail !== null && lowered === normalizedEmail)) {
    return 'EQUALS_LOGIN_EMAIL';
  }

  return null;
}
