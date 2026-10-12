import { Barrier, ConcurrencyHarness } from '../support/concurrency-harness';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

describe('Concurrency harness', () => {
  let database: DisposableDatabase;
  let harness: ConcurrencyHarness;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    harness = await ConcurrencyHarness.connect(database.url);
  });

  afterAll(async () => {
    await harness?.close();
    if (database) await dropDisposableDatabase(database);
  });

  it('two real connections interleave in the same order on every round', async () => {
    const a = await harness.session('A');
    const b = await harness.session('B');

    for (let round = 1; round <= 25; round += 1) {
      const events: string[] = [];

      await a.holdLock(round);
      events.push('A holds');

      const queued = b.queueBehind(round);
      let acquired = false;
      void queued.acquired.then(
        () => {
          acquired = true;
        },
        () => undefined,
      );
      await queued.blocked;
      events.push('B blocked');
      expect(acquired).toBe(false);

      events.push('A releases');
      await a.release();
      await queued.acquired;
      events.push('B acquired');
      await b.release();

      expect(events).toEqual(['A holds', 'B blocked', 'A releases', 'B acquired']);
    }
  });

  it('a request on a free lock is never reported as blocked', async () => {
    const c = await harness.session('C');

    const queued = c.queueBehind(1_000_001);

    await expect(queued.blocked).rejects.toThrow(/acquired a lock it should have waited for/);
    await queued.acquired;
    await c.release();
  });

  it('closes sessions even when a lock request is still waiting', async () => {
    const pending = await ConcurrencyHarness.connect(database.url);
    try {
      const holder = await pending.session('cleanup-holder');
      const waiter = await pending.session('cleanup-waiter');
      await holder.holdLock(2000001);
      const queued = waiter.queueBehind(2000001);
      await queued.blocked;
      await pending.close();
      await Promise.allSettled([queued.acquired]);
    } finally {
      await pending.close();
    }
  });

  it('a barrier opens only once every party has arrived', async () => {
    const barrier = new Barrier(3);
    const order: string[] = [];
    const party = async (name: string): Promise<void> => {
      order.push(`${name} before`);
      await barrier.wait();
      order.push(`${name} after`);
    };

    await Promise.all([party('a'), party('b'), party('c')]);

    expect(order.slice(0, 3).every((entry) => entry.endsWith('before'))).toBe(true);
    expect(order.slice(3).every((entry) => entry.endsWith('after'))).toBe(true);
    expect(() => barrier.wait()).toThrow(/reached by 4 parties/);
  });
});
