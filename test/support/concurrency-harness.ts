import { Client } from 'pg';

/**
 * Deterministic interleaving of real PostgreSQL connections. Nothing here guesses with a fixed
 * delay: a session is "blocked" only when pg_locks says its lock request is waiting, and a
 * barrier opens only when every party has arrived. The polling loop in waitUntilBlocked ends the
 * moment the condition holds and fails loudly after a deadline.
 */

export class Barrier {
  private arrived = 0;
  private open!: () => void;
  private readonly gate = new Promise<void>((resolve) => {
    this.open = resolve;
  });

  constructor(private readonly parties: number) {
    if (!Number.isInteger(parties) || parties < 1) throw new Error('A barrier needs at least one party.');
  }

  /** Resolves for every party once the last one has called wait(). Single use. */
  wait(): Promise<void> {
    this.arrived += 1;
    if (this.arrived > this.parties)
      throw new Error(`Barrier of ${this.parties} was reached by ${this.arrived} parties.`);
    if (this.arrived === this.parties) this.open();
    return this.gate;
  }
}

export interface QueuedLock {
  /** Resolves when pg_locks shows this session waiting for the lock; it has not acquired it. */
  blocked: Promise<void>;
  /** Resolves when the lock is finally granted (after the holder released). */
  acquired: Promise<void>;
}

export class LockSession {
  private constructor(
    readonly name: string,
    readonly pid: number,
    private readonly client: Client,
    private readonly observer: Client,
  ) {}

  /** `observer` is a third connection used only to read pg_locks. */
  static async open(url: string, name: string, observer: Client): Promise<LockSession> {
    const client = new Client({ connectionString: url, application_name: `harness:${name}` });
    await client.connect();
    const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    return new LockSession(name, rows[0].pid, client, observer);
  }

  /** Takes a transaction-scoped advisory lock and returns once it is held. */
  async holdLock(key: number): Promise<void> {
    await this.client.query('BEGIN');
    await this.client.query('SELECT pg_advisory_xact_lock($1)', [key]);
  }

  /** Starts requesting the lock without waiting for it. */
  queueBehind(key: number): QueuedLock {
    let finished = false;
    const acquired = (async () => {
      try {
        await this.client.query('BEGIN');
        await this.client.query('SELECT pg_advisory_xact_lock($1)', [key]);
      } finally {
        finished = true;
      }
    })();
    // A failed request is reported through `acquired`; keep it from also being an unhandled rejection.
    acquired.catch(() => undefined);

    const blocked = (async () => {
      await this.waitUntilBlocked(() => finished);
      if (finished) throw new Error(`${this.name} acquired a lock it should have waited for.`);
    })();
    blocked.catch(() => undefined);
    return { blocked, acquired };
  }

  /** Commits, which releases every transaction-scoped lock this session holds. */
  async release(): Promise<void> {
    await this.client.query('COMMIT');
  }

  async close(): Promise<void> {
    await this.client.end();
  }

  private async waitUntilBlocked(stop: () => boolean, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!stop()) {
      const { rows } = await this.observer.query<{ waiting: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM pg_locks WHERE pid = $1 AND NOT granted) AS waiting',
        [this.pid],
      );
      if (rows[0].waiting) return;
      if (Date.now() > deadline) throw new Error(`${this.name} never reached a lock wait within ${timeoutMs} ms.`);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}

export class ConcurrencyHarness {
  private readonly sessions: LockSession[] = [];
  private constructor(
    private readonly url: string,
    private readonly observer: Client,
  ) {}

  static async connect(url: string): Promise<ConcurrencyHarness> {
    const observer = new Client({ connectionString: url, application_name: 'harness:observer' });
    await observer.connect();
    return new ConcurrencyHarness(url, observer);
  }

  async session(name: string): Promise<LockSession> {
    const session = await LockSession.open(this.url, name, this.observer);
    this.sessions.push(session);
    return session;
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.sessions.map((session) => session.close()));
    await this.observer.end();
  }
}
