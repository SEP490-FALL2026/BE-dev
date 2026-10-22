import type { Client } from 'pg';

/**
 * Resolves once at least `count` backends are waiting for a lock, so a test that holds a lock in another connection knows
 * the request under test has reached it before the lock is released (a deterministic order, never a sleep).
 */
export async function waitForLockWaiters(observer: Client, count: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.query<{ waiting: number }>(
      'SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted',
    );
    if (rows[0].waiting >= count) return;
    if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
