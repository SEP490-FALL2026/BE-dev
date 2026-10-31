import { JsonColumnShapeError } from '../database/json-column.errors';
import { TransientDatabaseError, readSqlState, toTransientError } from '../database/transaction-runner';

export interface OperatorErrorOptions {
  /** Append the frames of the stack. Only for an error nobody expected; the line alone is enough for the rest. */
  stack?: boolean;
}

/** A class name, a Prisma code, a SQLSTATE or a socket code: short, and never free text. */
const IDENTIFIER = /^[A-Za-z_$][\w$.]{0,79}$/;
const CODE = /^[A-Z0-9_]{2,16}$/;

/** The class name of an error, or its type when something else was thrown; a name that is not an identifier is not trusted. */
function nameOf(value: unknown): string {
  if (!(value instanceof Error)) return `NonError(${value === null ? 'null' : typeof value})`;

  return IDENTIFIER.test(value.name) ? value.name : 'Error';
}

/** The Prisma code, the SQLSTATE of a pg error or the code of a socket error, when the value carries one. */
function codeOf(value: unknown): string | undefined {
  const code = (value as { code?: unknown } | null | undefined)?.code;

  return typeof code === 'string' && CODE.test(code) ? code : undefined;
}

/** The error under a `TransientDatabaseError` is its `reason`; any other error keeps its own `cause`. */
function underlyingOf(error: unknown): unknown {
  if (error instanceof TransientDatabaseError) return error.reason;

  return error instanceof Error ? error.cause : undefined;
}

/** `table.column` of a JSON column that held a value of the wrong shape: names a place in the schema, never what was in it. */
function columnOf(error: unknown): string | undefined {
  return error instanceof JsonColumnShapeError ? `${error.table}.${error.column}` : undefined;
}

/** `key=value` for a part of the line that is there, nothing for one that is not. */
const pair = (key: string, value: string | undefined): string | undefined =>
  value === undefined ? undefined : `${key}=${value}`;

/** True when waiting and trying again can help: the database or a network connection was unavailable, not the data wrong. */
function isRetryable(error: unknown): boolean {
  return error instanceof TransientDatabaseError || toTransientError(error) !== undefined;
}

/**
 * The frames of the stack, without the first lines V8 writes from the name and the message: the message of an unexpected error can
 * carry a connection string or an address, and a log is not the place for either. The header is cut after the message as it stood
 * when the stack was taken (a class that sets `this.name` after `super()` has the base name there, so the name is not used), and
 * nothing is returned when the message cannot be found in the stack.
 */
function framesOf(error: Error): string | undefined {
  const stack = error.stack;
  if (stack === undefined) return undefined;
  const start = error.message === '' ? 0 : stack.indexOf(error.message);
  if (start === -1) return undefined;
  const rest = stack.slice(start + error.message.length);
  const newline = rest.indexOf('\n');

  return newline === -1 || newline === rest.length - 1 ? undefined : rest.slice(newline + 1);
}

/**
 * What an operator needs to read in a log about a failed pass: the kind of error, the Prisma code or SQLSTATE, the `table.column` of a
 * JSON column of the wrong shape, whether trying again can help, and the kind of the error underneath (one level). Never the message
 * of the error, which may carry a name, an address or a secret: the same words in a business error already reach the caller as a
 * stable code. A thrown value that is not an Error is described by its type alone.
 *
 * `{ stack: true }` adds the frames on the next lines (see `framesOf`), for an error nobody expected.
 */
export function describeForOperator(error: unknown, options: OperatorErrorOptions = {}): string {
  const underlying = underlyingOf(error);
  const code = codeOf(error instanceof TransientDatabaseError ? error.reason : error);
  const sqlState = error instanceof TransientDatabaseError ? error.sqlState : readSqlState(error);
  const parts = [
    nameOf(error),
    pair('code', code),
    pair('sqlState', sqlState),
    pair('column', columnOf(error)),
    `retryable=${isRetryable(error)}`,
    pair('cause', underlying === undefined ? undefined : nameOf(underlying)),
  ];
  const line = parts.filter((part) => part !== undefined).join(' ');
  const frames = options.stack && error instanceof Error ? framesOf(error) : undefined;

  return frames === undefined ? line : `${line}\n${frames}`;
}

/**
 * The trace argument of `logger.error(line, trace)` for a failed pass: the frames of an error that is not just a database being
 * unavailable, so whoever reads the log can find where it came from. Nothing for a retryable failure (the line says it can be tried
 * again) and nothing for a value that is not an Error. The frames carry no message, so a declared business error that reaches a
 * log leaks no more than its name.
 */
export function traceForOperator(error: unknown): string | undefined {
  if (!(error instanceof Error) || isRetryable(error)) return undefined;

  return framesOf(error);
}
