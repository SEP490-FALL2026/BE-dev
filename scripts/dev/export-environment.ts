import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The seven E3 settings (H6.3) and the two credentials of the object storage (SEC-04) that the API's configuration
 * requires outside NODE_ENV=test; the document needs none.
 */
export const EXPORT_ONLY_SETTINGS = [
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_THROTTLE_PEPPER',
  'OUTBOX_PAYLOAD_KEY',
  'OUTBOX_PAYLOAD_KEY_ID',
  'LICENSE_KEY_VAULT_KEY',
  'LICENSE_KEY_VAULT_KEY_ID',
  'LICENSE_KEY_FINGERPRINT_PEPPER',
  'OBJECT_STORAGE_ACCESS_KEY_ID',
  'OBJECT_STORAGE_SECRET_ACCESS_KEY',
] as const;

/** Fresh valid values, generated in memory for one export and never printed or written. */
function ephemeralSettings(): Record<(typeof EXPORT_ONLY_SETTINGS)[number], string> {
  return {
    AUTH_ACCESS_TOKEN_SECRET: randomBytes(48).toString('base64url'),
    AUTH_THROTTLE_PEPPER: randomBytes(32).toString('base64url'),
    OUTBOX_PAYLOAD_KEY: randomBytes(32).toString('base64'),
    OUTBOX_PAYLOAD_KEY_ID: `export-${randomBytes(4).toString('hex')}`,
    LICENSE_KEY_VAULT_KEY: randomBytes(32).toString('base64'),
    LICENSE_KEY_VAULT_KEY_ID: `export-${randomBytes(4).toString('hex')}`,
    LICENSE_KEY_FINGERPRINT_PEPPER: randomBytes(32).toString('base64url'),
    OBJECT_STORAGE_ACCESS_KEY_ID: `export${randomBytes(6).toString('hex')}`,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: randomBytes(24).toString('base64url'),
  };
}

/**
 * Runs `work` (which imports and builds the API graph) with an export-only environment (OPENAPI-EXPORT.1): the caller's
 * NODE_ENV is kept, the E3 settings and the storage credentials are replaced by ephemeral values for this process only, and the working
 * directory is an empty temporary folder, so ConfigModule reads no `.env`. Everything is restored in `finally`. Nothing
 * here connects to PostgreSQL, SMTP, Redis or storage.
 */
export async function withExportOnlyEnvironment<T>(work: () => Promise<T>): Promise<T> {
  const previous = new Map(EXPORT_ONLY_SETTINGS.map((name) => [name, process.env[name]]));
  const previousDirectory = process.cwd();
  const isolated = mkdtempSync(join(tmpdir(), 'slm-openapi-export-'));
  try {
    Object.assign(process.env, ephemeralSettings());
    process.chdir(isolated);
    return await work();
  } finally {
    process.chdir(previousDirectory);
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(isolated, { recursive: true, force: true });
  }
}
