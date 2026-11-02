import { Client } from 'pg';
import { CLI_COLD_START_MS, cliWorkingDirectory, runCli, stopCliProcesses } from '../../support/cli-process';
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
  clearPeople,
  grantRoleAs,
  holdApprovalRole,
  rolesWorld,
} from '../../support/direct-roles-world';
import { DEPLOY_TIMEOUT_MS, deployMigrations, migrationEndingWith } from '../../support/migration-history';

/**
 * `qd93-direct-manager-spending-approver-roles`, Task 2 (`QĐ-93k(4)`, spec › Preflight): `ops:preflight` lists, before
 * `migrate deploy`, the four kinds of row the conversion of `MANAGER` and `SPENDING_APPROVER` to granted roles stops for — a head
 * without an account, a spending approver who heads a department, who holds another role, who has no account — one line for each,
 * exit code 2, and fixes none. A spending approver whose account is locked or not activated, or who is handing over, is carried
 * over and blocks nothing (`US-01-03` AC-9, AC-10). The command is real (`src/cli.ts preflight` through ts-node) on a database
 * whose history Prisma recorded itself, stopped at the last migration before `…_identity_direct_roles`.
 */
const BEFORE = migrationEndingWith('_identity_direct_roles_values');

interface Report {
  status: 'READY' | 'BLOCKED';
  history: string;
  blockers: Array<{ code: string; employeeCode?: string; department?: string; role?: string }>;
}

describe('ops:preflight, the conversion of MANAGER and SPENDING_APPROVER (integration, real CLI and PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let world: RolesWorld;

  const preflight = async (): Promise<{ code: number | null; report: Report }> => {
    const result = await runCli('preflight', ['--json'], {
      cwd: cliWorkingDirectory('slm-preflight-roles'),
      environment: { NODE_ENV: 'production', DATABASE_URL: database.url },
    });
    if (result.code !== 0 && result.code !== 2) throw new Error(`preflight ${result.code}: ${result.stderr}`);

    return { code: result.code, report: JSON.parse(result.stdout) as Report };
  };
  const ofRoles = (report: Report) => report.blockers.filter((blocker) => blocker.code.startsWith('DIRECT_ROLES_'));

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    const deployed = await deployMigrations(database, { through: BEFORE });
    if (deployed.code !== 0) throw new Error(`Deploying the history before the conversion failed: ${deployed.stdout}`);
    world = await rolesWorld(sql);
    await addDepartment(sql, world, 'P-ENG');
    await addDepartment(sql, world, 'P-EXE');
  }, DEPLOY_TIMEOUT_MS + 60000);

  afterEach(async () => {
    await clearPeople(sql, world);
  });

  afterAll(async () => {
    await sql?.end();
    if (database) await dropDisposableDatabase(database);
    stopCliProcesses();
  });

  it(
    'is ready, and lists nothing, for data the conversion can carry',
    async () => {
      const head = await addPerson(sql, world, { code: 'E-H1', department: 'P-ENG', account: 'ACTIVE' });
      await addHeadPeriod(sql, world, { department: 'P-ENG', employeeId: head.employeeId });
      const approver = await addPerson(sql, world, { code: 'E-C1', department: 'P-EXE', account: 'ACTIVE' });
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', approver.employeeId);

      const { code, report } = await preflight();

      expect(code).toBe(0);
      expect(report.status).toBe('READY');
      expect(ofRoles(report)).toEqual([]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'blocks the QĐ-93 role conversion and lists a head without an account',
    async () => {
      const head = await addPerson(sql, world, { code: 'E-H2', department: 'P-ENG' });
      await addHeadPeriod(sql, world, { department: 'P-ENG', employeeId: head.employeeId });
      // A head from a later day counts as well; a head whose period ended does not.
      const next = await addPerson(sql, world, { code: 'E-H3', department: 'P-EXE' });
      await addHeadPeriod(sql, world, { department: 'P-EXE', employeeId: next.employeeId, from: '2099-01-01' });
      const past = await addPerson(sql, world, { code: 'E-H4', department: 'P-EXE' });
      await addHeadPeriod(sql, world, {
        department: 'P-EXE',
        employeeId: past.employeeId,
        from: '2026-01-05',
        to: '2026-01-20',
      });

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(report.status).toBe('BLOCKED');
      expect(ofRoles(report)).toEqual([
        { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT', employeeCode: 'E-H2', department: 'P-ENG' },
        { code: 'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT', employeeCode: 'E-H3', department: 'P-EXE' },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'lists a spending approver who heads a department, today or from a later day',
    async () => {
      const current = await addPerson(sql, world, { code: 'E-C2', department: 'P-ENG', account: 'ACTIVE' });
      await addHeadPeriod(sql, world, { department: 'P-ENG', employeeId: current.employeeId });
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', current.employeeId);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(ofRoles(report)).toEqual([
        { code: 'DIRECT_ROLES_SPENDING_APPROVER_IS_HEAD', employeeCode: 'E-C2', department: 'P-ENG' },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'lists a spending approver who also holds IT_ADMIN or FINANCE, one line for each role',
    async () => {
      const approver = await addPerson(sql, world, { code: 'E-C3', department: 'P-EXE', account: 'ACTIVE' });
      await grantRoleAs(sql, world, approver.appUserId as string, 'FINANCE');
      await grantRoleAs(sql, world, approver.appUserId as string, 'IT_ADMIN');
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', approver.employeeId);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(ofRoles(report)).toEqual([
        { code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE', employeeCode: 'E-C3', role: 'FINANCE' },
        { code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE', employeeCode: 'E-C3', role: 'IT_ADMIN' },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'lists a spending approver who also holds SUPER_ADMIN',
    async () => {
      const approver = await addPerson(sql, world, { code: 'E-C6', department: 'P-EXE', account: 'ACTIVE' });
      // The grant first: the Super Admin trigger refuses a grant to someone who already holds an approval role.
      await grantRoleAs(sql, world, approver.appUserId as string, 'SUPER_ADMIN');
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', approver.employeeId);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(ofRoles(report)).toEqual([
        { code: 'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE', employeeCode: 'E-C6', role: 'SUPER_ADMIN' },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'lists a spending approver who has no account',
    async () => {
      const approver = await addPerson(sql, world, { code: 'E-C4', department: 'P-EXE' });
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', approver.employeeId);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(ofRoles(report)).toEqual([
        { code: 'DIRECT_ROLES_SPENDING_APPROVER_WITHOUT_ACCOUNT', employeeCode: 'E-C4' },
      ]);
    },
    CLI_COLD_START_MS,
  );

  it(
    'does not block a spending approver whose account is locked, not activated or who hands over (US-01-03 AC-9, AC-10)',
    async () => {
      const locked = await addPerson(sql, world, { code: 'E-L1', department: 'P-EXE', account: 'LOCKED' });
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', locked.employeeId);

      const lockedRun = await preflight();
      expect([lockedRun.code, ofRoles(lockedRun.report)]).toEqual([0, []]);

      await clearPeople(sql, world);
      const invited = await addPerson(sql, world, { code: 'E-L2', department: 'P-EXE', account: 'NOT_ACTIVATED' });
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', invited.employeeId);

      const invitedRun = await preflight();
      expect([invitedRun.code, ofRoles(invitedRun.report)]).toEqual([0, []]);

      await clearPeople(sql, world);
      const leaving = await addPerson(sql, world, {
        code: 'E-L3',
        department: 'P-EXE',
        account: 'ACTIVE',
        workState: 'HANDING_OVER',
      });
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', leaving.employeeId);

      const leavingRun = await preflight();
      expect([leavingRun.code, ofRoles(leavingRun.report)]).toEqual([0, []]);
    },
    CLI_COLD_START_MS * 3,
  );

  it(
    'reads the four kinds together, one line for each row, in the order of the code and then of the person',
    async () => {
      const headless = await addPerson(sql, world, { code: 'E-H5', department: 'P-ENG' });
      await addHeadPeriod(sql, world, { department: 'P-ENG', employeeId: headless.employeeId });
      const approver = await addPerson(sql, world, { code: 'E-C5', department: 'P-EXE', account: 'ACTIVE' });
      await grantRoleAs(sql, world, approver.appUserId as string, 'FINANCE');
      await holdApprovalRole(sql, world, 'SPENDING_APPROVER', approver.employeeId);

      const { code, report } = await preflight();

      expect(code).toBe(2);
      expect(ofRoles(report).map((blocker) => blocker.code)).toEqual([
        'DIRECT_ROLES_HEAD_WITHOUT_ACCOUNT',
        'DIRECT_ROLES_SPENDING_APPROVER_HOLDS_ROLE',
      ]);
    },
    CLI_COLD_START_MS,
  );
});
