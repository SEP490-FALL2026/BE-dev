import { Client } from 'pg';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AuditService } from '../../src/modules/audit/audit.service';
import { AlreadyInstalledError, InstallationInputError } from '../../src/modules/installation/installation.errors';
import { InstallationService } from '../../src/modules/installation/installation.service';
import { PasswordPolicyError } from '../../src/modules/identity-access/identity-access.errors';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { findPlacementCoverageViolations } from '../support/placement-coverage';
import { RESET_INSTALLATION_SQL } from '../support/reset-installation';

const PASSWORD = 'a long enough passphrase';

/** What the command is given since `QĐ-87f`(1): the organization, one department and the Super Admin's person. */
const input = () => ({
  timeZone: 'Asia/Ho_Chi_Minh',
  reportingCurrency: 'VND',
  organizationName: 'Acme Software',
  departmentCode: 'P-ENG',
  departmentName: 'Engineering',
  superAdmin: {
    employeeCode: 'E001',
    fullName: 'Pham Bao',
    workEmail: 'bao@acme.vn',
    employmentType: 'STAFF',
    hireDate: '2024-03-01',
  },
  operatorReference: 'CHG-1234',
  environment: 'LOCAL_TEST',
});

describe('installation command use case (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let app: INestApplicationContext;
  let service: InstallationService;

  const counts = async () =>
    (
      await sql.query<Record<string, number>>(`
        SELECT (SELECT count(*) FROM organizations)::int AS organizations,
               (SELECT count(*) FROM cost_centers)::int AS cost_centers,
               (SELECT count(*) FROM departments)::int AS departments,
               (SELECT count(*) FROM employees)::int AS employees,
               (SELECT count(*) FROM employee_placements)::int AS placements,
               (SELECT count(*) FROM app_users)::int AS app_users,
               (SELECT count(*) FROM role_grants)::int AS role_grants,
               (SELECT count(*) FROM audit_events)::int AS audit_events`)
    ).rows[0];

  const reset = async () => {
    await sql.query(RESET_INSTALLATION_SQL);
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    process.env.TEST_DATABASE_URL = database.url;
    const { InstallationModule } = await import('../../src/modules/installation/installation.module');
    app = await NestFactory.createApplicationContext(InstallationModule, { logger: false });
    service = app.get(InstallationService);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    await app?.close();
    if (database) await dropDisposableDatabase(database);
  });

  beforeEach(reset);

  it('creates the minimum installation, with audit and clean placement coverage (US-01-01 AC-19, QĐ-87f(1))', async () => {
    const result = await service.install(input(), PASSWORD);

    expect(await counts()).toEqual({
      organizations: 1,
      cost_centers: 0,
      departments: 1,
      employees: 1,
      placements: 1,
      app_users: 1,
      role_grants: 1,
      audit_events: 5,
    });

    const placements = await sql.query(
      `SELECT e.employee_code, p.valid_from::text AS valid_from, p.valid_to
       FROM employee_placements p JOIN employees e ON e.id = p.employee_id ORDER BY e.employee_code`,
    );
    expect(placements.rows).toEqual([{ employee_code: 'E001', valid_from: '2024-03-01', valid_to: null }]);

    const account = await sql.query(
      `SELECT u.status, u.activation_state, u.email_verification_source, e.employee_code, g.role,
              (SELECT count(*) FROM password_credentials) AS credentials
       FROM app_users u JOIN employees e ON e.id = u.employee_id JOIN role_grants g ON g.app_user_id = u.id`,
    );
    expect(account.rows).toEqual([
      {
        status: 'ACTIVE',
        activation_state: 'ACTIVATED',
        email_verification_source: 'BOOTSTRAP_ASSERTED',
        employee_code: 'E001',
        role: 'SUPER_ADMIN',
        credentials: '1',
      },
    ]);

    const audit = await sql.query(`SELECT DISTINCT actor_kind, operator_reference, correlation_id FROM audit_events`);
    expect(audit.rows).toEqual([
      { actor_kind: 'OPERATOR', operator_reference: 'CHG-1234', correlation_id: result.correlationId },
    ]);
    await expect(findPlacementCoverageViolations(sql)).resolves.toEqual([]);

    // No secret in the audit trail.
    const everything = JSON.stringify((await sql.query('SELECT * FROM audit_events')).rows);
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toContain('$argon2');
  });

  it('leaves the first department with no Cost Center, head or IT Admin in charge, and the Super Admin without a job title (QĐ-87f(1))', async () => {
    await service.install(input(), PASSWORD);

    const facts = await sql.query(`
      SELECT (SELECT count(*)::int FROM cost_centers) AS cost_centers,
             (SELECT count(*)::int FROM department_head_periods) AS head_periods,
             (SELECT count(*)::int FROM departments WHERE it_admin_employee_id IS NOT NULL) AS with_it_admin,
             (SELECT count(*)::int FROM approval_role_holders) AS approval_holders,
             (SELECT job_title FROM employees WHERE employee_code = 'E001') AS job_title,
             (SELECT d.code FROM employee_placements p JOIN departments d ON d.id = p.department_id) AS department`);

    expect(facts.rows).toEqual([
      { cost_centers: 0, head_periods: 0, with_it_admin: 0, approval_holders: 0, job_title: null, department: 'P-ENG' },
    ]);
  });

  it('marks every audit event of the installation as the installation exception, and writes one per record', async () => {
    await service.install(input(), PASSWORD);

    const events = await sql.query<{ action: string; marked: string | null }>(
      `SELECT action, after ->> 'installationException' AS marked FROM audit_events ORDER BY occurred_at, action`,
    );

    expect(events.rows.map((row) => row.action).sort()).toEqual([
      'INSTALLATION.DEPARTMENT_CREATED',
      'INSTALLATION.EMPLOYEE_CREATED',
      'INSTALLATION.ORGANIZATION_CREATED',
      'INSTALLATION.SUPER_ADMIN_CREATED',
      'ROLE.GRANTED',
    ]);
    expect(events.rows.every((row) => row.marked === 'true')).toBe(true);
  });

  it('a second run changes nothing and reports AlreadyInstalled', async () => {
    await service.install(input(), PASSWORD);
    const before = await counts();

    await expect(service.install({ ...input(), organizationName: 'Other' }, PASSWORD)).rejects.toBeInstanceOf(
      AlreadyInstalledError,
    );
    expect(await counts()).toEqual(before);
  });

  it('two simultaneous runs: one installs, the other finds it installed and writes nothing', async () => {
    const outcomes = await Promise.allSettled([service.install(input(), PASSWORD), service.install(input(), PASSWORD)]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(AlreadyInstalledError);
    expect((await counts()).organizations).toBe(1);
    expect((await counts()).role_grants).toBe(1);
  });

  it('leaves nothing behind when a late step fails after earlier rows were written', async () => {
    const audit = app.get(AuditService);
    const original = audit.record.bind(audit);
    let calls = 0;
    const spy = jest.spyOn(audit, 'record').mockImplementation(async (tx, event) => {
      calls += 1;
      // The Super Admin account's own audit event is the 4th write (organization, department, employee, account); failing
      // there means the organization, the person and the account itself already exist inside the transaction.
      if (calls === 4) throw new Error('audit unavailable');
      return original(tx, event);
    });
    try {
      await expect(service.install(input(), PASSWORD)).rejects.toThrow('audit unavailable');
    } finally {
      spy.mockRestore();
    }

    expect(await counts()).toEqual({
      organizations: 0,
      cost_centers: 0,
      departments: 0,
      employees: 0,
      placements: 0,
      app_users: 0,
      role_grants: 0,
      audit_events: 0,
    });
    // The failed run did not block the next one.
    await expect(service.install(input(), PASSWORD)).resolves.toBeDefined();
  });

  it('rejects bad input before writing anything: the earlier shape, a placeholder, a weak password', async () => {
    const earlier = { ...input(), costCenterCode: 'CC-ENG', costCenterName: 'Engineering', jobTitleName: 'Engineer' };
    await expect(service.install(earlier, PASSWORD)).rejects.toBeInstanceOf(InstallationInputError);
    await expect(service.install({ ...input(), departmentName: 'Chưa phân loại' }, PASSWORD)).rejects.toBeInstanceOf(
      InstallationInputError,
    );
    await expect(service.install(input(), 'short')).rejects.toBeInstanceOf(PasswordPolicyError);
    await expect(service.install(input(), 'bao@acme.vn')).rejects.toBeInstanceOf(PasswordPolicyError);

    expect((await counts()).organizations).toBe(0);
  });

  it('can be followed by the real runner without leaving a stuck advisory lock', async () => {
    await service.install(input(), PASSWORD);
    const locks = await sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'`);
    expect(locks.rows[0].n).toBe(0);
    expect(app.get(TransactionRunner)).toBeDefined();
  });
});
