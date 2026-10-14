import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/client';
import { DatabaseEnvironmentVariables } from '../config/env-schema';
import { PrismaService } from './prisma.service';

/** The client handed to work running inside one database transaction. */
export type DbTx = Prisma.TransactionClient;

/**
 * The database could not finish the transaction in time or was interrupted: deadlock,
 * lock/statement timeout, Prisma closing the transaction, or the connection dropping.
 * Before COMMIT was sent, everything was rolled back. When the error happens while COMMIT is in
 * flight (a timeout or a dropped connection), the outcome is unknown: the server may have committed.
 * Callers map this to a retryable 503 for the caller to try again, but must not blindly retry
 * writes that are not idempotent; nothing here is retried.
 */
export class TransientDatabaseError extends Error {
  constructor(
    readonly sqlState: string | undefined,
    readonly reason: unknown,
  ) {
    super('The database could not complete the transaction. Retry shortly.');
    this.name = 'TransientDatabaseError';
  }
}

/** SQLSTATE classes that mean "try again later" rather than "your data is wrong". */
const TRANSIENT_SQL_STATES = new Set(['40P01', '55P03', '57014', '40001', '57P01', '08006', '08003', '53300']);
/** Prisma codes that never carry the SQLSTATE: transaction timed out / could not be started. */
const TRANSIENT_PRISMA_CODES = new Set(['P2028', 'P2024', 'P1001', 'P1002', 'P1008', 'P1017', 'P2034']);

/**
 * Prisma 7 + adapter-pg only gives SQLSTATE 23505 (P2002) and 40001 (P2034) their own code.
 * Deadlock, lock timeout and statement timeout arrive as P2010 (raw) or P2039 (model) with
 * the original SQLSTATE nested in meta.driverAdapterError.cause.
 */
export function readSqlState(error: unknown): string | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;

  const driverError = (error.meta as { driverAdapterError?: { cause?: Record<string, unknown> } } | undefined)
    ?.driverAdapterError;
  const cause = driverError?.cause;
  const state = cause?.originalCode ?? cause?.code;

  return typeof state === 'string' ? state : undefined;
}

/**
 * node-postgres reports a silent or dead server with plain `Error` objects: the client-side
 * timeouts (`connectionTimeoutMillis`, `query_timeout`) and a dropped socket carry no SQLSTATE and
 * no Prisma code, so the only stable handle is the message pg itself writes. Anything else stays
 * an error, so a programming mistake is never reported as a retryable 503.
 */
const PG_CONNECTIVITY_MESSAGES = new Set([
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'Query read timeout',
  'timeout exceeded when trying to connect',
  // A connection that was ended (retired after a client-side timeout, pg-pool.ts) or whose socket
  // already failed rejects the queries still queued on it with one of these.
  'Connection terminated',
  'Client was closed and is not queryable',
  'Client has encountered a connection error and is not queryable',
]);
const SOCKET_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

function isPgConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;

  return PG_CONNECTIVITY_MESSAGES.has(error.message) || (typeof code === 'string' && SOCKET_ERROR_CODES.has(code));
}

export function toTransientError(error: unknown): TransientDatabaseError | undefined {
  if (isPgConnectivityError(error)) return new TransientDatabaseError(undefined, error);

  const sqlState = readSqlState(error);
  if (sqlState !== undefined && TRANSIENT_SQL_STATES.has(sqlState)) {
    return new TransientDatabaseError(sqlState, error);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && TRANSIENT_PRISMA_CODES.has(error.code)) {
    return new TransientDatabaseError(error.code === 'P2034' ? '40001' : undefined, error);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new TransientDatabaseError(undefined, error);
  }

  return undefined;
}

@Injectable()
export class TransactionRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<DatabaseEnvironmentVariables, true>,
  ) {}

  /**
   * Runs `work` in one interactive Read Committed transaction.
   *
   * - Throwing rolls everything back. To commit a change AND report a failure (for example
   *   revoking a session on refresh-token replay), return the failure as a result instead.
   * - lock_timeout and statement_timeout are set for this transaction only (`set_config(...,
   *   true)`; PostgreSQL does not accept bind parameters in SET). They are lower than
   *   Prisma's transaction timeout so PostgreSQL reports the cause first.
   * - Network calls do not belong in `work`; they run after commit.
   */
  async run<T>(work: (tx: DbTx) => Promise<T>): Promise<T> {
    const lockTimeout = this.config.get('DB_LOCK_TIMEOUT_MS', { infer: true });
    const statementTimeout = this.config.get('DB_STATEMENT_TIMEOUT_MS', { infer: true });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${lockTimeout}ms`}, true), set_config('statement_timeout', ${`${statementTimeout}ms`}, true)`;
          return work(tx);
        },
        {
          timeout: this.config.get('DB_TRANSACTION_TIMEOUT_MS', { infer: true }),
          maxWait: this.config.get('DB_TRANSACTION_MAX_WAIT_MS', { infer: true }),
        },
      );
    } catch (error) {
      throw toTransientError(error) ?? error;
    }
  }
}
