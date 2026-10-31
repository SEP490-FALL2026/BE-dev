import { Prisma } from '../../generated/prisma/client';
import { TransientDatabaseError } from '../../infrastructure/database/transaction-runner';
import { errorName } from '../run-command';

/**
 * The fixed messages node-postgres writes for a connection that is silent, ended or broken: they name no host, user or
 * value, so a report may carry them as they are. Any other message is never printed.
 */
const PG_FIXED_MESSAGES: ReadonlySet<string> = new Set([
  'Query read timeout',
  'Connection terminated due to connection timeout',
  'Connection terminated unexpectedly',
  'Connection terminated',
  'timeout exceeded when trying to connect',
  'Client was closed and is not queryable',
  'Client has encountered a connection error and is not queryable',
]);

/** A socket error code (`ECONNRESET`…), a SQLSTATE (`57014`) or a Prisma code (`P2028`): codes, never values. */
const SAFE_CODE = /^(?:E[A-Z]+|[0-9A-Z]{5}|P\d{4})$/;

/**
 * Why the database failed, as a short tag an operator can act on (A-04: a failure reported by its name alone could not
 * be told apart, a transaction over its time budget from a connection that stopped answering). Only a SQLSTATE, a Prisma
 * code, a socket error code or a fixed node-postgres message: never a URL, a value, a query or a stack. Null when the
 * error is not a database failure it recognises.
 */
export function databaseCauseOf(error: unknown): string | null {
  if (error instanceof TransientDatabaseError) {
    const inner = codeOf(error.reason);
    if (inner) return inner;
    return error.sqlState && SAFE_CODE.test(error.sqlState) ? error.sqlState : 'unclassified';
  }

  return codeOf(error);
}

function codeOf(error: unknown): string | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return prismaCodeOf(error);
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return error.errorCode ?? 'PrismaClientInitializationError';
  }

  return error instanceof Error ? driverCodeOf(error) : null;
}

/** The Prisma code, with the SQLSTATE the driver adapter nested in it when there is one (`P2010 57014`). */
function prismaCodeOf(error: Prisma.PrismaClientKnownRequestError): string {
  const meta = error.meta as
    { driverAdapterError?: { cause?: { originalCode?: unknown; code?: unknown } } } | undefined;
  const cause = meta?.driverAdapterError?.cause;
  const state = cause?.originalCode ?? cause?.code;

  return typeof state === 'string' && SAFE_CODE.test(state) ? `${error.code} ${state}` : error.code;
}

/** A socket error code, or a fixed node-postgres message; null for anything else. */
function driverCodeOf(error: Error): string | null {
  const code = (error as { code?: unknown }).code;
  if (typeof code === 'string' && SAFE_CODE.test(code)) return code;

  return PG_FIXED_MESSAGES.has(error.message) ? error.message : null;
}

/** The one line of a run that failed outside its steps: the error's name, with its database cause when there is one. */
export function failureLine(error: unknown): string {
  const cause = databaseCauseOf(error);

  return `The demo dataset run failed: ${errorName(error)}${cause ? ` [${cause}]` : ''}`;
}
