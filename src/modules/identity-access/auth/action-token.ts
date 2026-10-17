import { createHash, randomBytes } from 'node:crypto';

/**
 * A one-time token behind an emailed link: 256 bits of randomness, of which only the SHA-256 is stored. Pure, so the
 * recovery command (which runs without the JWT machinery of the API) makes tokens the same way the API does.
 */
export function newActionToken(now: Date, ttlMs: number): { token: string; hash: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');

  return { token, hash: hashActionToken(token), expiresAt: new Date(now.getTime() + ttlMs) };
}

export function hashActionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
