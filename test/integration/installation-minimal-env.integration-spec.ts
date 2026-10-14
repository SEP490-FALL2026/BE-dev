import { Client } from 'pg';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import {
  PASSWORD_HASH_POLICY_VERSION,
  PasswordHasher,
} from '../../src/modules/identity-access/password-hasher.service';
import { AlreadyInstalledError, InstallationService } from '../../src/modules/installation/installation.service';
import { MailTransport } from '../../src/modules/notifications/mail-transport';
import { PAYLOAD_CIPHER } from '../../src/modules/notifications/notifications.tokens';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';
import { findPlacementCoverageViolations } from '../support/placement-coverage';

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

const EMPTY_COUNTS = {
  organizations: 0,
  cost_centers: 0,
  departments: 0,
  job_titles: 0,
  employees: 0,
  placements: 0,
  app_users: 0,
  role_grants: 0,
  audit_events: 0,
};

/** Keys the command must not need: everything except the database and NODE_ENV (R-13). */
const UNRELATED_PREFIXES = ['AUTH_', 'SMTP_', 'REDIS_', 'OBJECT_STORAGE_', 'OUTBOX_'];
const UNRELATED_KEYS = ['APP_PUBLIC_URL', 'CORS_ORIGINS', 'TEST_DATABASE_URL'];

describe('installation command with only DATABASE_URL and NODE_ENV=production (integration, R-13)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let app: INestApplicationContext;
  let service: InstallationService;
  let previousEnvironment: NodeJS.ProcessEnv;

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
    await sql.query(`
      ALTER TABLE audit_events DISABLE TRIGGER USER;
      TRUNCATE audit_events, role_grants, password_credentials, app_users, employee_placements, employees,
               job_titles, departments, cost_centers, organizations CASCADE;
      ALTER TABLE audit_events ENABLE TRIGGER USER;`);
  };

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);

    previousEnvironment = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (UNRELATED_KEYS.includes(key) || UNRELATED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        delete process.env[key];
      }
    }
    // The production shape of the command: the runtime role's URL and NODE_ENV from the image.
    // resolveDatabaseUrl only switches to TEST_DATABASE_URL in the test environment, so the
    // disposable database is reached through DATABASE_URL itself.
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = database.url;

    // ConfigModule.forRoot validates process.env when the module is first imported.
    const { InstallationModule } = await import('../../src/modules/installation/installation.module');
    app = await NestFactory.createApplicationContext(InstallationModule, { logger: false });
    service = app.get(InstallationService);
    sql = new Client({ connectionString: database.url });
    await sql.connect();
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    await app?.close();
    process.env = previousEnvironment;
    if (database) await dropDisposableDatabase(database);
  });

  beforeEach(reset);

  it('boots without the JWT, mail or outbox-cipher providers', () => {
    expect(() => {
      app.get(JwtService, { strict: false });
    }).toThrow();
    expect(() => {
      app.get(PAYLOAD_CIPHER, { strict: false });
    }).toThrow();
    expect(() => {
      app.get(MailTransport, { strict: false });
    }).toThrow();
  });

  it('installs with the same rows and audit as the full-environment run', async () => {
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
  });

  it('a second run reports AlreadyInstalled and changes nothing', async () => {
    await service.install(input(), PASSWORD);
    const before = await counts();

    await expect(service.install({ ...input(), organizationName: 'Other' }, PASSWORD)).rejects.toBeInstanceOf(
      AlreadyInstalledError,
    );
    expect(await counts()).toEqual(before);
  });

  it('leaves nothing behind when a late step fails, and the next run succeeds', async () => {
    const audit = app.get(AuditService);
    const original = audit.record.bind(audit);
    let calls = 0;
    const spy = jest.spyOn(audit, 'record').mockImplementation(async (tx, event) => {
      calls += 1;
      if (calls === 7) throw new Error('audit unavailable');
      return original(tx, event);
    });
    try {
      await expect(service.install(input(), PASSWORD)).rejects.toThrow('audit unavailable');
    } finally {
      spy.mockRestore();
    }

    expect(await counts()).toEqual(EMPTY_COUNTS);
    await expect(service.install(input(), PASSWORD)).resolves.toBeDefined();
  });

  it('stores the same Argon2id credential the API verifies at sign-in', async () => {
    await service.install(input(), PASSWORD);

    const row = (await sql.query<{ hash: string; hash_policy_version: number }>(
      'SELECT hash, hash_policy_version FROM password_credentials',
    )) as { rows: { hash: string; hash_policy_version: number }[] };

    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(row.rows[0].hash_policy_version).toBe(PASSWORD_HASH_POLICY_VERSION);
    await expect(app.get(PasswordHasher).verify(row.rows[0].hash, PASSWORD)).resolves.toBe(true);
    await expect(app.get(PasswordHasher).verify(row.rows[0].hash, 'another passphrase')).resolves.toBe(false);
  });

  it('applies the resolved idle-in-transaction default (20 s) to the command connection', async () => {
    const result = await app
      .get(PrismaService)
      .$queryRawUnsafe<{ value: string }[]>(`SELECT current_setting('idle_in_transaction_session_timeout') AS value`);

    expect(result).toEqual([{ value: '20s' }]);
  });
});
