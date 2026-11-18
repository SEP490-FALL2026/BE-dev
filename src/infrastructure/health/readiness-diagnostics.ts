/**
 * What a failed readiness check says in the log: which dependency failed, the class and the code of the error and the status of
 * the answer. Never the stack, a message or the body of the answer: they can carry a host name, a role, a connection string or a
 * secret, and a log is read by more people than the database is. Every value is kept only when it has the shape of an identifier and
 * the list is bounded: what is written is short identifier-shaped text, so it cannot carry a message, a host or a connection string.
 */
export interface ReadinessDiagnostic {
  /** The class of the error. */
  error: string;
  /** The HTTP status the error carries, when it is an HTTP exception. */
  statusCode: number | null;
  /** A short machine code of the error or of its cause (01`, `ECONNREFUSED`, a SQLSTATE), when it has one. */
  code: string | null;
  /** The names of the dependencies that reported themselves down. */
  failed: string[];
}

const NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,59}$/;
const CODE = /^[A-Z0-9_]{2,32}$/;
const MAX_FAILED = 8;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const codeOf = (value: unknown): string | null => {
  const code = record(value)?.code;

  return typeof code === 'string' && CODE.test(code) ? code : null;
};

/** The answer a failed check carries: an HTTP exception gives it with `getResponse`, other errors may hold it as `response`. */
function responseOf(error: unknown): Record<string, unknown> | null {
  const holder = record(error);
  if (holder === null) return null;
  const answer = typeof holder.getResponse === 'function' ? (holder.getResponse as () => unknown)() : holder.response;

  return record(answer);
}

const UNKNOWN: ReadinessDiagnostic = Object.freeze({ error: 'Error', statusCode: null, code: null, failed: [] });

/** Never throws: it runs inside the `catch` of the readiness check, and an error it cannot read must not replace the answer 503. */
export function readinessDiagnostic(error: unknown): ReadinessDiagnostic {
  try {
    const holder = record(error);
    const name = error instanceof Error ? error.name : '';
    const status = typeof holder?.getStatus === 'function' ? (holder.getStatus as () => unknown)() : null;
    const down = record(responseOf(error)?.error);

    return {
      error: NAME.test(name) ? name : 'Error',
      statusCode: typeof status === 'number' && Number.isInteger(status) ? status : null,
      code: codeOf(error) ?? codeOf(holder?.cause),
      failed: Object.keys(down ?? {})
        .filter((key) => NAME.test(key))
        .slice(0, MAX_FAILED),
    };
  } catch {
    return { ...UNKNOWN, failed: [] };
  }
}
