import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DisposableDatabase, MARKER_TABLE } from './disposable-database';

/**
 * A database on a disposable PostgreSQL server laid out like production before H7 (docs/guides/containers.md
 * #postgresql-roles-h7): created and owned by the cluster superuser, with the names of a deploy role and a runtime role
 * that the code under test creates. The suites play the cluster administrator, so this harness needs the superuser of a
 * **dedicated local** server (`TEST_DATABASE_BOOTSTRAP_URL`) — a test-admin concern that never reaches application
 * configuration. Every database and role it names is recorded before it exists and removed by exact name in
 * `dropRoleSeparatedDatabase`. Nothing here asserts.
 */

export interface RoleLogin {
  role: string;
  password: string;
  url: string;
}

export interface RoleSeparatedDatabase {
  name: string;
  runId: string;
  bootstrapRole: string;
  /** The superuser, connected to this database (administration and assertions). */
  bootstrapUrl: string;
  deploy: RoleLogin;
  runtime: RoleLogin;
  /** The database as the deploy role sees it, for `migrateDisposableDatabase`. */
  deployHandle: DisposableDatabase;
  /** The superuser's view, for `createHttpTestApp({ database })` and the old wiring. */
  bootstrapHandle: DisposableDatabase;
  /** The environment of `ops:db-roles provision` for this database. */
  provisionEnvironment: Record<string, string>;
  /** Exact names to remove: every database first, then every role. */
  databases: string[];
  roles: string[];
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

function bootstrapServer(): URL {
  const source = process.env.TEST_DATABASE_BOOTSTRAP_URL;
  if (!source) {
    throw new Error(
      'Set TEST_DATABASE_BOOTSTRAP_URL to the superuser of a dedicated local PostgreSQL 17 server (test/README.md): ' +
        'the role-separation suites create and drop roles.',
    );
  }
  const url = new URL(source);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.search ||
    url.hash ||
    !LOCAL_HOSTS.has(url.hostname)
  ) {
    throw new Error('TEST_DATABASE_BOOTSTRAP_URL must be a plain postgresql:// URL of localhost or 127.0.0.1.');
  }
  url.pathname = '/postgres';
  return url;
}

function loginUrl(server: URL, role: string, password: string, database: string): string {
  const url = new URL(server.toString());
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

/** Runs `work` on a new connection, always closed afterwards. */
export async function withClient<T>(url: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000, application_name: 'slm-h7-suite' });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** The SQLSTATE `statement` fails with as `url`'s role, or null when it succeeds. */
export async function sqlStateOf(url: string, statement: string, values: unknown[] = []): Promise<string | null> {
  return withClient(url, async (client) => {
    try {
      await client.query(statement, values);
      return null;
    } catch (error) {
      return (error as { code?: string }).code ?? 'NO_SQLSTATE';
    }
  });
}

/** Creates the database as the superuser, with the ownership marker of the disposable harness. */
export async function createRoleSeparatedDatabase(): Promise<RoleSeparatedDatabase> {
  const server = bootstrapServer();
  const hex = randomBytes(4).toString('hex');
  const name = `slm_${hex}_test`;
  const runId = randomUUID();
  const deploy = { role: `slm_${hex}_deploy`, password: randomBytes(24).toString('hex') };
  const runtime = { role: `slm_${hex}_runtime`, password: randomBytes(24).toString('hex') };
  const bootstrapUrl = loginUrl(server, decodeURIComponent(server.username), decodeURIComponent(server.password), name);
  const deployUrl = loginUrl(server, deploy.role, deploy.password, name);
  const runtimeUrl = loginUrl(server, runtime.role, runtime.password, name);
  const database: RoleSeparatedDatabase = {
    name,
    runId,
    bootstrapRole: decodeURIComponent(server.username),
    bootstrapUrl,
    deploy: { ...deploy, url: deployUrl },
    runtime: { ...runtime, url: runtimeUrl },
    deployHandle: { url: deployUrl, name, runId },
    bootstrapHandle: { url: bootstrapUrl, name, runId },
    provisionEnvironment: {
      DATABASE_BOOTSTRAP_URL: bootstrapUrl,
      DATABASE_DEPLOY_URL: deployUrl,
      DATABASE_RUNTIME_URL: runtimeUrl,
    },
    // Recorded before anything exists, so a failure half-way still removes what was made.
    databases: [name],
    roles: [deploy.role, runtime.role],
  };

  try {
    await withClient(server.toString(), async (client) => {
      const { rows } = await client.query<{ rolsuper: boolean }>(
        'SELECT rolsuper FROM pg_roles WHERE rolname = current_user',
      );
      if (rows[0]?.rolsuper !== true) {
        throw new Error(
          'TEST_DATABASE_BOOTSTRAP_URL must be the superuser of a dedicated test server (it plays the cluster administrator).',
        );
      }
      await client.query(`CREATE DATABASE ${quote(name)}`);
    });
    await withClient(bootstrapUrl, async (client) => {
      await client.query('CREATE SCHEMA test_harness');
      await client.query(`CREATE TABLE test_harness.${quote(MARKER_TABLE)} (run_id text PRIMARY KEY)`);
      await client.query(`INSERT INTO test_harness.${quote(MARKER_TABLE)} (run_id) VALUES ($1)`, [runId]);
    });
  } catch (error) {
    // A setup that stops half-way leaves nothing behind (operational-commands rule 8).
    await dropRoleSeparatedDatabase(database).catch(() => undefined);
    throw error;
  }
  return database;
}

/** Lets the deploy role read the harness marker, which `migrateDisposableDatabase` checks before it migrates. */
export async function allowDeployToReadMarker(database: RoleSeparatedDatabase): Promise<void> {
  await withClient(database.bootstrapUrl, async (client) => {
    await client.query(`GRANT USAGE ON SCHEMA test_harness TO ${quote(database.deploy.role)}`);
    await client.query(`GRANT SELECT ON test_harness.${quote(MARKER_TABLE)} TO ${quote(database.deploy.role)}`);
  });
}

/** Another database of the cluster, owned by the superuser, with a table: data the runtime role must never read. */
export async function createUnrelatedDatabase(database: RoleSeparatedDatabase): Promise<string> {
  const name = database.name.replace(/_test$/, '_other_test');
  database.databases.push(name);
  await withClient(bootstrapServer().toString(), (client) => client.query(`CREATE DATABASE ${quote(name)}`));
  const url = new URL(database.bootstrapUrl);
  url.pathname = `/${name}`;
  await withClient(url.toString(), async (client) => {
    await client.query('CREATE SCHEMA other');
    await client.query(`CREATE TABLE other.secret (value text); INSERT INTO other.secret VALUES ('unrelated')`);
  });
  return url.toString();
}

/** A role of the test (recorded for removal), created by the superuser with the given attributes. */
export async function createExtraRole(
  database: RoleSeparatedDatabase,
  role: string,
  attributes: string,
): Promise<void> {
  if (!database.roles.includes(role)) database.roles.push(role);
  await withClient(bootstrapServer().toString(), (client) => client.query(`CREATE ROLE ${quote(role)} ${attributes}`));
}

/**
 * Owners, ACLs and default privileges of the database, schema `public` and its objects, and the attributes of the two
 * roles, as one comparable string: equal before and after a command means the command changed none of them.
 */
export async function privilegeSnapshot(database: RoleSeparatedDatabase): Promise<string> {
  return withClient(database.bootstrapUrl, async (client) => {
    const parts = await Promise.all([
      client.query(
        `SELECT datname, pg_get_userbyid(datdba) AS owner, datacl::text FROM pg_database WHERE datname = current_database()`,
      ),
      client.query(
        `SELECT pg_get_userbyid(nspowner) AS owner, nspacl::text FROM pg_namespace WHERE nspname = 'public'`,
      ),
      client.query(
        `SELECT relname, relkind, pg_get_userbyid(relowner) AS owner, relacl::text FROM pg_class
          WHERE relnamespace = 'public'::regnamespace ORDER BY relname`,
      ),
      client.query(
        `SELECT p.oid::regprocedure::text AS routine, pg_get_userbyid(proowner) AS owner, proacl::text FROM pg_proc p
          WHERE pronamespace = 'public'::regnamespace ORDER BY 1`,
      ),
      client.query(
        `SELECT typname, pg_get_userbyid(typowner) AS owner FROM pg_type WHERE typnamespace = 'public'::regnamespace ORDER BY 1`,
      ),
      client.query(
        `SELECT pg_get_userbyid(defaclrole) AS role, defaclobjtype, defaclacl::text FROM pg_default_acl ORDER BY 1, 2, 3`,
      ),
      client.query(
        `SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin FROM pg_roles
          WHERE rolname = ANY($1::text[]) ORDER BY 1`,
        [[database.deploy.role, database.runtime.role]],
      ),
    ]);
    return JSON.stringify(parts.map((part): unknown[] => part.rows as unknown[]));
  });
}

/** Row count and an order-independent hash of every table of `public`: equal means no row was added, lost or changed. */
export async function tableFingerprints(database: RoleSeparatedDatabase): Promise<Record<string, string>> {
  return withClient(database.bootstrapUrl, async (client) => {
    const { rows: tables } = await client.query<{ name: string }>(
      `SELECT relname AS name FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') ORDER BY 1`,
    );
    const fingerprints: Record<string, string> = {};
    for (const { name } of tables) {
      const { rows } = await client.query<{ rows: string; hash: string | null }>(
        `SELECT count(*)::text AS rows, md5(string_agg(t::text, '|' ORDER BY t::text)) AS hash FROM public.${quote(name)} t`,
      );
      fingerprints[name] = `${rows[0].rows}:${rows[0].hash ?? '-'}`;
    }
    return fingerprints;
  });
}

/** Drops every database, then every role, by the exact names recorded; reports the first failure after trying all. */
export async function dropRoleSeparatedDatabase(database: RoleSeparatedDatabase): Promise<void> {
  const failures: unknown[] = [];
  await withClient(bootstrapServer().toString(), async (client) => {
    for (const name of database.databases) {
      await client.query(`DROP DATABASE IF EXISTS ${quote(name)} WITH (FORCE)`).catch((error) => failures.push(error));
    }
    for (const role of database.roles) {
      await client.query(`DROP ROLE IF EXISTS ${quote(role)}`).catch((error) => failures.push(error));
    }
  });
  if (failures.length > 0) throw failures[0];
}
