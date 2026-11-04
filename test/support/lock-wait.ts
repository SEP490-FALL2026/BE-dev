import type { Client } from 'pg';

/**
 * Resolves once at least `count` backends of the observer's database are waiting for a lock, so a test that holds a lock
 * in another connection knows the request under test has reached it before the lock is released (a deterministic order,
 * never a sleep). Only the suite's own database counts: integration files run in parallel on one cluster, and a lock
 * wait of another file must never release this barrier.
 */
export async function waitForLockWaiters(
  observer: Client,
  count: number,
  timeoutMs = 10_000,
  waiters: readonly Promise<{ code: number | null; stderr: string }>[] = [],
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // A waiter that ended before the barrier (a lock timeout, a crash) can never be counted: say so at once, with its output.
  let ended: { code: number | null; stderr: string } | null = null;
  for (const waiter of waiters) {
    void waiter.then(
      (result) => (ended ??= result),
      (error: unknown) => (ended ??= { code: null, stderr: String(error) }),
    );
  }
  for (;;) {
    const gone = ended as { code: number | null; stderr: string } | null;
    if (gone)
      throw new Error(`A lock waiter ended before the barrier (exit ${gone.code}): ${gone.stderr.slice(0, 500)}`);
    const { rows } = await observer.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting
         FROM pg_locks l
         JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE NOT l.granted AND a.datname = current_database()`,
    );
    if (rows[0].waiting >= count) return;
    if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
