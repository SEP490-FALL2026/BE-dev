import { randomUUID } from 'node:crypto';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from '../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../src/infrastructure/database/roles/database-role-settings';
import { migrateDisposableDatabase } from '../support/disposable-database';
import {
  RoleSeparatedDatabase,
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  createUnrelatedDatabase,
  dropRoleSeparatedDatabase,
  sqlStateOf,
  withClient,
} from '../support/role-separated-database';

const INSUFFICIENT_PRIVILEGE = '42501';
const RESTRICT_VIOLATION = '23001';

/**
 * H7: what the runtime role (the login of the API and the worker) can and cannot do, proved by attempted operations on a
 * migrated, provisioned PostgreSQL 17 database — not by the application booting. The cluster superuser that the old
 * production wiring handed the API is the contrast: it can silence the append-only Audit Trail (`INV-05`).
 */
describe('the runtime role has least privilege (integration, PostgreSQL)', () => {
  let database: RoleSeparatedDatabase;
  let unrelatedUrl: string;
  const asRuntime = (statement: string, values: unknown[] = []) => sqlStateOf(database.runtime.url, statement, values);

  beforeAll(async () => {
    database = await createRoleSeparatedDatabase();
    const report = await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );
    if (report.outcome !== 'DONE') throw new Error(`provision: ${JSON.stringify(report.findings)}`);
    await allowDeployToReadMarker(database);
    await migrateDisposableDatabase(database.deployHandle);
    await withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));
    unrelatedUrl = await createUnrelatedDatabase(database);
  }, 120000);

  afterAll(async () => {
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it.each([
    ['create a database', 'CREATE DATABASE h7_runtime_db'],
    ['create a schema', 'CREATE SCHEMA h7_runtime'],
    ['create a table', 'CREATE TABLE public.h7_runtime_table (id int)'],
    ['create a temporary table', 'CREATE TEMP TABLE h7_runtime_temp (id int)'],
    ['create an extension', 'CREATE EXTENSION IF NOT EXISTS pg_trgm'],
    ['create a role', 'CREATE ROLE h7_runtime_made'],
    ['drop an application table', 'DROP TABLE public.audit_events'],
    ['take ownership', 'ALTER TABLE public.audit_events OWNER TO CURRENT_USER'],
    ['disable the append-only triggers', 'ALTER TABLE public.audit_events DISABLE TRIGGER ALL'],
    ['silence every trigger of its session', 'SET session_replication_role = replica'],
    ['update the Audit Trail', 'UPDATE public.audit_events SET action = action WHERE false'],
    ['delete from the Audit Trail', 'DELETE FROM public.audit_events WHERE false'],
    ['truncate the Audit Trail', 'TRUNCATE public.audit_events'],
    ['truncate an application table', 'TRUNCATE public.app_users CASCADE'],
    ['read the migration history', 'SELECT count(*) FROM public._prisma_migrations'],
    ['write the migration history', `DELETE FROM public._prisma_migrations WHERE false`],
    ['read a schema of the harness', 'SELECT count(*) FROM test_harness.disposable_test_run'],
    ['read server files', `SELECT pg_read_file('postgresql.conf')`],
    ['import a server file', `SELECT lo_import('/etc/hostname')`],
    ['run a program', `COPY (SELECT 1) TO PROGRAM 'true'`],
    ['reload the server configuration', 'SELECT pg_reload_conf()'],
    ['give itself attributes', 'ALTER ROLE CURRENT_USER CREATEDB'],
  ])('cannot %s', async (_case, statement) => {
    expect(await asRuntime(statement)).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('cannot become the deploy role, change its default privileges, or persist a trigger-silencing setting', async () => {
    expect(await asRuntime(`SET ROLE "${database.deploy.role}"`)).toBe(INSUFFICIENT_PRIVILEGE);
    expect(
      await asRuntime(
        `ALTER DEFAULT PRIVILEGES FOR ROLE "${database.deploy.role}" GRANT ALL ON TABLES TO "${database.runtime.role}"`,
      ),
    ).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await asRuntime(`ALTER ROLE CURRENT_USER SET session_replication_role = replica`)).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
  });

  it('cannot terminate a session of an administration role', async () => {
    await withClient(database.bootstrapUrl, async (administrator) => {
      const { rows } = await administrator.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');

      expect(await asRuntime('SELECT pg_terminate_backend($1)', [rows[0].pid])).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await asRuntime('SELECT pg_cancel_backend($1)', [rows[0].pid])).toBe(INSUFFICIENT_PRIVILEGE);
    });
  });

  it('cannot read another database of the cluster', async () => {
    const url = new URL(unrelatedUrl);
    url.username = database.runtime.role;
    url.password = database.runtime.password;

    expect(await sqlStateOf(url.toString(), 'SELECT value FROM other.secret')).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('cannot grant anything: PostgreSQL only warns and the ACL stays as it was', async () => {
    const acl = () =>
      withClient(
        database.bootstrapUrl,
        async (client) =>
          (
            await client.query<{ acl: string | null }>(
              `SELECT relacl::text AS acl FROM pg_class WHERE oid = 'public.audit_events'::regclass`,
            )
          ).rows[0],
      );
    const before = await acl();

    expect(await asRuntime('GRANT SELECT, UPDATE ON public.audit_events TO PUBLIC')).toBeNull();
    expect(await acl()).toEqual(before);
  });

  it('works with the application tables: read, write, row locks, advisory locks and transaction settings', async () => {
    await withClient(database.runtime.url, async (client) => {
      await client.query('BEGIN');
      await client.query(
        `SELECT set_config('lock_timeout', '3000ms', true), set_config('statement_timeout', '5000ms', true)`,
      );
      await client.query('SELECT pg_advisory_xact_lock(4242)');
      await client.query('SELECT id FROM public.app_users FOR UPDATE');
      await client.query('SELECT id FROM public.organizations FOR SHARE');
      await client.query('DELETE FROM public.license_key_reveal_windows WHERE false');
      await client.query(
        `INSERT INTO public.audit_events (id, organization_id, actor_kind, action, resource_type, resource_id, correlation_id)
         VALUES ($1, $2, 'SYSTEM', 'H7.PROBE', 'h7', 'h7', 'h7-probe')`,
        [randomUUID(), randomUUID()],
      );
      const { rows } = await client.query(
        `SELECT count(*)::int AS events FROM public.audit_events WHERE action = 'H7.PROBE'`,
      );
      await client.query('ROLLBACK');

      expect(rows[0]).toEqual({ events: 1 });
    });
  });

  it('keeps the Audit Trail append-only even for its owner; only the superuser of the old wiring could silence it', async () => {
    await withClient(database.deploy.url, (client) =>
      client.query(
        `INSERT INTO public.audit_events (id, organization_id, actor_kind, action, resource_type, resource_id, correlation_id)
         VALUES ($1, $2, 'SYSTEM', 'H7.KEPT', 'h7', 'h7', 'h7-kept')`,
        [randomUUID(), randomUUID()],
      ),
    );

    expect(await sqlStateOf(database.deploy.url, `UPDATE public.audit_events SET action = 'H7.REWRITTEN'`)).toBe(
      RESTRICT_VIOLATION,
    );
    expect(await sqlStateOf(database.deploy.url, 'TRUNCATE public.audit_events')).toBe(RESTRICT_VIOLATION);
    expect(await sqlStateOf(database.deploy.url, 'SET session_replication_role = replica')).toBe(
      INSUFFICIENT_PRIVILEGE,
    );
    // The identity the API had before H7: one statement and the invariant is gone (rolled back here).
    const rewritten = await withClient(database.bootstrapUrl, async (client) => {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      const result = await client.query(
        `UPDATE public.audit_events SET action = 'H7.REWRITTEN' WHERE action = 'H7.KEPT'`,
      );
      await client.query('ROLLBACK');
      return result.rowCount;
    });
    expect(rewritten).toBe(1);
  });

  it('uses what the next migration creates, through the default privileges, before any reconcile', async () => {
    await withClient(database.deploy.url, async (client) => {
      await client.query(
        'CREATE TABLE public.h7_future (id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, note text)',
      );
      await client.query('CREATE SEQUENCE public.h7_future_number');
    });

    await withClient(database.runtime.url, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.h7_future (note) VALUES ('new') RETURNING id`,
      );
      await client.query(`UPDATE public.h7_future SET note = 'changed' WHERE id = $1`, [inserted.rows[0].id]);
      const { rows } = await client.query<{ next: string }>(`SELECT nextval('public.h7_future_number')::text AS next`);
      await client.query('DELETE FROM public.h7_future WHERE id = $1', [inserted.rows[0].id]);

      expect(rows[0].next).toBe('1');
    });
    expect(await asRuntime('TRUNCATE public.h7_future')).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await asRuntime(`SELECT setval('public.h7_future_number', 100)`)).toBe(INSUFFICIENT_PRIVILEGE);
    expect(
      await withClient(database.deploy.url, (client) => verifyDatabaseRoles(client, database.runtime.role)),
    ).toMatchObject({
      outcome: 'CONSISTENT',
      findings: [],
    });

    await withClient(database.deploy.url, (client) =>
      client.query('DROP TABLE public.h7_future; DROP SEQUENCE public.h7_future_number'),
    );
  });
});
