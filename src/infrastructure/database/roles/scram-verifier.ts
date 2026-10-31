import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** PostgreSQL's default (`scram_iterations`, PostgreSQL 16+). */
const ITERATIONS = 4096;

/**
 * The SCRAM-SHA-256 verifier PostgreSQL stores for a password (RFC 5802, RFC 7677; `pg_authid.rolpassword`). Sent as
 * `ALTER ROLE … PASSWORD '<verifier>'`, the server keeps it as is, so the password itself never reaches the server or
 * its log, even when the statement fails. Only for passwords of printable ASCII (SASLprep leaves them unchanged).
 */
export function scramSha256Verifier(password: string, salt: Buffer = randomBytes(16), iterations = ITERATIONS): string {
  const salted = pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();

  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
