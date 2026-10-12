import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

export const MARKER_TABLE = 'disposable_test_run';
export interface DisposableDatabase {
  url: string;
  name: string;
  runId: string;
}
export class DisposableDatabaseError extends Error {}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const SAFE_NAME = /^[a-z][a-z0-9_]*_test$/;
const quote = (identifier: string): string => '"' + identifier.replaceAll('"', '""') + '"';

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
  checkDisposableUrl(url);
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const marker = await client.query<{ run_id: string }>(
      'SELECT run_id FROM test_harness.' + quote(MARKER_TABLE) + ' WHERE run_id = $1',
      [runId],
    );
    if (marker.rowCount !== 1) throw new DisposableDatabaseError('Database has no ownership marker for this run.');
  } catch (error) {
    if (error instanceof DisposableDatabaseError) throw error;
    throw new DisposableDatabaseError('Database has no readable ownership marker for this run.');
  } finally {
    await client.end();
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
  loadDotenv({ quiet: true });
  const source = process.env.TEST_DATABASE_ADMIN_URL;
  if (!source)
    throw new DisposableDatabaseError(
      'Set TEST_DATABASE_ADMIN_URL to a dedicated local PostgreSQL server with CREATEDB permission.',
    );
  const admin = adminUrl(source);
  const name = 'slm_' + randomBytes(4).toString('hex') + '_test';
  const target = new URL(admin);
  target.pathname = '/' + name;
  const url = target.toString();
  const adminClient = new Client({ connectionString: admin, connectionTimeoutMillis: 5000 });
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  let created = false;
  try {
    await adminClient.connect();
    await adminClient.query('CREATE DATABASE ' + quote(name));
    created = true;
    await client.connect();
    await client.query('CREATE SCHEMA test_harness');
    await client.query('CREATE TABLE test_harness.' + quote(MARKER_TABLE) + ' (run_id text PRIMARY KEY)');
    await client.query('INSERT INTO test_harness.' + quote(MARKER_TABLE) + ' (run_id) VALUES ($1)', [runId]);
    return { url, name, runId };
  } catch {
    await client.end();
    // Only the database successfully created by this invocation can be removed here.
    if (created) await adminClient.query('DROP DATABASE ' + quote(name));
    throw new DisposableDatabaseError(
      'Cannot provision a disposable database. Check TEST_DATABASE_ADMIN_URL and CREATEDB permission.',
    );
  } finally {
    await client.end();
    await adminClient.end();
  }
}

export async function dropDisposableDatabase(database: DisposableDatabase): Promise<void> {
  const { database: name } = checkDisposableUrl(database.url);
  if (name !== database.name) throw new DisposableDatabaseError('Database handle name does not match its URL.');
  await assertDisposableDatabase(database.url, database.runId);
  // Derive the server from the owned handle, never from mutable process environment.
  const client = new Client({ connectionString: adminUrl(database.url), connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    await client.query('DROP DATABASE ' + quote(name) + ' WITH (FORCE)');
  } finally {
    await client.end();
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
