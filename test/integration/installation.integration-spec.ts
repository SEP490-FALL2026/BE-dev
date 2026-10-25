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

const input = () => ({
  timeZone: 'Asia/Ho_Chi_Minh',
  reportingCurrency: 'VND',
  organizationName: 'Acme Software',
  costCenterCode: 'CC-ENG',
  costCenterName: 'Engineering',
  departmentCode: 'P-ENG',
  departmentName: 'Engineering',
  jobTitleName: 'Software Engineer',
  superAdmin: {
    employeeCode: 'E001',
    fullName: 'Pham Bao',
    workEmail: 'bao@acme.vn',
    employmentType: 'STAFF',
    hireDate: '2024-03-01',
  },
  itAdmin: {
    employeeCode: 'E002',
    fullName: 'Tran An',
    workEmail: 'an@acme.vn',
    employmentType: 'STAFF',
    hireDate: '2024-03-05',
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
               (SELECT count(*) FROM job_titles)::int AS job_titles,
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

  it('creates the minimum installation, with audit and clean placement coverage (US-01-01 AC-19)', async () => {
    const result = await service.install(input(), PASSWORD);

    expect(await counts()).toEqual({
      organizations: 1,
      cost_centers: 1,
      departments: 1,
      job_titles: 1,
      employees: 2,
      placements: 2,
      app_users: 1,
      role_grants: 1,
      audit_events: 8,
    });

    const placements = await sql.query(
      `SELECT e.employee_code, p.valid_from::text AS valid_from, p.valid_to
       FROM employee_placements p JOIN employees e ON e.id = p.employee_id ORDER BY e.employee_code`,
    );
    expect(placements.rows).toEqual([
      { employee_code: 'E001', valid_from: '2024-03-01', valid_to: null },
      { employee_code: 'E002', valid_from: '2024-03-05', valid_to: null },
    ]);

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
    // The IT employee exists without an account.
    const withoutAccount = await sql.query(
      `SELECT e.employee_code FROM employees e LEFT JOIN app_users u ON u.employee_id = e.id WHERE u.id IS NULL`,
    );
    expect(withoutAccount.rows).toEqual([{ employee_code: 'E002' }]);

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
      // The Super Admin account's own audit event is the 7th write; failing there means the
      // organization, people and the account itself already exist inside the transaction.
      if (calls === 7) throw new Error('audit unavailable');
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
      job_titles: 0,
      employees: 0,
      placements: 0,
      app_users: 0,
      role_grants: 0,
      audit_events: 0,
    });
    // The failed run did not block the next one.
    await expect(service.install(input(), PASSWORD)).resolves.toBeDefined();
  });

  it('rejects bad input before writing anything: duplicate email, placeholder, weak password', async () => {
    const duplicate = { ...input(), itAdmin: { ...input().itAdmin, workEmail: 'BAO+it@acme.vn' } };
    await expect(service.install(duplicate, PASSWORD)).rejects.toBeInstanceOf(InstallationInputError);
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
