import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AlreadyInstalledError } from '../../src/modules/installation/installation.errors';
import { InstallationService } from '../../src/modules/installation/installation.service';
import { AccountDirectoryService } from '../../src/modules/identity-access/accounts/account-directory.service';
import { RoleGrantService } from '../../src/modules/identity-access/accounts/role-grant.service';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from '../support/disposable-database';

/**
 * Characterization for H6.1/H6.2 (Prompt 23, Phase 0): what an installation leaves in the database, the read paths an
 * inspection relies on, and the database backstops a local seed must respect. Pinned on the Prompt 22 baseline.
 */
const PASSWORD = 'a long enough passphrase';
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');

const input = {
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
};

/** Rolls back whatever the callback wrote and reports the error that ended it. */
class Rollback extends Error {}

describe('installation bootstrap facts (integration, real PostgreSQL)', () => {
  let database: DisposableDatabase;
  let sql: Client;
  let app: INestApplicationContext;

  beforeAll(async () => {
    database = await provisionDisposableDatabase();
    await migrateDisposableDatabase(database);
    process.env.TEST_DATABASE_URL = database.url;
    const { InstallationModule } = await import('../../src/modules/installation/installation.module');
    app = await NestFactory.createApplicationContext(InstallationModule, { logger: false });
    sql = new Client({ connectionString: database.url });
    await sql.connect();
    await app.get(InstallationService).install(input, PASSWORD);
  }, 90000);

  afterAll(async () => {
    await sql?.end();
    await app?.close();
    if (database) await dropDisposableDatabase(database);
  });

  it('records exactly these audit actions, once each except the two employees', async () => {
    const audit = await sql.query<{ action: string; count: number }>(
      `SELECT action, count(*)::int AS count FROM audit_events GROUP BY action ORDER BY action`,
    );

    expect(audit.rows).toEqual([
      { action: 'INSTALLATION.COST_CENTER_CREATED', count: 1 },
      { action: 'INSTALLATION.DEPARTMENT_CREATED', count: 1 },
      { action: 'INSTALLATION.EMPLOYEE_CREATED', count: 2 },
      { action: 'INSTALLATION.ORGANIZATION_CREATED', count: 1 },
      { action: 'INSTALLATION.SUPER_ADMIN_CREATED', count: 1 },
      { action: 'ROLE.GRANTED', count: 1 },
    ]);
  });

  it('marks the organization bootstrapped and sets no head, IT Admin or approval role', async () => {
    const facts = await sql.query(`
      SELECT (SELECT bootstrap_completed_at IS NOT NULL FROM organizations) AS bootstrapped,
             (SELECT count(*)::int FROM department_head_periods) AS head_periods,
             (SELECT count(*)::int FROM departments WHERE it_admin_employee_id IS NOT NULL) AS with_it_admin,
             (SELECT count(*)::int FROM approval_role_holders) AS approval_holders,
             (SELECT array_agg(DISTINCT kind::text) FROM cost_centers) AS kinds`);

    expect(facts.rows).toEqual([
      { bootstrapped: true, head_periods: 0, with_it_admin: 0, approval_holders: 0, kinds: ['UNIT'] },
    ]);
  });

  it('applies every committed migration folder, each finished and none rolled back', async () => {
    const folders = readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const applied = await sql.query<{ migration_name: string; finished: boolean; rolled_back: boolean }>(
      `SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
       FROM _prisma_migrations ORDER BY migration_name`,
    );

    expect(applied.rows.map((row) => row.migration_name)).toEqual(folders);
    expect(applied.rows.every((row) => row.finished && !row.rolled_back)).toBe(true);
  });

  it('finds the Super Admin holder and reads its account without any credential field', async () => {
    const runner = app.get(TransactionRunner);
    const holder = await runner.run((tx) => app.get(RoleGrantService).findSuperAdminHolderId(tx));
    const record = await app.get(AccountDirectoryService).findAccountRecord(holder ?? '');

    expect(holder).not.toBeNull();
    expect(record).toMatchObject({ status: 'ACTIVE', activationState: 'ACTIVATED', loginEmail: 'bao@acme.vn' });
    expect(JSON.stringify(record)).not.toMatch(/argon2|hash|password/i);
  });

  it('reports a second installation as already installed and writes nothing', async () => {
    const before = await sql.query(`SELECT count(*)::int AS n FROM audit_events`);

    await expect(app.get(InstallationService).install(input, PASSWORD)).rejects.toBeInstanceOf(AlreadyInstalledError);
    expect((await sql.query(`SELECT count(*)::int AS n FROM audit_events`)).rows).toEqual(before.rows);
  });

  describe('database backstops a local seed reuses', () => {
    const attempt = async (write: (tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0]) => Promise<void>) => {
      try {
        await app.get(TransactionRunner).run(async (tx) => {
          await write(tx);
          throw new Rollback();
        });
      } catch (error) {
        return error;
      }
      return undefined;
    };

    const newEmployee = async (tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0], code: string) => {
      const organization = app.get(OrganizationService);
      const org = await organization.getOrganization(tx);
      const lookup = await organization.lookupForEmployeeImport(
        {
          departmentCodes: ['P-ENG'],
          employeeCodes: [],
          normalizedEmails: [],
        },
        tx,
      );
      const { id } = await organization.createEmployeeWithPlacement(tx, {
        organizationId: org!.id,
        employeeCode: code,
        fullName: `Person ${code}`,
        workEmail: `${code.toLowerCase()}@acme.vn`,
        employmentType: 'STAFF',
        hireDate: '2024-04-01',
        departmentId: lookup.departments[0].id,
        jobTitle: 'Software Engineer',
      });
      const user = await app.get(AccountDirectoryService).createAppUser(tx, {
        organizationId: org!.id,
        employeeId: id,
        loginEmail: `${code.toLowerCase()}@acme.vn`,
        normalizedLoginEmail: `${code.toLowerCase()}@acme.vn`,
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        emailVerificationSource: 'BOOTSTRAP_ASSERTED',
        emailVerifiedAt: new Date(),
      });
      return { organizationId: org!.id, appUserId: user.id };
    };

    it('lets an activated account with one direct role be written through the account contracts', async () => {
      const error = await attempt(async (tx) => {
        const account = await newEmployee(tx, 'E101');
        await app.get(RoleGrantService).grantRole(tx, { ...account, role: 'IT_ADMIN' });
        expect(await app.get(RoleGrantService).effectiveRoles(account.appUserId, tx)).toEqual(['IT_ADMIN']);
      });

      expect(error).toBeInstanceOf(Rollback);
    });

    it('allows one FINANCE holder per organization', async () => {
      const error = await attempt(async (tx) => {
        const first = await newEmployee(tx, 'E102');
        const second = await newEmployee(tx, 'E103');
        await app.get(RoleGrantService).grantRole(tx, { ...first, role: 'FINANCE' });
        await app.get(RoleGrantService).grantRole(tx, { ...second, role: 'FINANCE' });
      });

      expect(error).not.toBeInstanceOf(Rollback);
      expect(error).toBeDefined();
    });

    it('refuses a second account for the same login email', async () => {
      const error = await attempt(async (tx) => {
        const organization = app.get(OrganizationService);
        const org = await organization.getOrganization(tx);
        const it = await organization.getEmployeeByCode('E002', tx);
        await app.get(AccountDirectoryService).createAppUser(tx, {
          organizationId: org!.id,
          employeeId: it!.id,
          loginEmail: 'Bao@Acme.vn',
          normalizedLoginEmail: 'bao@acme.vn',
          status: 'ACTIVE',
          activationState: 'ACTIVATED',
          emailVerificationSource: 'BOOTSTRAP_ASSERTED',
          emailVerifiedAt: new Date(),
        });
      });

      expect(error).not.toBeInstanceOf(Rollback);
      expect(error).toBeDefined();
    });
  });
});
