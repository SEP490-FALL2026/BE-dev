import { Client } from 'pg';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { prismaProcessesStarted, runningMigrations } from '../support/migration-deploy';
import { PgRelay } from '../support/pg-relay';

/** The committed schema as a comparable string: migration history and the catalog of `public`. */
async function schemaOf(url: string): Promise<string> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const parts = await Promise.all(
      [
        `SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NULL AS live,
                applied_steps_count FROM _prisma_migrations ORDER BY migration_name`,
        `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
          WHERE table_schema = 'public' ORDER BY 1, 2`,
        `SELECT conrelid::regclass::text AS relation, conname, contype, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`,
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1`,
        `SELECT tgrelid::regclass::text AS relation, tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger
          WHERE NOT tgisinternal ORDER BY 1, 2`,
        `SELECT proname, md5(prosrc) AS body FROM pg_proc WHERE pronamespace = 'public'::regnamespace ORDER BY 1, 2`,
        `SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid ORDER BY 1, e.enumsortorder`,
        `SELECT extname, extversion FROM pg_extension ORDER BY 1`,
      ].map((sql) => client.query(sql)),
    );
    return JSON.stringify(parts.map((part): unknown[] => part.rows as unknown[]));
  } finally {
    await client.end();
  }
}

/**
 * H7-RUN-01: the setup step that failed under load — `prisma migrate deploy` of the harness running past its time limit.
 * A deploy that stalls (here: a relay holds Prisma's first statement on `_prisma_migrations`) must stop at the limit with
 * the phase it stopped in, and leave nothing behind: no Prisma process (the CLI nor its schema engine, which holds the
 * database connection), no session on the server, and a database a plain `DROP DATABASE` (no FORCE) removes.
 */
describe('the migration setup of the harness stops at its limit and leaves nothing behind (H7-RUN-01)', () => {
  let database: DisposableDatabase | undefined;
  let relay: PgRelay | undefined;
  let admin: Client | undefined;

  afterAll(async () => {
    await relay?.stop();
    if (database && admin) await admin.query(`DROP DATABASE IF EXISTS "${database.name}" WITH (FORCE)`);
    await admin?.end();
  });

  it('gives a suite the committed schema without a Prisma process: the same history and catalog as a deploy', async () => {
    const before = prismaProcessesStarted();
    const copied = await provisionDisposableDatabase();
    const deployed = await provisionDisposableDatabase();
    try {
      await migrateDisposableDatabase(copied);
      expect(prismaProcessesStarted()).toBe(before);
      // A copy of the handle is not one this file provisioned: the Prisma CLI deploys it, as it deploys the template.
      await migrateDisposableDatabase({ ...deployed });
      expect(prismaProcessesStarted()).toBe(before + 1);

      expect(await schemaOf(copied.url)).toBe(await schemaOf(deployed.url));
    } finally {
      await dropDisposableDatabase(copied);
      await dropDisposableDatabase(deployed);
    }
  }, 60000);

  it('names the stalled phase, and no process, session or database of the failed setup survives', async () => {
    database = await provisionDisposableDatabase();
    const direct = new URL(database.url);
    const server = new URL(direct.toString());
    server.pathname = '/postgres';
    admin = new Client({ connectionString: server.toString() });
    await admin.connect();
    relay = await PgRelay.start(direct.hostname, Number(direct.port || 5432));
    relay.holdWhen(/_prisma_migrations/);
    const viaRelay = new URL(direct.toString());
    viaRelay.port = String(relay.port);

    const failure = migrateDisposableDatabase({ ...database, url: viaRelay.toString() }, { timeoutMs: 15000 });
    failure.catch(() => undefined);
    // Prisma really stalls on its history table (the relay holds that connection) before the limit fires.
    const stalledBy = Date.now() + 12000;
    while (!relay.holding && Date.now() < stalledBy) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(relay.holding).toBe(true);

    await expect(failure).rejects.toThrow(
      /did not finish within 15 s on the disposable database \(the process was stopped\); phases \(ms\): reachable \d+, Prisma started \d+, history read -/,
    );
    expect(runningMigrations()).toBe(0);
    // Stopping the CLI closed the held connection: its schema engine, which owned it, did not outlive it.
    expect(relay.holding).toBe(false);

    // The relay keeps forwarding nothing: whatever still holds a session would be a Prisma process that survived.
    await relay.stop();
    relay = undefined;
    const deadline = Date.now() + 10000;
    let sessions = -1;
    while (Date.now() < deadline) {
      const { rows } = await admin.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1',
        [database.name],
      );
      sessions = rows[0].count;
      if (sessions === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(sessions).toBe(0);
    // No FORCE: this succeeds only because no session of the failed setup is left.
    await admin.query(`DROP DATABASE "${database.name}"`);
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database.name]);
    expect(rows).toEqual([]);
  }, 60000);
});
