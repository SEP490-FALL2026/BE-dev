import Joi from 'joi';
import { LOCAL_DATABASE_URL, resolveDatabaseUrl } from './database-url';
import { EnvironmentValidationError, validateWithSchema } from './environment-validation';

export type NodeEnvironment = 'development' | 'test' | 'production';

/** The keys the database layer reads. The installation command validates exactly these. */
export interface DatabaseEnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  DATABASE_URL: string;
  TEST_DATABASE_URL: string;
  DB_LOCK_TIMEOUT_MS: number;
  DB_STATEMENT_TIMEOUT_MS: number;
  DB_TRANSACTION_TIMEOUT_MS: number;
  DB_TRANSACTION_MAX_WAIT_MS: number;
  DB_CONNECT_TIMEOUT_MS: number;
  DB_QUERY_TIMEOUT_MS: number;
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: number;
}

const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 20_000;
const IDLE_MARGIN_MS = 10_000;

// Shared by the full schema (API, worker, recovery) and the installation command's schema, so the two cannot drift.
export const databaseKeys = {
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().default(LOCAL_DATABASE_URL),
    }),
  TEST_DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .when('NODE_ENV', {
      is: 'test',
      then: Joi.optional(),
      otherwise: Joi.forbidden(),
    })
    .default(''),
  // Per-transaction limits for the organization/identity area. The ordering lock < statement <
  // transaction makes PostgreSQL stop a slow statement (55P03/57014) before Prisma closes the
  // transaction itself (P2028); assertDatabaseLimits enforces it.
  DB_LOCK_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(3_000),
  DB_STATEMENT_TIMEOUT_MS: Joi.number().integer().min(100).max(120_000).default(5_000),
  DB_TRANSACTION_TIMEOUT_MS: Joi.number().integer().min(100).max(180_000).default(10_000),
  DB_TRANSACTION_MAX_WAIT_MS: Joi.number().integer().min(100).max(60_000).default(2_000),
  // Client-side limits for a database that accepts the connection but never answers (paused
  // container, dropped network path). The server-side timeouts above cannot fire in that case,
  // so without these a request waits forever. The query limit sits above the statement timeout
  // so PostgreSQL reports a slow statement first; assertDatabaseLimits enforces it.
  DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(100).max(60_000).default(3_000),
  DB_QUERY_TIMEOUT_MS: Joi.number().integer().min(100).max(180_000).default(8_000),
  // No Joi default: when absent it follows the transaction timeout (resolveDatabaseSettings), so a
  // deployment with a longer transaction timeout keeps booting.
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: Joi.number().integer().min(1_000).max(600_000),
};

/** The installation command needs the database and nothing else; unrelated variables are ignored. */
const installationEnvironmentSchema = Joi.object(databaseKeys).unknown(true);

/**
 * Settings that depend on other settings. Resolved here rather than at each consumer, so every
 * reader of DATABASE_URL (the Prisma client, a migration script, an integration harness) sees the
 * same database, and every reader of the idle limit sees one that already clears the transaction
 * timeout.
 */
export function resolveDatabaseSettings(
  parsed: Omit<DatabaseEnvironmentVariables, 'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS'> & {
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS?: number;
  },
): DatabaseEnvironmentVariables {
  return {
    ...parsed,
    DATABASE_URL: resolveDatabaseUrl(parsed.NODE_ENV, parsed.DATABASE_URL, parsed.TEST_DATABASE_URL),
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS:
      parsed.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS ??
      Math.max(DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS, parsed.DB_TRANSACTION_TIMEOUT_MS + IDLE_MARGIN_MS),
  };
}

export function assertDatabaseLimits(result: DatabaseEnvironmentVariables): void {
  if (
    result.DB_LOCK_TIMEOUT_MS > result.DB_STATEMENT_TIMEOUT_MS ||
    result.DB_STATEMENT_TIMEOUT_MS >= result.DB_TRANSACTION_TIMEOUT_MS
  ) {
    throw new EnvironmentValidationError(
      'Environment validation failed: DB_LOCK_TIMEOUT_MS must not exceed DB_STATEMENT_TIMEOUT_MS, ' +
        'and DB_STATEMENT_TIMEOUT_MS must be lower than DB_TRANSACTION_TIMEOUT_MS',
    );
  }

  if (result.DB_QUERY_TIMEOUT_MS <= result.DB_STATEMENT_TIMEOUT_MS) {
    throw new EnvironmentValidationError(
      'Environment validation failed: DB_QUERY_TIMEOUT_MS must be higher than DB_STATEMENT_TIMEOUT_MS, ' +
        'so PostgreSQL reports a slow statement before the driver gives up',
    );
  }

  if (result.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS <= result.DB_TRANSACTION_TIMEOUT_MS) {
    throw new EnvironmentValidationError(
      'Environment validation failed: DB_IDLE_IN_TRANSACTION_TIMEOUT_MS must be higher than DB_TRANSACTION_TIMEOUT_MS, ' +
        'so the server only ends sessions the application has already given up on',
    );
  }
}

/** Validates what the installation command reads: the database settings and NODE_ENV, nothing else. */
export function validateInstallationEnvironment(input: Record<string, unknown>): DatabaseEnvironmentVariables {
  const result = resolveDatabaseSettings(
    validateWithSchema(installationEnvironmentSchema, input) as Parameters<typeof resolveDatabaseSettings>[0],
  );
  assertDatabaseLimits(result);

  return result;
}
