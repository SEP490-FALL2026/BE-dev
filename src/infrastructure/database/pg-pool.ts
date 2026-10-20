import { Client, type ClientConfig, Pool, type PoolConfig } from 'pg';

/** What node-postgres reports when `query_timeout` fires (pg 8.23, lib/client.js). */
const CLIENT_QUERY_TIMEOUT = 'Query read timeout';

type QueryCallback = (error: Error | null, result?: unknown) => void;

const isReadTimeout = (error: unknown): boolean => error instanceof Error && error.message === CLIENT_QUERY_TIMEOUT;

/**
 * A query form the pooled client cannot observe. It is a programming error (not a database
 * condition), so it is deliberately not one of the messages `toTransientError` maps to a 503.
 */
export class UnsupportedQueryFormError extends TypeError {
  constructor() {
    super(
      'Unsupported pg query form for the pooled client: Submittable objects, config.callback, a double callback and pipeline mode are refused (N-1)',
    );
    this.name = 'UnsupportedQueryFormError';
  }
}

/**
 * INTERNAL: the client class of the pool built by `createPostgresPool`; nothing else should construct it.
 *
 * It takes itself out of service as soon as one of its queries hits the client-side `query_timeout`.
 * pg only rejects the call when that timer fires: the statement stays active on the connection and an
 * open transaction stays open. The Prisma adapter then releases the connection to the pool without an
 * error, and the next request would run - and commit - inside that transaction (review N-1).
 * `end()` on a connection with an active query destroys the socket (non-pipeline branch of
 * `Client.end`), so PostgreSQL rolls the transaction back as soon as it reads again, and pg-pool drops
 * an ending connection on release instead of reusing it.
 *
 * Contract. It accepts exactly:
 * - `query(text | config [, values])`, which returns a Promise;
 * - `query(text | config, [values | undefined,] callback)`, with the callback found by pg's own rule
 *   (the third argument if it is a function, else the second).
 * Everything else cannot be observed and is refused with `UnsupportedQueryFormError`, synchronously,
 * before pg sees it: a Submittable (`pg.Query` included), a config object with a `callback` property,
 * a callback in both the second and the third position, and (in the constructor) `pipeline: true` or a
 * custom `Promise`. The Prisma adapter uses none of those. A null query and a non-function callback are
 * left to pg's own TypeErrors.
 */
export class RetireOnTimeoutClient extends Client {
  private retired = false;

  constructor(config?: string | ClientConfig) {
    // Refused before pg sees the configuration (INF.1 / F-30): pg itself warns that a custom Promise is deprecated, and
    // pipelined queries survive end() until they drain while a custom Promise breaks the .then below.
    const options = (typeof config === 'object' ? config : undefined) as
      { pipeline?: unknown; Promise?: unknown } | undefined;
    if (options?.pipeline || options?.Promise) throw new UnsupportedQueryFormError();
    super(config);

    const query = super.query.bind(this) as (...args: unknown[]) => unknown;
    // An own property wraps the accepted forms (see the class doc) and refuses the rest.
    this.query = ((...args: unknown[]): unknown => {
      const [first, second, third] = args;
      if (
        typeof (first as { submit?: unknown } | null)?.submit === 'function' ||
        (typeof first === 'object' && first !== null && (first as { callback?: unknown }).callback !== undefined) ||
        (typeof second === 'function' && third !== undefined)
      ) {
        throw new UnsupportedQueryFormError();
      }

      const position = typeof third === 'function' ? 2 : typeof second === 'function' ? 1 : -1;
      if (position === -1) {
        const result = query(...args);
        if (!(result instanceof Promise)) return result;
        return result.then(undefined, (error: unknown) => {
          if (isReadTimeout(error)) this.retire();
          throw error;
        });
      }

      const callback = args[position] as QueryCallback;
      args[position] = (error: Error | null, result?: unknown): void => {
        if (isReadTimeout(error)) this.retire();
        callback(error, result);
      };
      // pg stores the callback on a config object it is given; a copy keeps the caller's object reusable.
      if (typeof first === 'object' && first !== null) args[0] = { ...first };
      return query(...args);
    }) as Client['query'];
  }

  /** Called once when this connection retires itself; the pool factory wires it to a log. */
  protected onRetired(): void {}

  /** True once this connection has been taken out of service. */
  get isRetired(): boolean {
    return this.retired;
  }

  /**
   * INTERNAL (the pool's release guard and this class's timeout path): ends the connection so the pool
   * removes it instead of reusing it, then runs the hook. Idempotent. `end()` comes first and neither
   * step can stop the other or replace the error the caller is about to receive.
   */
  retire(): void {
    if (this.retired) return;
    this.retired = true;
    try {
      void this.end().catch(() => undefined);
    } catch {
      /* the connection is being abandoned either way */
    }
    try {
      this.onRetired();
    } catch {
      /* the hook can neither block end() nor replace the error */
    }
  }
}

/** The pool behind Prisma: same settings as before, with connections that retire on a client-side timeout. */
export function createPostgresPool(config: PoolConfig, hooks: { onRetire?: () => void } = {}): Pool {
  class PooledClient extends RetireOnTimeoutClient {
    protected override onRetired(): void {
      hooks.onRetire?.();
    }
  }

  const pool = new Pool({ ...config, Client: PooledClient });
  // Defence in depth, whatever the cause: a connection handed back while a transaction is still open (or
  // failed) would let the next caller commit someone else's statements. pg-pool 3.14 emits 'release' before
  // it decides whether to keep the client (index.js `_release`: emit, then `client._ending` => remove), so a
  // client that is ending here is removed instead of reused. With an error the pool removes it itself.
  pool.on('release', (error, client) => {
    try {
      if (!error && client.getTransactionStatus() !== 'I') (client as unknown as RetireOnTimeoutClient).retire();
    } catch {
      /* never break the release */
    }
  });
  return pool;
}
