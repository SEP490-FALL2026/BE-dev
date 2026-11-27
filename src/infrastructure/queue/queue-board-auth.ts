import { isUtf8 } from 'node:buffer';
import crypto from 'node:crypto';

export const QUEUE_BOARD_PATH = '/ops/queues';

export interface QueueBoardCredentials {
  username: string;
  password: string;
}

function digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value).digest();
}

export function credentialsMatch(header: string | undefined, expected: QueueBoardCredentials): boolean {
  if (!header || !expected.username || !expected.password) return false;
  const encoded = /^Basic +([A-Za-z0-9+/]+={0,2})$/i.exec(header)?.[1];
  if (!encoded) return false;
  const bytes = Buffer.from(encoded, 'base64');
  const canonical = bytes.toString('base64');
  if ((encoded !== canonical && encoded !== canonical.replace(/=+$/, '')) || !isUtf8(bytes)) return false;

  const credentials = bytes.toString('utf8');
  const separator = credentials.indexOf(':');
  if (separator < 0) return false;
  const userMatches = crypto.timingSafeEqual(digest(credentials.slice(0, separator)), digest(expected.username));
  const passwordMatches = crypto.timingSafeEqual(digest(credentials.slice(separator + 1)), digest(expected.password));
  return userMatches && passwordMatches;
}
