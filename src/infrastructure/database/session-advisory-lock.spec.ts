import { Client } from 'pg';
import { trySessionAdvisoryLock } from './session-advisory-lock';

/**
 * Unit tests of the session lock without a database: `pg` is replaced by a client whose answers each test chooses. What matters is
 * what `release` does when the connection that holds the lock has broken: the caller is told, and the connection is closed anyway.
 */
jest.mock('pg', () => ({ Client: jest.fn() }));

interface FakeClient {
  on: jest.Mock;
  connect: jest.Mock;
  query: jest.Mock;
  end: jest.Mock;
}

/** A client that takes the lock (`locked`) or finds it held, and answers the unlock as `unlock` says. */
function fakeClient(options: { locked: boolean; unlock?: () => Promise<unknown> }): FakeClient {
  const client: FakeClient = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    query: jest.fn((sql: string) =>
      sql.includes('pg_try_advisory_lock')
        ? Promise.resolve({ rows: [{ locked: options.locked }] })
        : (options.unlock ?? (() => Promise.resolve({ rows: [] })))(),
    ),
    end: jest.fn().mockResolvedValue(undefined),
  };
  (Client as unknown as jest.Mock).mockImplementation(() => client);

  return client;
}

const take = () => trySessionAdvisoryLock('postgresql://slm@localhost/db', 'demo-dataset:shared-demo-v1');

describe('trySessionAdvisoryLock', () => {
  afterEach(() => jest.clearAllMocks());

  it('gives back null, and closes its connection, when another session holds the lock', async () => {
    const client = fakeClient({ locked: false });

    await expect(take()).resolves.toBeNull();
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('unlocks and closes the connection on release, once however many times it is called', async () => {
    const client = fakeClient({ locked: true });
    const held = await take();

    await held?.release();
    await held?.release();

    expect(client.query).toHaveBeenCalledTimes(2); // the lock, then the one unlock
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('rejects on release when the connection that holds the lock has broken, and still closes it', async () => {
    const client = fakeClient({
      locked: true,
      unlock: () => Promise.reject(new Error('Connection terminated unexpectedly')),
    });
    const held = await take();

    await expect(held?.release()).rejects.toThrow('Connection terminated unexpectedly');
    expect(client.end).toHaveBeenCalledTimes(1);
    // A second release does nothing more: the connection is already closed and the failure was reported once.
    await expect(held?.release()).resolves.toBeUndefined();
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('rejects with the unlock failure even when closing the connection fails too', async () => {
    const client = fakeClient({ locked: true, unlock: () => Promise.reject(new Error('Client was closed')) });
    client.end.mockRejectedValue(new Error('already ended'));
    const held = await take();

    await expect(held?.release()).rejects.toThrow('Client was closed');
  });
});
