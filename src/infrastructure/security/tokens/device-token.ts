/**
 * The bearer credential of a device: `sstd_<credential id>_<secret>`. The id is a UUID and the secret is 43 characters of base64url
 * (256 bits), so the two are told apart by length and a `_` inside the secret is never ambiguous. Pure text, shared by the guard that
 * rejects a malformed token before any database read, by the throttle that counts requests per credential, and by the verifier.
 */
const DEVICE_TOKEN = /^sstd_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;

export interface ParsedDeviceToken {
  credentialId: string;
  secret: string;
}

/** The credential id and the secret of a token, or null when it is not shaped like one. */
export function parseDeviceToken(token: string): ParsedDeviceToken | null {
  const match = DEVICE_TOKEN.exec(token);

  return match?.[1] && match[2] ? { credentialId: match[1], secret: match[2] } : null;
}

/** What a device sends: the token of the right shape for a credential made here. */
export function formatDeviceToken(credentialId: string, secret: string): string {
  return `sstd_${credentialId}_${secret}`;
}
