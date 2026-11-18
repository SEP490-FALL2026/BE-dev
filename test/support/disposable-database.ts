import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { MIGRATE_TIMEOUT_MS, deployMigrations, migrationFailure, recordCopy, recordTimings } from './migration-deploy';

export const MARKER_TABLE = 'disposable_test_run';
export interface DisposableDatabase {
  url: string;
  name: string;
  runId: string;
}
interface TeardownDiagnostics {
  database: string;
  sqlState: string | null;
  sessions?: {
    database: string;
    application_name: string;
    pid: number;
    state: string | null;
    wait_event_type: string | null;
    wait_event: string | null;
  }[];
  diagnosticsSqlState?: string | null;
  closeSqlStates?: (string | null)[];
  plainDropSqlState?: string | null;
}

export class DisposableDatabaseError extends Error {
  constructor(
    message: string,
    readonly sqlState: string | null = null,
    public diagnostics?: TeardownDiagnostics,
  ) {
    super(message);
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const SAFE_NAME = /^[a-z][a-z0-9_]*_test$/;
const quote = (identifier: string): string => '"' + identifier.replaceAll('"', '""') + '"';
/** A loaded runner can take seconds to accept a connection to a freshly cloned database; long, but finite. */
const CONNECT_TIMEOUT_MS = 15_000;

function sqlState(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
}

/** Query results are checked strictly: missing/null attributes must never permit a privileged role. */
export async function assertIntegrationDatabaseRole(client: {
  query: (sql: string) => Promise<{ rows: Record<string, unknown>[] }>;
}): Promise<void> {
  const { rows } = await client.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolcanlogin, rolbypassrls
       FROM pg_roles WHERE rolname = current_user`,
  );
  const role = rows[0];
  if (
    rows.length !== 1 ||
    role.rolsuper !== false ||
    role.rolcreatedb !== true ||
    role.rolcreaterole !== false ||
    role.rolreplication !== false ||
    role.rolcanlogin !== true ||
    role.rolbypassrls !== false
  ) {
    throw new DisposableDatabaseError(
      'Integration requires LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS. Do not use the bootstrap role.',
    );
  }
}

async function teardownDiagnostics(client: Client, database: string, error: unknown): Promise<TeardownDiagnostics> {
  const diagnostics: TeardownDiagnostics = { database, sqlState: sqlState(error) };
  try {
    const { rows } = await client.query<NonNullable<TeardownDiagnostics['sessions']>[number]>(
      `SELECT datname AS database, application_name, pid, state, wait_event_type, wait_event
         FROM pg_stat_activity WHERE datname = $1 ORDER BY pid`,
      [database],
    );
    // Explicit projection also protects against accidental future expansion of the query above.
    diagnostics.sessions = rows.map((row) => ({
      database: row.database,
      application_name: row.application_name,
      pid: row.pid,
      state: row.state,
      wait_event_type: row.wait_event_type,
      wait_event: row.wait_event,
    }));
  } catch (error) {
    // Inspection is best effort and must not replace the original DROP failure.
    diagnostics.diagnosticsSqlState = sqlState(error);
  }
  return diagnostics;
}

async function closeClients(clients: Client[], database: string, primary?: DisposableDatabaseError): Promise<void> {
  const results = await Promise.allSettled(clients.map((client) => client.end()));
  const failures = results.filter((result) => result.status === 'rejected');
  if (!failures.length) return;
  const closeSqlStates = failures.map((result) => sqlState(result.reason));
  if (primary) {
    primary.diagnostics ??= { database, sqlState: primary.sqlState };
    primary.diagnostics.closeSqlStates = closeSqlStates;
    return;
  }
  throw new DisposableDatabaseError('Cannot close disposable database clients.', closeSqlStates[0], {
    database,
    sqlState: closeSqlStates[0],
    closeSqlStates,
  });
}

function parse(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DisposableDatabaseError('The database URL is not a valid URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new DisposableDatabaseError('The database URL must use PostgreSQL.');
  }
  // libpq query options can override host/database/user. Never allow them in destructive helpers.
  if (url.search || url.hash)
    throw new DisposableDatabaseError('Disposable database URLs must not have query parameters or fragments.');
  return url;
}

function requireLocalHost(url: URL): void {
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new DisposableDatabaseError('Disposable databases must be on localhost or 127.0.0.1.');
  }
}

export function checkDisposableUrl(value: string): { host: string; database: string } {
  const url = parse(value);
  requireLocalHost(url);
  const database = url.pathname.slice(1);
  if (!SAFE_NAME.test(database)) {
    throw new DisposableDatabaseError(
      'A disposable database name must end in "_test" and use lowercase letters, digits or underscores.',
    );
  }
  return { host: url.hostname, database };
}

export async function assertDisposableDatabase(url: string, runId: string): Promise<void> {
  const { database } = checkDisposableUrl(url);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  let failure: DisposableDatabaseError | undefined;
  try {
    await client.connect();
    const marker = await client.query<{ run_id: string }>(
      'SELECT run_id FROM test_harness.' + quote(MARKER_TABLE) + ' WHERE run_id = $1',
      [runId],
    );
    if (marker.rowCount !== 1) throw new DisposableDatabaseError('Database has no ownership marker for this run.');
  } catch (error) {
    failure =
      error instanceof DisposableDatabaseError
        ? error
        : new DisposableDatabaseError('Database has no readable ownership marker for this run.', sqlState(error));
    throw failure;
  } finally {
    await closeClients([client], database, failure);
  }
}

export function adminUrl(source: string): string {
  const url = parse(source);
  requireLocalHost(url);
  url.pathname = '/postgres';
  return url.toString();
}

/** The admin connection of CREATE/DROP DATABASE: parallel files wait behind one another, so 30 s, but finite. */
function harnessAdminClient(connectionString: string): Client {
  const timeout = { connectionTimeoutMillis: CONNECT_TIMEOUT_MS, query_timeout: 30000, statement_timeout: 30000 };
  return new Client({ connectionString, ...timeout, application_name: 'slm-disposable-harness' });
}

/** Requires explicit opt-in to a local server; never falls back to the application's database. */
export async function provisionDisposableDatabase(runId: string = randomUUID()): Promise<DisposableDatabase> {
  const source = process.env.TEST_DATABASE_ADMIN_URL;
  if (!source)
    throw new DisposableDatabaseError(
      'Set TEST_DATABASE_ADMIN_URL to a dedicated local PostgreSQL server using an ordinary CREATEDB role.',
    );
  const admin = adminUrl(source);
  const name = 'slm_' + randomBytes(4).toString('hex') + '_test';
  const target = new URL(admin);
  target.pathname = '/' + name;
  const url = target.toString();
  const adminClient = harnessAdminClient(admin);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  let created = false;
  let clientClosed = false;
  let failure: DisposableDatabaseError | undefined;
  try {
    await adminClient.connect();
    await assertIntegrationDatabaseRole(adminClient);
    await adminClient.query('CREATE DATABASE ' + quote(name));
    created = true;
    await client.connect();
    await client.query('CREATE SCHEMA test_harness');
    await client.query('CREATE TABLE test_harness.' + quote(MARKER_TABLE) + ' (run_id text PRIMARY KEY)');
    await client.query('INSERT INTO test_harness.' + quote(MARKER_TABLE) + ' (run_id) VALUES ($1)', [runId]);
    const database = { url, name, runId };
    provisioned.add(database);
    return database;
  } catch (error) {
    failure =
      error instanceof DisposableDatabaseError
        ? error
        : new DisposableDatabaseError(
            // The SQLSTATE says which (P28-13): 42501 a missing permission, 55006 the template held by another session.
            `Cannot provision a disposable database (SQLSTATE ${sqlState(error) ?? 'none'}). Check TEST_DATABASE_ADMIN_URL and ordinary CREATEDB permission.`,
            sqlState(error),
          );
    await closeClients([client], name, failure);
    clientClosed = true;
    // Only the database successfully created by this invocation can be removed here.
    if (created) {
      try {
        await adminClient.query('DROP DATABASE ' + quote(name) + ' WITH (FORCE)');
      } catch (cleanupError) {
        failure.diagnostics = await teardownDiagnostics(adminClient, name, cleanupError);
      }
    }
    throw failure;
  } finally {
    await closeClients(clientClosed ? [adminClient] : [client, adminClient], name, failure);
  }
}

export async function dropDisposableDatabase(database: DisposableDatabase): Promise<void> {
  const { database: name } = checkDisposableUrl(database.url);
  if (name !== database.name) throw new DisposableDatabaseError('Database handle name does not match its URL.');
  await assertDisposableDatabase(database.url, database.runId);
  // Derive the server from the owned handle, never from mutable process environment.
  const client = harnessAdminClient(adminUrl(database.url));
  let failure: DisposableDatabaseError | undefined;
  try {
    await client.connect();
    await client.query('DROP DATABASE ' + quote(name) + ' WITH (FORCE)');
  } catch (error) {
    const diagnostics = await teardownDiagnostics(client, name, error);
    // GATE-02: FORCE answers 42501 to an ordinary role when a process it may not signal is in the database: an
    // autovacuum worker, whose backend_type that role cannot even read. Only then one plain DROP DATABASE follows: it
    // signals autovacuum workers itself, terminates nothing else and fails (55006) while a real session holds the
    // database. No other failure is retried.
    if (diagnostics.sqlState === '42501') {
      try {
        await client.query('DROP DATABASE ' + quote(name));
        return;
      } catch (plainError) {
        diagnostics.plainDropSqlState = sqlState(plainError);
      }
    }
    failure = new DisposableDatabaseError(
      'Cannot drop disposable database. Safe teardown diagnostics: ' + JSON.stringify(diagnostics),
      diagnostics.sqlState,
      diagnostics,
    );
    throw failure;
  } finally {
    await closeClients([client], name, failure);
  }
}

/**
 * Applies the committed baseline to an owned database; never uses db push/reset (H7-RUN-01). A database this file just
 * provisioned becomes a server-side copy of the run's migrated template (`prepareMigratedTemplate`): no Prisma process
 * per suite. Any other handle — the PostgreSQL role suites (deploy role, superuser), a relay — is deployed by the Prisma
 * CLI itself, as is the template.
 */
export async function migrateDisposableDatabase(
  database: DisposableDatabase,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  if (checkDisposableUrl(database.url).database !== database.name)
    throw new DisposableDatabaseError('Database handle name does not match its URL.');
  const started = performance.now();
  await assertDisposableDatabase(database.url, database.runId);
  const template = migratedTemplate();
  if (template && provisioned.has(database) && (await cloneMigratedTemplate(database, template.name))) {
    recordCopy(database.name, performance.now() - started);
    return;
  }
  const phases = await deployMigrations(
    database.url,
    performance.now() - started,
    options.timeoutMs ?? MIGRATE_TIMEOUT_MS,
  );
  recordTimings(database.name, phases);
  if (phases.outcome !== 'applied') throw new DisposableDatabaseError(migrationFailure(phases));
}

/** The migrated template of this Jest run, named in the environment by `prepareMigratedTemplate` (globalSetup). */
const TEMPLATE_ENV = 'SLM_TEST_MIGRATED_TEMPLATE';
/** Databases this file provisioned (empty, marked, no session held): only these may be swapped for a template copy. */
const provisioned = new WeakSet<DisposableDatabase>();

/** Names (or, with null, forgets) the run's migrated template; only test/support/migrated-template.ts calls it. */
export function useMigratedTemplate(template: { name: string; runId: string } | null): void {
  if (template === null) delete process.env[TEMPLATE_ENV];
  else process.env[TEMPLATE_ENV] = JSON.stringify(template);
}

export function migratedTemplate(): { name: string; runId: string } | null {
  const value = process.env[TEMPLATE_ENV];
  if (!value) return null;
  const template = JSON.parse(value) as { name: string; runId: string };
  if (!SAFE_NAME.test(template.name))
    throw new DisposableDatabaseError(`${TEMPLATE_ENV} does not name a test database.`);
  return template;
}

async function markDatabase(url: string, runId: string, fresh: boolean): Promise<void> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  await client.connect();
  try {
    if (fresh) {
      await client.query('CREATE SCHEMA test_harness');
      await client.query('CREATE TABLE test_harness.' + quote(MARKER_TABLE) + ' (run_id text PRIMARY KEY)');
    } else {
      await client.query('DELETE FROM test_harness.' + quote(MARKER_TABLE));
    }
    await client.query('INSERT INTO test_harness.' + quote(MARKER_TABLE) + ' (run_id) VALUES ($1)', [runId]);
  } finally {
    await client.end();
  }
}

/** Objects of a database besides the harness marker: anything means a suite already used it. */
const FOREIGN_OBJECTS = `SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'test_harness') AND n.nspname NOT LIKE 'pg_toast%')
  + (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'test_harness', 'public')
    AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%')
  + (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace)
  + (SELECT count(*) FROM pg_type WHERE typnamespace = 'public'::regnamespace)
  + (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql')
  + (SELECT count(*) - 1 FROM test_harness.${quote(MARKER_TABLE)}) AS count`;

/**
 * Replaces the provisioned database by a copy of the template, keeping its name and its own marker — only when that is
 * exactly what a deploy would give: the database still holds nothing but the marker and no session is left on it (a
 * process that just exited gets up to 2 s to go). Otherwise it returns false and the caller deploys with the CLI, so a
 * suite that already used its database never loses what it made.
 */
async function cloneMigratedTemplate(database: DisposableDatabase, template: string): Promise<boolean> {
  const target = new Client({ connectionString: database.url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  await target.connect();
  const foreign = await target.query<{ count: string }>(FOREIGN_OBJECTS).finally(() => target.end());
  if (Number(foreign.rows[0].count) !== 0) return false;
  const admin = new Client({
    connectionString: adminUrl(database.url),
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: 30000,
    application_name: 'slm-disposable-harness',
  });
  let failure: DisposableDatabaseError | undefined;
  try {
    await admin.connect();
    const drainedBy = Date.now() + 2000;
    for (;;) {
      const { rows } = await admin.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1',
        [database.name],
      );
      if (rows[0].count === 0) break;
      if (Date.now() > drainedBy) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // A plain DROP: it fails (55006) if a session arrived meanwhile; then the suite holds the database.
    await admin.query('DROP DATABASE ' + quote(database.name));
    try {
      await admin.query('CREATE DATABASE ' + quote(database.name) + ' TEMPLATE ' + quote(template));
    } catch (error) {
      // Give the suite back an empty marked database, so its own teardown still finds what it owns.
      await admin.query('CREATE DATABASE ' + quote(database.name));
      await markDatabase(database.url, database.runId, true);
      throw error;
    }
  } catch (error) {
    failure = new DisposableDatabaseError(
      `Cannot copy the migrated template (SQLSTATE ${sqlState(error) ?? 'none'}; 55006: a session holds the database or the template).`,
      sqlState(error),
    );
    throw failure;
  } finally {
    await closeClients([admin], database.name, failure);
  }
  await markDatabase(database.url, database.runId, false);
  return true;
}
