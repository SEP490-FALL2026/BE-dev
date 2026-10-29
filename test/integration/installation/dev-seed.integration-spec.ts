import { verify } from '@node-rs/argon2';
import { Client } from 'pg';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuditApi } from '../../../src/modules/audit/public/audit.api';
import { DevSeedApi, LOCAL_PASSWORD_GENERATOR } from '../../../src/modules/installation/public/dev-seed.api';
import { InstallationApi } from '../../../src/modules/installation/public/installation.api';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../../support/disposable-database';

/**
 * H6.2 `dev:seed` in process on a real PostgreSQL (NODE_ENV=test, a loopback disposable database): refusal before an
 * installation, all-or-nothing rollback, the created rows and their Audit Trail, real credentials, role invariants,
 * an idempotent rerun and a refused conflict. The password generator is deterministic here.
 */
const input = {
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
};

describe('dev:seed (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let app: INestApplicationContext;
  let seed: DevSeedApi;
  let counter = 0;

  const fingerprint = async (): Promise<string[]> => {
    const tables = await sql.query<{ name: string }>(
      `SELECT quote_ident(table_name) AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    const hashes: string[] = [];
    for (const { name } of tables.rows) {
      const row = await sql.query<{ hash: string }>(
        `SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS hash FROM ${name} t`,
      );
      hashes.push(`${name}:${row.rows[0].hash}`);
    }
    return hashes;
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    process.env.TEST_DATABASE_URL = database.url;
    const { DevSeedModule } = await import('../../../src/modules/installation/dev-seed/dev-seed.module');
    const moduleRef = await Test.createTestingModule({ imports: [DevSeedModule] })
      .overrideProvider(LOCAL_PASSWORD_GENERATOR)
      .useValue(() => `deterministic-password-${++counter}`)
      .compile();
    app = await moduleRef.init();
    seed = app.get(DevSeedApi);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    await app?.close();
    if (database) await dropDisposableDatabase(database);
  });

  it('refuses before an installation and writes nothing', async () => {
    const before = await fingerprint();

    await expect(seed.seed({ confirmLocal: true })).resolves.toEqual({
      outcome: 'REFUSED',
      refusal: 'NOT_INSTALLED',
      items: [],
    });
    expect(await fingerprint()).toEqual(before);
  });

  describe('after an installation', () => {
    let superAdmin: { id: string; hash: string };

    beforeAll(async () => {
      const { InstallationModule } = await import('../../../src/modules/installation/installation.module');
      const installer = await NestFactory.createApplicationContext(InstallationModule, { logger: false });
      try {
        await installer.get(InstallationApi).install(input, 'a long enough passphrase');
      } finally {
        await installer.close();
      }
      superAdmin = (
        await sql.query<{ id: string; hash: string }>(
          `SELECT u.id, c.hash FROM app_users u JOIN password_credentials c ON c.app_user_id = u.id`,
        )
      ).rows[0];
    }, 90000);

    it('rolls everything back when a late step fails', async () => {
      const before = await fingerprint();
      const audit = app.get(AuditApi);
      const original = audit.record.bind(audit);
      const spy = jest.spyOn(audit, 'record').mockImplementation(async (tx, event) => {
        if (event.action === 'ROLE.GRANTED' && event.after?.role === 'EMPLOYEE') throw new Error('late failure');
        return original(tx, event);
      });
      try {
        await expect(seed.seed({ confirmLocal: true })).rejects.toThrow('late failure');
      } finally {
        spy.mockRestore();
      }

      expect(await fingerprint()).toEqual(before);
    });

    it('creates the demo data through the services, with one Audit Trail run and working credentials', async () => {
      const result = await seed.seed({ confirmLocal: true });

      expect(result.outcome).toBe('CREATED');
      const passwords = new Map(result.items.filter((item) => item.password).map((item) => [item.key, item.password]));
      expect([...passwords.keys()]).toEqual(['DEMO-IT', 'DEMO-FIN', 'DEMO-EMP']);

      const accounts = await sql.query<{
        employee_code: string;
        login_email: string;
        status: string;
        activation_state: string;
        email_verification_source: string;
        roles: string[];
        hash: string;
      }>(`
        SELECT e.employee_code, u.login_email, u.status, u.activation_state, u.email_verification_source,
               array_agg(g.role::text ORDER BY g.role) AS roles, c.hash
        FROM app_users u
        JOIN employees e ON e.id = u.employee_id
        JOIN password_credentials c ON c.app_user_id = u.id
        LEFT JOIN role_grants g ON g.app_user_id = u.id AND g.revoked_at IS NULL
        WHERE e.employee_code LIKE 'DEMO-%'
        GROUP BY e.employee_code, u.login_email, u.status, u.activation_state, u.email_verification_source, c.hash
        ORDER BY e.employee_code`);
      expect(
        accounts.rows.map((row) => ({
          employee_code: row.employee_code,
          login_email: row.login_email,
          status: row.status,
          activation_state: row.activation_state,
          email_verification_source: row.email_verification_source,
          roles: row.roles,
        })),
      ).toEqual(
        [
          ['DEMO-EMP', 'employee@demo.slm.test', ['EMPLOYEE']],
          ['DEMO-FIN', 'finance@demo.slm.test', ['FINANCE']],
          ['DEMO-IT', 'it.admin@demo.slm.test', ['IT_ADMIN']],
        ].map(([employee_code, login_email, roles]) => ({
          employee_code,
          login_email,
          status: 'ACTIVE',
          activation_state: 'ACTIVATED',
          email_verification_source: 'BOOTSTRAP_ASSERTED',
          roles,
        })),
      );
      for (const row of accounts.rows as { employee_code: string; hash: string }[]) {
        await expect(verify(row.hash, passwords.get(row.employee_code) as string)).resolves.toBe(true);
      }

      const audit = await sql.query(`
        SELECT action, count(*)::int AS count, count(DISTINCT correlation_id)::int AS runs
        FROM audit_events WHERE operator_reference = 'LOCAL_SEED' GROUP BY action ORDER BY action`);
      expect(audit.rows).toEqual([
        { action: 'DEV_SEED.ACCOUNT_CREATED', count: 3, runs: 1 },
        { action: 'DEV_SEED.COST_CENTER_CREATED', count: 1, runs: 1 },
        { action: 'DEV_SEED.DEPARTMENT_CREATED', count: 1, runs: 1 },
        { action: 'DEV_SEED.EMPLOYEE_CREATED', count: 3, runs: 1 },
        { action: 'ROLE.GRANTED', count: 3, runs: 1 },
      ]);
      const trail = JSON.stringify((await sql.query(`SELECT * FROM audit_events`)).rows);
      for (const password of passwords.values()) expect(trail).not.toContain(password);
      expect(trail).not.toContain('$argon2');
    });

    it('writes the department first and the Cost Center for it, people with no job title and no activation row (QĐ-87d(1), QĐ-87e)', async () => {
      const facts = await sql.query(`
        SELECT d.code AS department, c.code AS cost_center, c.status::text AS status, c.linked_at IS NOT NULL AS linked,
               (SELECT count(*)::int FROM cost_center_direction_activations) AS activations,
               (SELECT count(*)::int FROM employees WHERE employee_code LIKE 'DEMO-%' AND job_title IS NOT NULL) AS titled
          FROM cost_centers c JOIN departments d ON d.id = c.department_id`);

      expect(facts.rows).toEqual([
        { department: 'DEMO', cost_center: 'DEMO-CC', status: 'ACTIVE', linked: true, activations: 0, titled: 0 },
      ]);
    });

    it('keeps the Super Admin, grants no derived role and creates no head period or approval holder', async () => {
      const facts = await sql.query(
        `
        SELECT (SELECT count(*)::int FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL) AS super_admins,
               (SELECT c.hash FROM password_credentials c WHERE c.app_user_id = $1) AS super_admin_hash,
               (SELECT count(*)::int FROM department_head_periods) AS head_periods,
               (SELECT count(*)::int FROM approval_role_holders) AS approval_holders,
               (SELECT array_agg(DISTINCT role::text ORDER BY role::text) FROM role_grants) AS roles`,
        [superAdmin.id],
      );

      expect(facts.rows).toEqual([
        {
          super_admins: 1,
          super_admin_hash: superAdmin.hash,
          head_periods: 0,
          approval_holders: 0,
          roles: ['EMPLOYEE', 'FINANCE', 'IT_ADMIN', 'SUPER_ADMIN'],
        },
      ]);
    });

    it('finds everything already present on a rerun: no write, no password, no credential reset', async () => {
      const before = await fingerprint();

      const result = await seed.seed({ confirmLocal: true });

      expect(result.outcome).toBe('ALREADY_PRESENT');
      expect(result.items).toHaveLength(8);
      expect(result.items.every((item) => item.state === 'already-present' && item.password === undefined)).toBe(true);
      expect(await fingerprint()).toEqual(before);
    });

    it('refuses the whole run, and repairs nothing, when demo data was changed by hand', async () => {
      await sql.query(`UPDATE employees SET full_name = 'Changed By Hand' WHERE employee_code = 'DEMO-FIN'`);
      await sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE login_email = 'employee@demo.slm.test'`);
      try {
        const before = await fingerprint();
        const result = await seed.seed({ confirmLocal: true });

        expect(result).toMatchObject({ outcome: 'REFUSED', refusal: 'CONFLICT' });
        expect(result.items.filter((item) => item.state === 'conflict')).toEqual([
          { kind: 'EMPLOYEE', key: 'DEMO-FIN', state: 'conflict', reason: 'EMPLOYEE_DIFFERS' },
          {
            kind: 'ACCOUNT',
            key: 'DEMO-EMP',
            state: 'conflict',
            reason: 'ACCOUNT_DIFFERS',
            role: 'EMPLOYEE',
            loginEmail: 'employee@demo.slm.test',
          },
        ]);
        expect(await fingerprint()).toEqual(before);
      } finally {
        await sql.query(`UPDATE app_users SET status = 'ACTIVE' WHERE login_email = 'employee@demo.slm.test'`);
        await sql.query(`UPDATE employees SET full_name = 'Demo Finance' WHERE employee_code = 'DEMO-FIN'`);
      }
    });

    it('P23-RV-01: refuses a DEMO department whose name was changed, and changes nothing', async () => {
      await sql.query(`UPDATE departments SET name = 'Renamed By Hand' WHERE code = 'DEMO'`);
      try {
        const before = await fingerprint();
        const result = await seed.seed({ confirmLocal: true });

        expect(result).toMatchObject({ outcome: 'REFUSED', refusal: 'CONFLICT' });
        expect(result.items.filter((item) => item.state === 'conflict')).toEqual([
          { kind: 'DEPARTMENT', key: 'DEMO', state: 'conflict', reason: 'DEPARTMENT_NAME_DIFFERS' },
        ]);
        expect(result.items.some((item) => item.password !== undefined)).toBe(false);
        expect(await fingerprint()).toEqual(before);
      } finally {
        await sql.query(`UPDATE departments SET name = 'Demo department' WHERE code = 'DEMO'`);
      }
    });

    it('P23-RV-01: refuses a DEMO department whose Cost Center in use is another one, and changes nothing', async () => {
      // The Cost Center the department answers to is not DEMO-CC (here: its code was changed by hand).
      await sql.query(`UPDATE cost_centers SET code = 'OTHER-CC' WHERE code = 'DEMO-CC'`);
      try {
        const before = await fingerprint();
        const result = await seed.seed({ confirmLocal: true });

        expect(result).toMatchObject({ outcome: 'REFUSED', refusal: 'CONFLICT' });
        expect(result.items.filter((item) => item.state === 'conflict')).toEqual([
          { kind: 'DEPARTMENT', key: 'DEMO', state: 'conflict', reason: 'DEPARTMENT_COST_CENTER_DIFFERS' },
        ]);
        expect(await fingerprint()).toEqual(before);
      } finally {
        await sql.query(`UPDATE cost_centers SET code = 'DEMO-CC' WHERE code = 'OTHER-CC'`);
      }
      // Back to the fixture: a rerun finds everything present again.
      await expect(seed.seed({ confirmLocal: true })).resolves.toMatchObject({ outcome: 'ALREADY_PRESENT' });
    });
  });
});
