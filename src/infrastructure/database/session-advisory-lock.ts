import { Client } from 'pg';

/** A lock held by a connection of its own; `release` gives it back and closes that connection (idempotent). */
export interface HeldSessionLock {
  release(): Promise<void>;
}

/**
 * Takes a PostgreSQL session advisory lock without waiting, on a dedicated connection that holds it for as long as the
 * caller works, however long that is and whatever else it does meanwhile (an operator command that spends minutes on HTTP
 * calls cannot hold a transaction open: `idle_in_transaction_session_timeout` would end it). Null when another session
 * holds the lock. The server releases the lock when the connection ends, so a process that dies leaves no stale lock.
 * The lock spans one database: it keeps two runs on the same database apart, not two databases.
 */
export async function trySessionAdvisoryLock(
  connectionString: string,
  name: string,
  options: { connectTimeoutMs?: number } = {},
): Promise<HeldSessionLock | null> {
  const client = new Client({
    connectionString,
    options: '-c TimeZone=UTC',
    connectionTimeoutMillis: options.connectTimeoutMs ?? 10_000,
    keepAlive: true,
  });
  // A connection that breaks while idle must not crash the process: the lock is gone with it, the caller finds out on
  // its next database call.
  client.on('error', () => undefined);
  await client.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [name],
    );
    locked = result.rows[0]?.locked === true;
  } finally {
    if (!locked) await client.end().catch(() => undefined);
  }
  if (!locked) return null;

  let released = false;
  return {
    // Rejects when the unlock fails, which means the holding connection broke: the server dropped the session and the lock
    // with it, and the caller must hear that exclusivity was lost. The connection is closed either way, so a failed unlock
    // cannot leave the lock held. Keeping the caller's own result (a whole report) out of the way of that error is the
    // caller's job, not this function's (`runDemoDataset`, phase `lock-release`).
    release: async () => {
      if (released) return;
      released = true;
      try {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [name]);
      } finally {
        await client.end().catch(() => undefined);
      }
    },
  };
}
