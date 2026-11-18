import { EventEmitter } from 'node:events';
import { Client, Pool } from 'pg';

/**
 * The upgrade contract: the release guard of `createPostgresPool` relies on two behaviours of the locked
 * `pg` 8.23 / `pg-pool` 3.14 that are not a documented API (pg-pool marks them "TODO: expose a proper, public
 * interface"). The versions are not pinned: CI and the image install `--frozen-lockfile`, so a newer pg or pg-pool only
 * arrives with a lockfile change, and these tests (with the integration suite `pg-pool.integration-spec.ts`, I1/I11) are
 * what such a change must keep green.
 */
describe('pg and pg-pool behaviours the release guard relies on', () => {
  it('pg Client.end() marks the client as ending, even when it never connected', async () => {
    const client = new Client({ connectionString: 'postgresql://u:p@127.0.0.1:1/none' });

    await client.end();

    expect((client as unknown as { _ending: boolean })._ending).toBe(true);
  });

  it('pg-pool emits release before it decides to keep the client, and drops one that is ending by then', async () => {
    class FakeClient extends EventEmitter {
      _queryable = true;
      _ending = false;
      connect(callback: (error?: Error) => void): void {
        setImmediate(() => callback());
      }
      end(callback?: () => void): Promise<void> {
        this._ending = true;
        callback?.();
        return Promise.resolve();
      }
    }
    const pool = new Pool({ Client: FakeClient as unknown as typeof Client, max: 1 });
    const order: string[] = [];
    // What RetireOnTimeoutClient.retire() does from the guard: end the client while pg-pool is releasing it.
    pool.on('release', (_error, released) => {
      order.push('release');
      void (released as unknown as FakeClient).end();
    });
    pool.on('remove', () => order.push('remove'));

    const client = await pool.connect();
    client.release();

    expect(order).toEqual(['release', 'remove']);
    expect({ total: pool.totalCount, idle: pool.idleCount }).toEqual({ total: 0, idle: 0 });
    await pool.end();
  });

  it('pg Client keeps getTransactionStatus(), the public read the guard uses', () => {
    expect(typeof Client.prototype.getTransactionStatus).toBe('function');
  });
});
