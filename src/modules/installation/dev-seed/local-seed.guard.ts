import { classifyDatabaseUrl } from '../../../infrastructure/config/database-host';

export type LocalSeedRefusal =
  'ENVIRONMENT_NOT_LOCAL' | 'DATABASE_NOT_LOOPBACK' | 'DATABASE_URL_INVALID' | 'CONFIRMATION_MISSING';

const LOCAL_ENVIRONMENTS: ReadonlySet<string> = new Set(['development', 'test']);

/**
 * The three independent guards of a local write command (operational-commands rule 2), checked before any write
 * transaction: NODE_ENV is development or test, the effective DATABASE_URL parses to a loopback host, and the operator
 * passed `--confirm-local`. Returns the first guard that fails, or null. Nothing bypasses one guard.
 */
export function checkLocalSeedGuards(input: {
  nodeEnv: string | undefined;
  databaseUrl: string;
  confirmLocal: boolean;
}): LocalSeedRefusal | null {
  if (input.nodeEnv === undefined || !LOCAL_ENVIRONMENTS.has(input.nodeEnv)) return 'ENVIRONMENT_NOT_LOCAL';

  const host = classifyDatabaseUrl(input.databaseUrl);
  if (host === 'invalid') return 'DATABASE_URL_INVALID';
  if (host !== 'loopback') return 'DATABASE_NOT_LOOPBACK';

  return input.confirmLocal ? null : 'CONFIRMATION_MISSING';
}
