import { setTimeout as sleep } from 'node:timers/promises';
import { Query, type Pool } from 'pg';
import { RetireOnTimeoutClient, UnsupportedQueryFormError, createPostgresPool } from './pg-pool';
import { toTransientError } from './transaction-runner';

/**
 * Unit tests of the retire-on-timeout client without a database: a client that never connects keeps
 * its queries queued, so pg's own `query_timeout` timer fires exactly as it does against a silent server.
 */
const TIMEOUT = 'Query read timeout';
const CLOSED = 'Client was closed and is not queryable';
const QUERY_TIMEOUT_MS = 20;
const SETTLE_MS = 80; // longer than the query timeout, so a timer that should not fire would have fired

type AnyQuery = (...args: unknown[]) => unknown;

class TestClient extends RetireOnTimeoutClient {
  hook: () => void = () => undefined;
  protected override onRetired(): void {
    this.hook();
  }
}

/** The loosest call signature: these tests deliberately pass forms the typed overloads do not allow. */
const call = (client: RetireOnTimeoutClient, ...args: unknown[]): unknown =>
  (client.query as unknown as AnyQuery)(...args);

const loose = (config: Record<string, unknown>): never => config as never;

describe('RetireOnTimeoutClient', () => {
  // An unhandled rejection or uncaught exception raised during a test fails that test: Jest (jest-circus)
  // handles them on the real process, so no listener is needed here (a listener on the sandboxed `process` never fires).
  let events: string[];

  /** An unconnected client with `end` and the retire hook recorded in `events`. */
  const build = (): { client: TestClient; end: jest.Mock | jest.SpyInstance } => {
    const client = new TestClient({ query_timeout: QUERY_TIMEOUT_MS });
    const end = jest.fn(() => {
      events.push('end');
      return Promise.resolve();
    });
    client.end = end;
    client.hook = () => void events.push('hook');
    return { client, end };
  };

  /** A client that was really ended (it never connected, so this is immediate): later queries are refused. */
  const buildEnded = async (): Promise<{ client: TestClient; end: jest.Mock | jest.SpyInstance }> => {
    const client = new TestClient({ query_timeout: QUERY_TIMEOUT_MS });
    await client.end();
    const end = jest.spyOn(client, 'end');
    client.hook = () => void events.push('hook');
    return { client, end };
  };

  const hookCount = (): number => events.filter((event) => event === 'hook').length;

  beforeEach(() => {
    events = [];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Promise form', () => {
    it.each([
      ['text', ['SELECT 1']],
      ['text and values', ['SELECT $1::int', [1]]],
      [
        'the shape the Prisma adapter sends',
        [
          {
            name: undefined,
            text: 'SELECT 1',
            values: [],
            rowMode: 'array',
            types: { getTypeParser: () => (v: string) => v },
          },
        ],
      ],
    ])('retires the client when %s times out: end first, then the hook, then the caller', async (_label, args) => {
      const { client, end } = build();

      const error = await (call(client, ...(args as unknown[])) as Promise<unknown>).catch((e: unknown) => {
        events.push('caller');
        return e;
      });

      expect((error as Error).message).toBe(TIMEOUT);
      expect(end).toHaveBeenCalledTimes(1);
      expect(events).toEqual(['end', 'hook', 'caller']);
    });

    // One query at a time, as the Prisma adapter sends them; pg deprecates queueing a second query on a
    // client that is still running one, and nothing in production does.
    it('retires once when two queries in turn both time out, and each caller gets its own error', async () => {
      const { client, end } = build();

      const a = await (call(client, 'SELECT 1') as Promise<unknown>).catch((e: unknown) => e);
      const b = await (call(client, 'SELECT 2') as Promise<unknown>).catch((e: unknown) => e);

      expect((a as Error).message).toBe(TIMEOUT);
      expect((b as Error).message).toBe(TIMEOUT);
      expect(a).not.toBe(b);
      expect(end).toHaveBeenCalledTimes(1);
      expect(hookCount()).toBe(1);
    });

    it('does not retire for an error that is not the read timeout', async () => {
      const { client, end } = await buildEnded();

      const error = await (call(client, 'SELECT 1') as Promise<unknown>).catch((e: unknown) => e);

      expect((error as Error).message).toBe(CLOSED);
      await sleep(SETTLE_MS);
      expect(end).not.toHaveBeenCalled();
      expect(hookCount()).toBe(0);
    });
  });

  describe('callback form', () => {
    it.each([
      ['(text, values, callback)', (cb: unknown) => ['SELECT $1::int', [1], cb]],
      ['(config, undefined, callback)', (cb: unknown) => [{ text: 'SELECT 1' }, undefined, cb]],
      ['(text, callback)', (cb: unknown) => ['SELECT 1', cb]],
      ['(text, callback, undefined)', (cb: unknown) => ['SELECT 1', cb, undefined]],
    ])('retires the client on a timeout, before the caller callback: %s', async (_label, argsFor) => {
      const { client, end } = build();
      const received = new Promise<unknown[]>((resolve) => {
        const callback = (...values: unknown[]): void => {
          events.push('callback');
          resolve(values);
        };
        expect(call(client, ...argsFor(callback))).toBeUndefined();
      });

      const [error, result] = await received;

      expect((error as Error).message).toBe(TIMEOUT);
      expect(result).toBeUndefined();
      await sleep(SETTLE_MS);
      expect(end).toHaveBeenCalledTimes(1);
      expect(events).toEqual(['end', 'hook', 'callback']);
    });

    it('leaves the config object reusable: pg would store the callback on it, and a stale one is refused', async () => {
      const { client } = build();
      const config = { text: 'SELECT 1' };

      const first = await new Promise<unknown>((resolve) =>
        call(client, config, undefined, (e: unknown) => resolve(e)),
      );
      const second = await new Promise<unknown>((resolve) =>
        call(client, config, undefined, (e: unknown) => resolve(e)),
      );

      expect((first as Error).message).toBe(TIMEOUT);
      expect((second as Error).message).toBe(TIMEOUT);
      expect(config).toEqual({ text: 'SELECT 1' });
    });

    it('does not retire for an error that is not the read timeout', async () => {
      const { client, end } = await buildEnded();
      const received = new Promise<unknown>((resolve) => call(client, 'SELECT 1', (e: unknown) => resolve(e)));

      expect(((await received) as Error).message).toBe(CLOSED);
      await sleep(SETTLE_MS);
      expect(end).not.toHaveBeenCalled();
      expect(hookCount()).toBe(0);
    });
  });

  describe('forms that are refused (nothing is queued, nothing is retired)', () => {
    const submit = jest.fn();
    const refused: Array<[string, (callback: () => void) => unknown[]]> = [
      ['a pg.Query with a callback', (cb) => [new Query('SELECT 1', cb)]],
      ['a pg.Query', () => [new Query('SELECT 1')]],
      ['a Submittable', () => [{ submit }]],
      ['a config object with a callback property', (cb) => [{ text: 'SELECT 1', callback: cb }]],
      ['a double callback', (cb) => ['SELECT 1', cb, () => undefined]],
    ];

    it.each(refused)('throws UnsupportedQueryFormError synchronously for %s', async (_label, argsFor) => {
      const { client, end } = build();
      const callback = jest.fn();
      let thrown: unknown;
      try {
        call(client, ...argsFor(callback));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(UnsupportedQueryFormError);
      expect(thrown).toBeInstanceOf(TypeError);
      expect((thrown as Error).name).toBe('UnsupportedQueryFormError');
      expect((thrown as Error).message).toBe(
        'Unsupported pg query form for the pooled client: Submittable objects, config.callback, a double callback and pipeline mode are refused (N-1)',
      );
      // A programming error, never a retryable 503.
      expect(toTransientError(thrown)).toBeUndefined();
      await sleep(SETTLE_MS);
      expect(submit).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
      expect(end).not.toHaveBeenCalled();
      expect(hookCount()).toBe(0);
    });

    it('refuses pipeline mode and a custom Promise in the constructor', () => {
      expect(() => new RetireOnTimeoutClient(loose({ pipeline: true }))).toThrow(UnsupportedQueryFormError);
      expect(() => new RetireOnTimeoutClient(loose({ Promise }))).toThrow(UnsupportedQueryFormError);
    });
  });

  describe('a failing end() or hook can neither skip the retirement nor replace the error', () => {
    const expectOriginalAndQuiet = async (error: unknown): Promise<void> => {
      expect((error as Error).message).toBe(TIMEOUT);
      await sleep(SETTLE_MS); // long enough for a floating rejection to surface and fail the test
    };

    const throwingHook = (client: TestClient): void => {
      client.hook = () => {
        events.push('hook');
        throw new Error('hook failed');
      };
    };

    it('still ends the client and reports the timeout when the hook throws (Promise form)', async () => {
      const { client, end } = build();
      throwingHook(client);

      await expectOriginalAndQuiet(await (call(client, 'SELECT 1') as Promise<unknown>).catch((e: unknown) => e));
      expect(end).toHaveBeenCalledTimes(1);
      expect(hookCount()).toBe(1);
    });

    it('still ends the client and calls the callback when the hook throws (callback form)', async () => {
      const { client, end } = build();
      throwingHook(client);
      const error = await new Promise<unknown>((resolve) => call(client, 'SELECT 1', (e: unknown) => resolve(e)));

      await expectOriginalAndQuiet(error);
      expect(end).toHaveBeenCalledTimes(1);
      expect(hookCount()).toBe(1);
    });

    it.each([
      [
        'throws synchronously',
        (): never => {
          throw new Error('end failed');
        },
      ],
      ['rejects', (): Promise<void> => Promise.reject(new Error('end failed'))],
    ])('reports the timeout (both forms) when end() %s', async (_label, implementation) => {
      const { client, end } = build();
      end.mockImplementation(implementation as never);

      const promised = await (call(client, 'SELECT 1') as Promise<unknown>).catch((e: unknown) => e);
      await expectOriginalAndQuiet(promised);
      expect(hookCount()).toBe(1); // the hook still runs, once

      const second = build();
      second.end.mockImplementation(implementation as never);
      const called = await new Promise<unknown>((resolve) =>
        call(second.client, 'SELECT 2', (e: unknown) => resolve(e)),
      );
      await expectOriginalAndQuiet(called);
      expect(hookCount()).toBe(2);
    });
  });
});

describe('createPostgresPool release guard', () => {
  let pool: Pool;

  beforeEach(() => {
    pool = createPostgresPool({ connectionString: 'postgresql://u:p@127.0.0.1:1/none' });
  });

  afterEach(async () => {
    await pool.end();
  });

  const fakeClient = (status: () => unknown): { getTransactionStatus: () => unknown; retire: jest.Mock } => ({
    getTransactionStatus: status,
    retire: jest.fn(),
  });

  it.each([
    'T', // in a transaction
    'E', // in a failed transaction
    null, // unknown
  ])('retires a released client whose transaction status is %p', (status) => {
    const client = fakeClient(() => status);
    pool.emit('release', undefined, client);
    expect(client.retire).toHaveBeenCalledTimes(1);
  });

  it('leaves an idle client alone', () => {
    const client = fakeClient(() => 'I');
    pool.emit('release', undefined, client);
    expect(client.retire).not.toHaveBeenCalled();
  });

  it('leaves a client released with an error to the pool, which removes it itself', () => {
    const client = fakeClient(() => 'T');
    pool.emit('release', new Error('failed'), client);
    expect(client.retire).not.toHaveBeenCalled();
  });

  it('never breaks the release when the status cannot be read or retiring throws', () => {
    const unreadable = fakeClient(() => {
      throw new Error('boom');
    });
    const failing = fakeClient(() => 'T');
    failing.retire.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(() => pool.emit('release', undefined, unreadable)).not.toThrow();
    expect(() => pool.emit('release', undefined, failing)).not.toThrow();
  });
});
