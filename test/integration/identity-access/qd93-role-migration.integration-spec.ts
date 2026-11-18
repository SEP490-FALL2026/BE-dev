import { Client } from 'pg';
import { stopCliProcesses } from '../../support/cli-process';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';
import {
  RolesWorld,
  addDepartment,
  addHeadPeriod,
  addPerson,
  grantRoleAs,
  holdApprovalRole,
  rolesWorld,
} from '../../support/direct-roles-world';
import { DEPLOY_TIMEOUT_MS, deployMigrations, migrationEndingWith } from '../../support/migration-history';

/**
 * `qd93-direct-manager-spending-approver-roles`, Task 3 (`QĐ-93a`, `QĐ-93b`, `QĐ-93k(4)`, spec › Migration): `…_identity_direct_roles`
 * on a history that stops at the migration before it, with the rows the release before wrote. It grants `MANAGER` to every head
 * today or later, moves the spending approver from `approval_role_holders` to a grant and closes that row, writes an Audit Trail
 * record (actor `SYSTEM`) for each grant, and adds the database rules of the two roles. A locked or not activated account and an
 * employee who is handing over do not stop it; a head or an approver the migration cannot carry over stops it with every such row
 * listed, and nothing is written.
 */
const BEFORE = migrationEndingWith('_identity_direct_roles_values');
const MIGRATION = migrationEndingWith('_identity_direct_roles');
const CHECK_VIOLATION = '23514';

describe('the migration of MANAGER and SPENDING_APPROVER to granted roles (integration, real PostgreSQL)', () => {
  const opened: Array<{ database: DisposableDatabase; sql: Client }> = [];

  /** A database whose history stops before the migration, with the rows `seed` writes; the migration itself is not applied. */
  const before = async (seed: (sql: Client) => Promise<void>) => {
    const database = await provisionDisposableDatabase();
    const sql = new Client({ connectionString: database.url });
    await sql.connect();
    opened.push({ database, sql });
    const deployed = await deployMigrations(database, { through: BEFORE });
    if (deployed.code !== 0) throw new Error(`Deploying the history before the migration failed: ${deployed.stdout}`);
    await seed(sql);

    return { database, sql };
  };
  /**
   * The history up to the migration under test and no further: the later migration that drops `approval_role_holders` (and stops
   * on the rows seeded here) is tested on its own.
   */
  const applied = async (database: DisposableDatabase) => deployMigrations(database, { through: MIGRATION });
  const grantsOf = async (sql: Client, role: string) =>
    (
      await sql.query<{ employee_code: string; organization_id: string; granted_by: string | null }>(
        `SELECT e.employee_code, g.organization_id, g.granted_by
           FROM role_grants g JOIN app_users u ON u.id = g.app_user_id JOIN employees e ON e.id = u.employee_id
          WHERE g.role::text = $1 AND g.revoked_at IS NULL ORDER BY e.employee_code`,
        [role],
      )
    ).rows;
  const holderRows = async (sql: Client, role: string) =>
    (
      await sql.query<{ employee_code: string; open: boolean }>(
        `SELECT e.employee_code, h.held_until IS NULL AS open
           FROM approval_role_holders h JOIN employees e ON e.id = h.employee_id WHERE h.role::text = $1 ORDER BY e.employee_code`,
        [role],
      )
    ).rows;

  afterAll(async () => {
    for (const { database, sql } of opened) {
      await sql.end().catch(() => undefined);
      await dropDisposableDatabase(database);
    }
    stopCliProcesses();
  });

  describe('data a conversion can carry', () => {
    let sql: Client;
    let notHead: { appUserId: string | null };

    beforeAll(async () => {
      const opening = await before(async (client) => {
        const world = await rolesWorld(client);
        for (const code of ['P-ENG', 'P-FUT', 'P-OLD', 'P-EXE', 'P-OPS']) await addDepartment(client, world, code);
        const current = await addPerson(client, world, { code: 'E-H1', department: 'P-ENG', account: 'ACTIVE' });
        await addHeadPeriod(client, world, { department: 'P-ENG', employeeId: current.employeeId });
        await grantRoleAs(client, world, current.appUserId as string, 'IT_ADMIN');
        const future = await addPerson(client, world, { code: 'E-H2', department: 'P-FUT', account: 'ACTIVE' });
        await addHeadPeriod(client, world, { department: 'P-FUT', employeeId: future.employeeId, from: '2099-01-01' });
        const ended = await addPerson(client, world, { code: 'E-H3', department: 'P-OLD', account: 'ACTIVE' });
        await addHeadPeriod(client, world, {
          department: 'P-OLD',
          employeeId: ended.employeeId,
          from: '2026-01-05',
          to: '2026-01-20',
        });
        const approver = await addPerson(client, world, { code: 'E-C1', department: 'P-EXE', account: 'ACTIVE' });
        await holdApprovalRole(client, world, 'SPENDING_APPROVER', approver.employeeId);
        const substitute = await addPerson(client, world, { code: 'E-S1', department: 'P-OPS', account: 'ACTIVE' });
        await holdApprovalRole(client, world, 'CONFLICT_SUBSTITUTE', substitute.employeeId);
        notHead = await addPerson(client, world, { code: 'E-N1', department: 'P-OPS', account: 'ACTIVE' });
        await grantRoleAs(client, world, notHead.appUserId as string, 'IT_ADMIN');
      });
      sql = opening.sql;
      const result = await applied(opening.database);
      if (result.code !== 0)
        throw new Error(`The migration failed on data it can carry: ${result.stdout}${result.stderr}`);
    }, DEPLOY_TIMEOUT_MS * 2);

    it('grants MANAGER to current and future heads', async () => {
      expect((await grantsOf(sql, 'MANAGER')).map((row) => row.employee_code)).toEqual(['E-H1', 'E-H2']);
      // The grant of a head who held IT_ADMIN keeps it: the two roles go together.
      expect((await grantsOf(sql, 'IT_ADMIN')).map((row) => row.employee_code)).toEqual(['E-H1', 'E-N1']);
    });

    it('moves the spending approver to a role grant and closes the old holder row', async () => {
      expect((await grantsOf(sql, 'SPENDING_APPROVER')).map((row) => row.employee_code)).toEqual(['E-C1']);
      expect(await holderRows(sql, 'SPENDING_APPROVER')).toEqual([{ employee_code: 'E-C1', open: false }]);
      // The other approval roles stay where they were.
      expect(await holderRows(sql, 'CONFLICT_SUBSTITUTE')).toEqual([{ employee_code: 'E-S1', open: true }]);
    });

    it('records each grant in the Audit Trail as the system, in the migration, with no actor', async () => {
      const { rows } = await sql.query<{
        actor_kind: string;
        actor_app_user_id: string | null;
        action: string;
        resource_type: string;
        after: { role: string; source: string; migration: string };
        correlation_id: string;
      }>(`SELECT actor_kind::text, actor_app_user_id, action, resource_type, after, correlation_id FROM audit_events
           WHERE action = 'ROLE.GRANTED' AND correlation_id LIKE '%_identity_direct_roles' ORDER BY after->>'role', resource_id`);

      expect(rows.map((row) => row.after.role)).toEqual(['MANAGER', 'MANAGER', 'SPENDING_APPROVER']);
      for (const row of rows) {
        expect(row).toMatchObject({
          actor_kind: 'SYSTEM',
          actor_app_user_id: null,
          action: 'ROLE.GRANTED',
          resource_type: 'AppUser',
          after: { source: 'QĐ-93 migration', migration: MIGRATION },
          correlation_id: MIGRATION,
        });
      }
    });

    it('refuses SPENDING_APPROVER with IT_ADMIN at the database', async () => {
      await sql.query(
        `UPDATE role_grants SET revoked_at = now() WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
      );

      await expect(
        sql.query(
          `INSERT INTO role_grants (id, organization_id, app_user_id, role)
           SELECT gen_random_uuid(), organization_id, $1, 'SPENDING_APPROVER'::"AppRole" FROM app_users WHERE id = $1`,
          [notHead.appUserId],
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it('refuses revoking MANAGER of a head at the database', async () => {
      await expect(
        sql.query(
          `UPDATE role_grants SET revoked_at = now()
            WHERE role = 'MANAGER' AND revoked_at IS NULL
              AND app_user_id = (SELECT u.id FROM app_users u JOIN employees e ON e.id = u.employee_id WHERE e.employee_code = 'E-H1')`,
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
      // A head from a later day is named already: the same refusal.
      await expect(
        sql.query(
          `UPDATE role_grants SET revoked_at = now()
            WHERE role = 'MANAGER' AND revoked_at IS NULL
              AND app_user_id = (SELECT u.id FROM app_users u JOIN employees e ON e.id = u.employee_id WHERE e.employee_code = 'E-H2')`,
        ),
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });

  it.each([
    ['locked', { code: 'E-L1', account: 'LOCKED', workState: 'WORKING' }],
    ['not activated', { code: 'E-L2', account: 'NOT_ACTIVATED', workState: 'WORKING' }],
    ['handing over', { code: 'E-L3', account: 'ACTIVE', workState: 'HANDING_OVER' }],
  ] as const)(
    'converts a spending approver whose account is %s',
    async (_state, entry) => {
      const opening = await before(async (client) => {
        const world = await rolesWorld(client);
        await addDepartment(client, world, 'P-EXE');
        const person = await addPerson(client, world, {
          code: entry.code,
          department: 'P-EXE',
          account: entry.account,
          workState: entry.workState,
        });
        await holdApprovalRole(client, world, 'SPENDING_APPROVER', person.employeeId);
      });

      const result = await applied(opening.database);

      expect(result.code).toBe(0);
      expect((await grantsOf(opening.sql, 'SPENDING_APPROVER')).map((row) => row.employee_code)).toEqual([entry.code]);
      expect(await holderRows(opening.sql, 'SPENDING_APPROVER')).toEqual([{ employee_code: entry.code, open: false }]);
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  /** Every violation of the data is listed, and nothing is written: no grant, no holder row closed. */
  const stopped = async (seed: (client: Client, world: RolesWorld) => Promise<void>, lines: string[]) => {
    const opening = await before(async (client) => {
      const world = await rolesWorld(client);
      await addDepartment(client, world, 'P-ENG');
      await addDepartment(client, world, 'P-EXE');
      await seed(client, world);
    });

    const result = await applied(opening.database);

    expect(result.code).not.toBe(0);
    const output = `${result.stdout}
${result.stderr}`;
    expect(output).toContain('QĐ-93 role conversion blocked');
    for (const line of lines) expect(output).toContain(line);
    const written = await opening.sql.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM role_grants WHERE role::text IN ('MANAGER', 'SPENDING_APPROVER')`,
    );
    expect(written.rows[0].n).toBe(0);
    expect(
      (
        await opening.sql.query(
          `SELECT 1 FROM approval_role_holders WHERE role::text = 'SPENDING_APPROVER' AND held_until IS NOT NULL`,
        )
      ).rowCount,
    ).toBe(0);
  };

  it(
    'stops and lists every violation without writing a grant: a head without an account, an approver who heads a department and holds FINANCE',
    async () => {
      await stopped(
        async (client, world) => {
          const headless = await addPerson(client, world, { code: 'E-H9', department: 'P-ENG' });
          await addHeadPeriod(client, world, { department: 'P-ENG', employeeId: headless.employeeId });
          const approver = await addPerson(client, world, { code: 'E-A1', department: 'P-EXE', account: 'ACTIVE' });
          await grantRoleAs(client, world, approver.appUserId as string, 'FINANCE');
          await addHeadPeriod(client, world, { department: 'P-EXE', employeeId: approver.employeeId });
          await holdApprovalRole(client, world, 'SPENDING_APPROVER', approver.employeeId);
        },
        [
          'HEAD_WITHOUT_ACCOUNT E-H9 P-ENG',
          'SPENDING_APPROVER_IS_HEAD E-A1 P-EXE',
          'SPENDING_APPROVER_HOLDS_FINANCE E-A1',
        ],
      );
    },
    DEPLOY_TIMEOUT_MS * 2,
  );

  it(
    'stops and lists a spending approver who has no account, and only that kind of row of the person',
    async () => {
      await stopped(
        async (client, world) => {
          const nobody = await addPerson(client, world, { code: 'E-A2', department: 'P-EXE' });
          await holdApprovalRole(client, world, 'SPENDING_APPROVER', nobody.employeeId);
        },
        ['SPENDING_APPROVER_WITHOUT_ACCOUNT E-A2'],
      );
    },
    DEPLOY_TIMEOUT_MS * 2,
  );
});
