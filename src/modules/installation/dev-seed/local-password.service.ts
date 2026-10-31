import { randomBytes } from 'node:crypto';

/** Makes the password of one new demo account. Tests pass a deterministic one; the command uses the one below. */
export type PasswordGenerator = () => string;

/**
 * 18 random bytes from the operating system's CSPRNG, base64url: 24 characters, well inside the password policy
 * (12–128). Never a default, never stored outside the credential hash (operational-commands rule 5).
 */
export const generateLocalPassword: PasswordGenerator = () => randomBytes(18).toString('base64url');
