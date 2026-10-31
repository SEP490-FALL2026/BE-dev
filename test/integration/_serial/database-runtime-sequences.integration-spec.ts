import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
  verifyDatabaseRoles,
} from '../../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../../src/infrastructure/database/roles/database-role-settings';
import { migrateDisposableDatabase } from '../../support/disposable-database';
import {
  RoleSeparatedDatabase,
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  privilegeSnapshot,
  sqlStateOf,
  withClient,
} from '../../support/role-separated-database';

const INSUFFICIENT_PRIVILEGE = '42501';
const SEQUENCE_FINDING = 'RUNTIME_SEQUENCE_PRIVILEGES';
/** The two sequences that `NoticeRepo.nextCode` (BM-09) and `SaasIssueRepo.nextCode` (BM-11) read and lift with `setval`. */
const LEGACY_SYNC = ['personnel_notice_seq', 'saas_issue_seq'];
/** The statements of `nextCode` that touch the sequence, as the repositories run them (the lift only when it is behind). */
const stateOf = (sequence: string) =>
  `SELECT (CASE WHEN is_called THEN last_value ELSE last_value - 1 END)::text AS state FROM public.${sequence}`;
const lift = (sequence: string, next: number) =>
  `SELECT setval('${sequence}', ${next}::bigint, true)
    WHERE (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM ${sequence}) < ${next}::bigint`;

/**
 * H7-SEQ (docs/rules/database-business.md, "Vai PostgreSQL (H7)"): the runtime role holds SELECT and UPDATE — and nothing
 * else — on `personnel_notice_seq` and `saas_issue_seq`, and USAGE only on every other sequence. The two are read (`SELECT
 * … FROM <sequence>`) and lifted (`setval`) by the numbering of BM-09 and BM-11, which PostgreSQL 17 allows only with
 * SELECT and UPDATE respectively. The live incident: `POST /saas-issues` failed with 42501 as the runtime role because
 * `reconcile` had granted USAGE alone. The application path is in `database-runtime-role-saas-issue-write` and
 * `database-runtime-role-notice-write`; this file proves the ACLs, the verifier and the controls. PostgreSQL 17.
 */
describe('the runtime role on sequences (integration, PostgreSQL)', () => {
  let database: RoleSeparatedDatabase;
  const asRuntime = (statement: string, values: unknown[] = []) => sqlStateOf(database.runtime.url, statement, values);
  const asDeploy = (statement: string) => withClient(database.deploy.url, (client) => client.query(statement));
  const asSuperuser = (statement: string) => withClient(database.bootstrapUrl, (client) => client.query(statement));
  const verify = () => withClient(database.deploy.url, (client) => verifyDatabaseRoles(client, database.runtime.role));
  const reconcile = () =>
    withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));
  const sequenceFindings = async () =>
    (await verify()).findings.filter((finding) => finding.code === SEQUENCE_FINDING).map((finding) => finding.subject);
  /** What the runtime role holds on each sequence of `public` by its own ACL entry, and what PUBLIC holds. */
  const aclOfSequences = async (): Promise<{ runtime: Record<string, string>; publicGrants: string[] }> =>
    withClient(database.bootstrapUrl, async (client) => {
      const runtime = await client.query<{ name: string; privileges: string }>(
        `SELECT c.relname AS name, string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privileges
           FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.relkind = 'S' AND c.relnamespace = 'public'::regnamespace
            AND a.grantee = (SELECT oid FROM pg_roles WHERE rolname = $1)
          GROUP BY c.relname ORDER BY c.relname`,
        [database.runtime.role],
      );
      const everyone = await client.query<{ name: string }>(
        `SELECT c.relname AS name FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.relkind = 'S' AND c.relnamespace = 'public'::regnamespace AND a.grantee = 0 ORDER BY 1`,
      );

      return {
        runtime: Object.fromEntries(runtime.rows.map((row) => [row.name, row.privileges])),
        publicGrants: everyone.rows.map((row) => row.name),
      };
    });
  /** Every sequence of `public` but the two: at the final schema only the one this file creates as "the next migration". */
  const ordinarySequences = async (): Promise<string[]> =>
    Object.keys((await aclOfSequences()).runtime).filter((name) => !LEGACY_SYNC.includes(name));

  beforeAll(async () => {
    database = await createRoleSeparatedDatabase();
  }, 120000);

  afterAll(async () => {
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('provisions a database that has none of the two sequences yet (an older baseline) without naming them', async () => {
    const report = await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );
    const present = await asSuperuser(
      `SELECT to_regclass('public.personnel_notice_seq') AS notice, to_regclass('public.saas_issue_seq') AS issue`,
    );

    expect(report).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(present.rows[0]).toEqual({ notice: null, issue: null });
  });

  it('migrates to the final schema, where both sequences exist and the runtime role has only the default USAGE: verify names them', async () => {
    await allowDeployToReadMarker(database);
    await migrateDisposableDatabase(database.deployHandle);
    // A sequence of some later migration: the default privileges of the deploy role give the runtime role USAGE on it.
    await asDeploy('CREATE SEQUENCE public.h7_seq_ordinary');
    const present = await asSuperuser(
      `SELECT to_regclass('public.personnel_notice_seq') AS notice, to_regclass('public.saas_issue_seq') AS issue`,
    );

    expect(present.rows[0]).toEqual({ notice: 'personnel_notice_seq', issue: 'saas_issue_seq' });
    expect((await aclOfSequences()).runtime).toMatchObject({
      personnel_notice_seq: 'USAGE',
      saas_issue_seq: 'USAGE',
      h7_seq_ordinary: 'USAGE',
    });
    expect(await sequenceFindings()).toEqual([
      'personnel_notice_seq: expected SELECT, UPDATE, has USAGE',
      'saas_issue_seq: expected SELECT, UPDATE, has USAGE',
    ]);
  });

  it('shows the live incident before the grant: as the runtime role the numbering statements fail with 42501', async () => {
    expect(await asRuntime(stateOf('saas_issue_seq'))).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await asRuntime(lift('saas_issue_seq', 1))).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await asRuntime(stateOf('personnel_notice_seq'))).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await asRuntime(lift('personnel_notice_seq', 1))).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it('reconcile grants SELECT and UPDATE on exactly the two sequences and USAGE on every other, then verify is green', async () => {
    const report = await reconcile();
    const acl = await aclOfSequences();

    expect(report).toMatchObject({ command: 'reconcile', outcome: 'DONE', findings: [] });
    expect(acl.runtime.personnel_notice_seq).toBe('SELECT,UPDATE');
    expect(acl.runtime.saas_issue_seq).toBe('SELECT,UPDATE');
    const others = Object.entries(acl.runtime).filter(([name]) => !LEGACY_SYNC.includes(name));
    expect(others.length).toBeGreaterThan(0);
    expect(others.filter(([, privileges]) => privileges !== 'USAGE')).toEqual([]);
    expect(acl.publicGrants).toEqual([]);
    expect(await verify()).toMatchObject({ command: 'verify', outcome: 'CONSISTENT', findings: [] });
  });

  it('is idempotent: a second reconcile and a provision as the cluster superuser leave every ACL as it was', async () => {
    const before = await privilegeSnapshot(database);

    expect(await reconcile()).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(await privilegeSnapshot(database)).toBe(before);
    const provisioned = await withClient(database.bootstrapUrl, (client) =>
      provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
    );

    expect(provisioned).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(await privilegeSnapshot(database)).toBe(before);
    expect(await verify()).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
  });

  it.each(LEGACY_SYNC)(
    'lets the runtime role run the statements of nextCode on %s: read the state, lift it, never lower it, draw from it',
    async (sequence) => {
      await withClient(database.runtime.url, async (client) => {
        await client.query(lift(sequence, 7));
        const lifted = await client.query<{ state: string }>(stateOf(sequence));
        await client.query(lift(sequence, 3));
        const kept = await client.query<{ state: string }>(stateOf(sequence));
        const drawn = await client.query<{ next: string }>(`SELECT nextval('${sequence}')::text AS next`);
        const current = await client.query<{ now: string }>(`SELECT currval('${sequence}')::text AS now`);

        expect(lifted.rows[0].state).toBe('7');
        expect(kept.rows[0].state).toBe('7');
        expect(drawn.rows[0].next).toBe('8');
        expect(current.rows[0].now).toBe('8');
      });
    },
  );

  describe('as the runtime role, everything else stays refused', () => {
    it('draws numbers from an ordinary sequence (USAGE) but cannot read its state or lift it', async () => {
      await withClient(database.runtime.url, async (client) => {
        const drawn = await client.query<{ next: string }>(`SELECT nextval('public.h7_seq_ordinary')::text AS next`);

        expect(drawn.rows[0].next).toBe('1');
      });
      expect(await asRuntime('SELECT last_value FROM public.h7_seq_ordinary')).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await asRuntime(`SELECT setval('public.h7_seq_ordinary', 100)`)).toBe(INSUFFICIENT_PRIVILEGE);
      expect(await asRuntime(lift('h7_seq_ordinary', 5))).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('cannot read or lift any ordinary sequence, whatever migration created it', async () => {
      const ordinary = await ordinarySequences();

      expect(ordinary).toContain('h7_seq_ordinary');
      for (const name of ordinary) {
        expect(await asRuntime(`SELECT last_value FROM public."${name}"`)).toBe(INSUFFICIENT_PRIVILEGE);
        expect(await asRuntime(`SELECT setval('public."${name}"', 1000000, true)`)).toBe(INSUFFICIENT_PRIVILEGE);
      }
    });

    it.each([
      ['create a table', 'CREATE TABLE public.h7_seq_denied (id int)'],
      ['create a sequence', 'CREATE SEQUENCE public.h7_seq_denied'],
      ['restart a legacy-sync sequence', 'ALTER SEQUENCE public.saas_issue_seq RESTART'],
      ['change the range of a legacy-sync sequence', 'ALTER SEQUENCE public.personnel_notice_seq MAXVALUE 5'],
      ['take ownership of a legacy-sync sequence', 'ALTER SEQUENCE public.saas_issue_seq OWNER TO CURRENT_USER'],
      ['drop a legacy-sync sequence', 'DROP SEQUENCE public.saas_issue_seq'],
      ['restart an ordinary sequence', 'ALTER SEQUENCE public.h7_seq_ordinary RESTART'],
    ])('cannot %s (DDL stays with the deploy role)', async (_case, statement) => {
      expect(await asRuntime(statement)).toBe(INSUFFICIENT_PRIVILEGE);
    });

    it('cannot widen its own grants: GRANT only warns and the ACLs stay as they were', async () => {
      const before = await aclOfSequences();

      expect(await asRuntime('GRANT ALL ON SEQUENCE public.h7_seq_ordinary TO PUBLIC')).toBeNull();
      expect(await asRuntime('GRANT UPDATE ON SEQUENCE public.h7_seq_ordinary TO CURRENT_USER')).toBeNull();
      expect(await aclOfSequences()).toEqual(before);
    });
  });

  describe('the verifier judges the exact privileges of every sequence', () => {
    afterEach(async () => {
      // Whatever a case did, reconcile (the deploy role's grant) restores the matrix.
      await reconcile();
      expect(await verify()).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
    });

    it.each([
      ['saas_issue_seq', 'UPDATE', 'SELECT'],
      ['saas_issue_seq', 'SELECT', 'UPDATE'],
      ['personnel_notice_seq', 'UPDATE', 'SELECT'],
      ['personnel_notice_seq', 'SELECT', 'UPDATE'],
    ])('fails when %s lacks %s (the runtime role holds only %s)', async (sequence, missing, kept) => {
      await asSuperuser(`REVOKE ${missing} ON SEQUENCE public.${sequence} FROM "${database.runtime.role}"`);

      const report = await verify();

      expect(report.outcome).toBe('INCONSISTENT');
      expect(report.findings).toEqual([
        { code: SEQUENCE_FINDING, subject: `${sequence}: expected SELECT, UPDATE, has ${kept}` },
      ]);
    });

    it.each(LEGACY_SYNC)(
      'fails when %s holds more than SELECT and UPDATE (USAGE, by the old blanket grant)',
      async (sequence) => {
        await asSuperuser(`GRANT USAGE ON SEQUENCE public.${sequence} TO "${database.runtime.role}"`);

        expect(await sequenceFindings()).toEqual([`${sequence}: expected SELECT, UPDATE, has SELECT, UPDATE, USAGE`]);
        expect((await verify()).outcome).toBe('INCONSISTENT');
      },
    );

    it('fails when an ordinary sequence holds UPDATE, or SELECT, beyond USAGE', async () => {
      const [ordinary] = await ordinarySequences();
      await asSuperuser(`GRANT UPDATE ON SEQUENCE public."${ordinary}" TO "${database.runtime.role}"`);

      expect(await sequenceFindings()).toEqual([`${ordinary}: expected USAGE, has UPDATE, USAGE`]);
      await asSuperuser(`REVOKE UPDATE ON SEQUENCE public."${ordinary}" FROM "${database.runtime.role}"`);
      await asSuperuser(`GRANT SELECT ON SEQUENCE public."${ordinary}" TO "${database.runtime.role}"`);

      expect(await sequenceFindings()).toEqual([`${ordinary}: expected USAGE, has SELECT, USAGE`]);
    });

    it('fails when PUBLIC lends the runtime role a privilege, on an ordinary or a legacy-sync sequence', async () => {
      const [ordinary] = await ordinarySequences();
      await asSuperuser(`GRANT SELECT ON SEQUENCE public."${ordinary}" TO PUBLIC`);
      await asSuperuser('GRANT USAGE ON SEQUENCE public.saas_issue_seq TO PUBLIC');

      expect((await sequenceFindings()).sort()).toEqual(
        [
          `${ordinary}: expected USAGE, has SELECT, USAGE`,
          'saas_issue_seq: expected SELECT, UPDATE, has SELECT, UPDATE, USAGE',
        ].sort(),
      );
    });
  });

  it('reconcile heals each of those states: it took UPDATE back from an ordinary sequence and the PUBLIC grants away', async () => {
    const [ordinary] = await ordinarySequences();
    await asSuperuser(`GRANT UPDATE ON SEQUENCE public."${ordinary}" TO "${database.runtime.role}"`);
    await asSuperuser('GRANT ALL ON SEQUENCE public.saas_issue_seq TO PUBLIC');

    expect((await verify()).outcome).toBe('INCONSISTENT');
    expect(await reconcile()).toMatchObject({ outcome: 'DONE', findings: [] });

    const acl = await aclOfSequences();
    expect(acl.runtime[ordinary]).toBe('USAGE');
    expect(acl.runtime.saas_issue_seq).toBe('SELECT,UPDATE');
    expect(acl.publicGrants).toEqual([]);
  });

  it('reconciles a schema that lacks one of the two sequences (an older baseline) and grants it once it exists', async () => {
    await asDeploy('DROP SEQUENCE public.saas_issue_seq');

    expect(await reconcile()).toMatchObject({ outcome: 'DONE', findings: [] });
    expect(await verify()).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
    expect((await aclOfSequences()).runtime.personnel_notice_seq).toBe('SELECT,UPDATE');

    // The migration that creates it: until the next reconcile the runtime role has the default USAGE and fails closed.
    await asDeploy('CREATE SEQUENCE "saas_issue_seq" AS INTEGER MINVALUE 1 MAXVALUE 999999');

    expect(await asRuntime(stateOf('saas_issue_seq'))).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await sequenceFindings()).toEqual(['saas_issue_seq: expected SELECT, UPDATE, has USAGE']);
    expect(await reconcile()).toMatchObject({ outcome: 'DONE', findings: [] });
    expect((await aclOfSequences()).runtime.saas_issue_seq).toBe('SELECT,UPDATE');
    expect(await asRuntime(lift('saas_issue_seq', 1))).toBeNull();
    expect(await verify()).toMatchObject({ outcome: 'CONSISTENT', findings: [] });
  });
});
