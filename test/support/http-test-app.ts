import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { App } from 'supertest/types';
import { configureApplication } from '../../src/bootstrap';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { IdentityAccessService } from '../../src/modules/identity-access/identity-access.service';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from './disposable-database';

export interface HttpTestApp {
  app: INestApplication<App>;
  database: DisposableDatabase;
  /** A direct connection for assertions and for fixtures the application does not (yet) expose. */
  sql: Client;
  close(): Promise<void>;
}

/**
 * Boots the whole Nest application — real pipes, guards, filters, cookie parser — against a
 * migrated, disposable PostgreSQL database. Use it for the cases a stubbed repository cannot
 * prove: constraints, locking, and cookies.
 */
export async function createHttpTestApp(options: { extraControllers?: Type<unknown>[] } = {}): Promise<HttpTestApp> {
  const database = await provisionDisposableDatabase();
  await migrateDisposableDatabase(database);

  const previous = { ...process.env };
  process.env.TEST_DATABASE_URL = database.url;
  // Many sign-ins from one address in a test run must not trip the generic IP rate limit.
  process.env.RATE_LIMIT_LIMIT = '10000';

  // ConfigModule.forRoot validates process.env when AppModule is first imported, so the import
  // must happen after the variables above are set — a static import would read the real ones.
  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: options.extraControllers ?? [],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApplication(app, { mountDocs: false });
  await app.init();

  const sql = new Client({ connectionString: database.url });
  await sql.connect();

  return {
    app,
    database,
    sql,
    async close() {
      await sql.end();
      await app.close();
      await dropDisposableDatabase(database);
      process.env = previous;
    },
  };
}

export interface SeededInstallation {
  organizationId: string;
  departmentId: string;
  jobTitleId: string;
  superAdmin: { appUserId: string; employeeId: string; email: string; password: string };
}

export const SEED_PASSWORD = 'correct horse battery staple';

/** Creates the minimum installation (what the bootstrap command creates) through the real services. */
export async function seedInstallation(app: INestApplication): Promise<SeededInstallation> {
  const runner = app.get(TransactionRunner);
  const organization = app.get(OrganizationService);
  const identity = app.get(IdentityAccessService);
  const email = 'admin@acme.vn';
  const credential = await identity.prepareCredential(SEED_PASSWORD, email);

  return runner.run(async (tx) => {
    const org = await organization.createOrganization(tx, {
      name: 'Acme',
      timeZone: 'Asia/Ho_Chi_Minh',
      reportingCurrency: 'VND',
    });
    const costCenter = await organization.createUnitCostCenter(tx, {
      organizationId: org.id,
      code: 'CC-1',
      name: 'Ops',
    });
    const department = await organization.createDepartment(tx, {
      organizationId: org.id,
      code: 'P-OPS',
      name: 'Operations',
      costCenterId: costCenter.id,
    });
    const jobTitle = await organization.createJobTitle(tx, org.id, 'Administrator');
    const employee = await organization.createEmployeeWithPlacement(tx, {
      organizationId: org.id,
      employeeCode: 'E-ADMIN',
      fullName: 'Admin Person',
      workEmail: email,
      employmentType: 'STAFF',
      hireDate: '2026-01-05',
      departmentId: department.id,
      jobTitleId: jobTitle.id,
    });
    const account = await identity.createBootstrapSuperAdmin(tx, {
      organizationId: org.id,
      employeeId: employee.id,
      loginEmail: email,
      passwordHash: credential.hash,
      hashPolicyVersion: credential.hashPolicyVersion,
    });

    return {
      organizationId: org.id,
      departmentId: department.id,
      jobTitleId: jobTitle.id,
      superAdmin: { appUserId: account.appUserId, employeeId: employee.id, email, password: SEED_PASSWORD },
    };
  });
}

/**
 * An extra employee with an account, created by SQL because account creation belongs to a later
 * slice. `activated` false leaves the account invited (no credential).
 */
export async function insertAccountFixture(
  app: INestApplication,
  seed: SeededInstallation,
  options: { code: string; email: string; activated: boolean; password?: string },
): Promise<{ appUserId: string; employeeId: string }> {
  const runner = app.get(TransactionRunner);
  const organization = app.get(OrganizationService);
  const identity = app.get(IdentityAccessService);
  const credential = options.activated
    ? await identity.prepareCredential(options.password ?? SEED_PASSWORD, options.email)
    : null;

  return runner.run(async (tx) => {
    const employee = await organization.createEmployeeWithPlacement(tx, {
      organizationId: seed.organizationId,
      employeeCode: options.code,
      fullName: `Person ${options.code}`,
      workEmail: options.email,
      employmentType: 'STAFF',
      hireDate: '2026-01-05',
      departmentId: seed.departmentId,
      jobTitleId: seed.jobTitleId,
    });
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status,
                             activation_state, email_verification_source, email_verified_at, updated_at)
      VALUES (gen_random_uuid(), ${seed.organizationId}::uuid, ${employee.id}::uuid, ${options.email},
              ${options.email.toLowerCase()}, 'ACTIVE',
              ${options.activated ? 'ACTIVATED' : 'INVITED'}::"ActivationState",
              ${options.activated ? 'INVITATION_REDEEMED' : null}::"EmailVerificationSource",
              ${options.activated ? new Date().toISOString() : null}::timestamptz, now())
      RETURNING id`;
    if (credential) {
      await tx.$executeRaw`
        INSERT INTO password_credentials (app_user_id, hash, hash_policy_version)
        VALUES (${rows[0].id}::uuid, ${credential.hash}, ${credential.hashPolicyVersion})`;
    }

    return { appUserId: rows[0].id, employeeId: employee.id };
  });
}

/**
 * An employee without an account. `terminated` marks them as having left (the state a later slice
 * will reach through the offboarding flow, which does not exist yet).
 */
export async function insertEmployeeFixture(
  app: INestApplication,
  seed: SeededInstallation,
  options: { code: string; email: string | null; terminated?: boolean },
): Promise<{ employeeId: string }> {
  const runner = app.get(TransactionRunner);
  const organization = app.get(OrganizationService);

  return runner.run(async (tx) => {
    const employee = await organization.createEmployeeWithPlacement(tx, {
      organizationId: seed.organizationId,
      employeeCode: options.code,
      fullName: `Person ${options.code}`,
      workEmail: options.email,
      employmentType: 'STAFF',
      hireDate: '2026-01-05',
      departmentId: seed.departmentId,
      jobTitleId: seed.jobTitleId,
    });
    if (options.terminated) {
      await tx.$executeRaw`UPDATE employees SET status = 'TERMINATED' WHERE id = ${employee.id}::uuid`;
    }

    return { employeeId: employee.id };
  });
}
