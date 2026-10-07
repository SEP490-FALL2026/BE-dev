import { randomBytes, randomUUID } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

/** One-row table that proves a database was created for a specific test run. */
export const MARKER_TABLE = 'disposable_test_run';

/** A migration of the removed 2026-10-02 slice that may linger in `_prisma_migrations`. */
export const STALE_MIGRATIONS = ['20261002000000_s0_identity_audit_foundation'] as const;

/** Baseline tables the native migration drops or reshapes (delivery plan, B1b mapping). */
export const MIGRATION_REFUSING_TABLES = [
  'principals',
  'identity_links',
  'departments',
  'employees',
  'audit_events',
  'stored_objects',
  'import_jobs',
] as const;

/** Baseline tables the native migration leaves alone; counted so the report shows the full picture. */
export const MIGRATION_KEPT_TABLES = [
  'access_requests',
  'approval_steps',
  'license_assignments',
  'financial_transactions',
  'usage_records',
  'license_pools',
  'discovery_cases',
  'catalog_applications',
] as const;

export interface PreflightResult {
  migrationIds: string[];
  staleMigrations: string[];
  rowCounts: Record<string, number>;
  /** False when the native migration would destroy or reshape rows that exist. */
  actionAllowed: boolean;
  blockedBy: string[];
}

export interface DisposableDatabase {
  url: string;
  name: string;
  runId: string;
}

export class DisposableDatabaseError extends Error {}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const SAFE_NAME = /^[a-z][a-z0-9_]*_test$/;
const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

function parse(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new DisposableDatabaseError('The database URL is not a valid URL.');
  }
}

function requireLocalHost(url: URL, what: string): void {
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new DisposableDatabaseError(`${what} must be on localhost or 127.0.0.1, not "${url.hostname}".`);
  }
}

/**
 * Conditions one and two of the disposable guard, checked without touching the network:
 * hostname is exactly localhost/127.0.0.1 and the database name ends in `_test`.
 * Error messages carry the host and database name only, never credentials.
 */
export function checkDisposableUrl(url: string): { host: string; database: string } {
  const parsed = parse(url);
  requireLocalHost(parsed, 'A disposable database');
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!SAFE_NAME.test(database)) {
    throw new DisposableDatabaseError(`A disposable database name must end in "_test" (got "${database}").`);
  }
  return { host: parsed.hostname, database };
}

/**
 * The full guard: local host, `_test` suffix **and** an ownership marker holding this run's id.
 * It never creates the marker: a database nobody provisioned for this run is refused, which is
 * what stops a stray TEST_DATABASE_URL from turning a shared database into a test target.
 */
export async function assertDisposableDatabase(url: string, runId: string): Promise<void> {
  const { database } = checkDisposableUrl(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const marker = await client.query<{ run_id: string }>(
      `SELECT run_id FROM ${quote(MARKER_TABLE)} WHERE run_id = $1`,
      [runId],
    );
    if (marker.rowCount !== 1) {
      throw new DisposableDatabaseError(`Database "${database}" has no ownership marker for this run.`);
    }
  } catch (error) {
    if (error instanceof DisposableDatabaseError) throw error;
    throw new DisposableDatabaseError(`Database "${database}" has no readable ownership marker for this run.`);
  } finally {
    await client.end();
  }
}

function adminUrl(): string {
  loadDotenv({ quiet: true });
  const source = process.env.TEST_DATABASE_ADMIN_URL ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!source) {
    throw new DisposableDatabaseError(
      'Set TEST_DATABASE_ADMIN_URL (or DATABASE_URL) to a localhost PostgreSQL server that may create databases.',
    );
  }
  const parsed = parse(source);
  requireLocalHost(parsed, 'The server that hosts disposable databases');
  parsed.pathname = '/postgres';
  return parsed.toString();
}

/** Creates a brand-new `slm_<nonce>_test` database with its ownership marker. */
export async function provisionDisposableDatabase(runId: string = randomUUID()): Promise<DisposableDatabase> {
  const admin = adminUrl();
  const name = `slm_${randomBytes(4).toString('hex')}_test`;
  const target = parse(admin);
  target.pathname = `/${name}`;
  const url = target.toString();

  const adminClient = new Client({ connectionString: admin });
  try {
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE ${quote(name)}`);
  } catch (error) {
    throw new DisposableDatabaseError(
      `Cannot create a disposable database on ${parse(admin).host}: ${error instanceof Error ? error.message : String(error)}. ` +
        'Set TEST_DATABASE_ADMIN_URL to a localhost PostgreSQL server whose role may create databases (see .env.example).',
    );
  } finally {
    await adminClient.end().catch(() => undefined);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE ${quote(MARKER_TABLE)} (run_id text PRIMARY KEY)`);
    await client.query(`INSERT INTO ${quote(MARKER_TABLE)} (run_id) VALUES ($1)`, [runId]);
  } finally {
    await client.end();
  }
  return { url, name, runId };
}

/** Drops a database this run provisioned; refuses anything else. */
export async function dropDisposableDatabase(database: DisposableDatabase): Promise<void> {
  await assertDisposableDatabase(database.url, database.runId);
  const adminClient = new Client({ connectionString: adminUrl() });
  await adminClient.connect();
  try {
    await adminClient.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [database.name],
    );
    await adminClient.query(`DROP DATABASE IF EXISTS ${quote(database.name)}`);
  } finally {
    await adminClient.end();
  }
}

/**
 * Read-only description of what the native migration would meet. Safe to point at a development
 * database: the session is read-only and the result carries counts, never credentials or rows.
 */
export async function inspectMigrationBaseline(url: string): Promise<PreflightResult> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('SET default_transaction_read_only = on');
    const result: PreflightResult = {
      migrationIds: [],
      staleMigrations: [],
      rowCounts: {},
      actionAllowed: true,
      blockedBy: [],
    };

    const history = await client.query<{ present: string | null }>(
      `SELECT to_regclass('public._prisma_migrations') AS present`,
    );
    if (history.rows[0].present) {
      const migrations = await client.query<{ migration_name: string }>(
        'SELECT migration_name FROM public._prisma_migrations ORDER BY started_at ASC, migration_name ASC',
      );
      result.migrationIds = migrations.rows.map((row) => row.migration_name);
      result.staleMigrations = result.migrationIds.filter((id) => (STALE_MIGRATIONS as readonly string[]).includes(id));
    }

    for (const table of [...MIGRATION_REFUSING_TABLES, ...MIGRATION_KEPT_TABLES]) {
      const exists = await client.query<{ present: string | null }>(`SELECT to_regclass($1) AS present`, [
        `public.${table}`,
      ]);
      if (!exists.rows[0].present) {
        result.rowCounts[table] = 0;
        continue;
      }
      const count = await client.query<{ n: string }>(`SELECT count(*) AS n FROM public.${quote(table)}`);
      result.rowCounts[table] = Number(count.rows[0].n);
    }

    result.blockedBy = MIGRATION_REFUSING_TABLES.filter((table) => result.rowCounts[table] > 0);
    result.actionAllowed = result.blockedBy.length === 0;
    return result;
  } finally {
    await client.end();
  }
}
