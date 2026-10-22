import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Client } from 'pg';

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
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
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

function adminUrl(source: string): string {
  const url = parse(source);
  requireLocalHost(url);
  url.pathname = '/postgres';
  return url.toString();
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
  const adminClient = new Client({
    connectionString: admin,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'slm-disposable-harness',
  });
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
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
    return { url, name, runId };
  } catch (error) {
    failure =
      error instanceof DisposableDatabaseError
        ? error
        : new DisposableDatabaseError(
            'Cannot provision a disposable database. Check TEST_DATABASE_ADMIN_URL and ordinary CREATEDB permission.',
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
  const client = new Client({
    connectionString: adminUrl(database.url),
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
    statement_timeout: 5000,
    application_name: 'slm-disposable-harness',
  });
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

/** Applies the committed baseline to an owned database; never uses db push/reset. */
export async function migrateDisposableDatabase(database: DisposableDatabase): Promise<void> {
  if (checkDisposableUrl(database.url).database !== database.name)
    throw new DisposableDatabaseError('Database handle name does not match its URL.');
  await assertDisposableDatabase(database.url, database.runId);
  try {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: database.url, TEST_DATABASE_URL: database.url },
      stdio: 'pipe',
      timeout: 60000,
    });
  } catch {
    throw new DisposableDatabaseError(
      'Migration deployment failed on the disposable database. Check the committed migrations and Prisma configuration.',
    );
  }
}
