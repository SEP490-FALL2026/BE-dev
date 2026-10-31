import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { App } from 'supertest/types';
import { configureApplication } from '../../src/app/configure-application';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../src/modules/identity-access/public/identity-access.api';
import { OrganizationApi } from '../../src/modules/organization/public/organization.api';
import { PasswordHasher } from '../../src/modules/identity-access/credentials/password-hasher.service';
import {
  DisposableDatabase,
  dropDisposableDatabase,
  migrateDisposableDatabase,
  provisionDisposableDatabase,
} from './disposable-database';
import { defaultPasswordHasher, FastPasswordHasher } from './fast-password-hasher';

export interface HttpTestApp {
  app: INestApplication<App>;
  database: DisposableDatabase;
  /** A direct connection for assertions and for fixtures the application does not (yet) expose. */
  sql: Client;
  close(): Promise<void>;
}

/**
 * Boots the whole Nest application — real pipes, guards, filters — against a migrated,
 * disposable PostgreSQL database. Use it for the cases a stubbed repository cannot prove:
 * constraints and locking.
 */
export async function createHttpTestApp(
  options: {
    extraControllers?: Type<unknown>[];
    /** The URL the application connects through (for example a PgRelay); assertions still use the direct URL. */
    appDatabaseUrl?: (directUrl: string) => Promise<string> | string;
    /** Extra environment for this application, such as shorter database timeouts. */
    env?: Record<string, string>;
    /** Providers to replace with a stand-in, such as the gate of a module that does not exist yet. */
    providerOverrides?: { token: unknown; useValue: unknown }[];
    /**
     * An already migrated database the caller owns (the PostgreSQL role suites, H7): it is neither provisioned, migrated
     * nor dropped here. `sql` connects through its URL; the application through `appDatabaseUrl` when given.
     */
    database?: DisposableDatabase;
    /**
     * OD-T3: 'fast' (default outside test/integration/identity-access/) hashes with the cheapest Argon2id parameters;
     * 'production' keeps the real ones.
     */
    passwordHasher?: 'fast' | 'production';
  } = {},
): Promise<HttpTestApp> {
  const owned = options.database === undefined;
  const database = options.database ?? (await provisionDisposableDatabase());
  const previous = { ...process.env };
  let app: INestApplication<App> | undefined;
  let sql: Client | undefined;
  try {
    if (owned) await migrateDisposableDatabase(database);

    process.env.TEST_DATABASE_URL = options.appDatabaseUrl ? await options.appDatabaseUrl(database.url) : database.url;
    // Many sign-ins from one address in a test run must not trip the generic IP rate limit.
    process.env.RATE_LIMIT_LIMIT = '10000';
    Object.assign(process.env, options.env ?? {});

    // ConfigModule.forRoot validates process.env when AppModule is first imported, so the import
    // must happen after the variables above are set — a static import would read the real ones.
    const { AppModule } = await import('../../src/app/app.module');
    let builder = Test.createTestingModule({
      imports: [AppModule],
      controllers: options.extraControllers ?? [],
    });
    const hasher = options.passwordHasher ?? defaultPasswordHasher();
    if (hasher === 'fast') builder = builder.overrideProvider(PasswordHasher).useValue(new FastPasswordHasher());
    for (const override of options.providerOverrides ?? []) {
      builder = builder.overrideProvider(override.token).useValue(override.useValue);
    }
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApplication(app, { mountDocs: false });
    // Own one listener for the fixture lifetime. Otherwise SuperTest owns the first request's
    // auto-listened server and may close it while parallel sibling requests are still connecting.
    await app.listen(0, '127.0.0.1');

    sql = new Client({ connectionString: database.url });
    await sql.connect();
  } catch (error) {
    // A setup that stops half-way leaves nothing behind (operational-commands rule 8): the database it provisioned is
    // dropped and the environment restored; a failure while cleaning never hides the first one.
    await sql?.end().catch(() => undefined);
    await app?.close().catch(() => undefined);
    if (owned) await dropDisposableDatabase(database).catch(() => undefined);
    process.env = previous;
    throw error;
  }
  const ready = { app, sql };

  return {
    app: ready.app,
    database,
    sql: ready.sql,
    async close() {
      await ready.sql.end();
      await ready.app.close();
      if (owned) await dropDisposableDatabase(database);
      process.env = previous;
    },
  };
}

export interface SeededInstallation {
  organizationId: string;
  departmentId: string;
  superAdmin: { appUserId: string; employeeId: string; email: string; password: string };
}

export const SEED_PASSWORD = 'correct horse battery staple';

/** Creates the minimum installation (what the bootstrap command creates) through the real services. */
export async function seedInstallation(app: INestApplication): Promise<SeededInstallation> {
  const runner = app.get(TransactionRunner);
  const organization = app.get(OrganizationApi);
  const identity = app.get(IdentityAccessApi);
  const email = 'admin@acme.vn';
  const credential = await identity.prepareCredential(SEED_PASSWORD, email);

  return runner.run(async (tx) => {
    const org = await organization.createOrganization(tx, {
      name: 'Acme',
      timeZone: 'Asia/Ho_Chi_Minh',
      reportingCurrency: 'VND',
    });
    // The department first, then the Cost Center created for it (`QĐ-87d(1)`), as the installation command does.
    const department = await organization.createDepartment(tx, {
      organizationId: org.id,
      code: 'P-OPS',
      name: 'Operations',
    });
    await organization.createUnitCostCenter(tx, {
      organizationId: org.id,
      code: 'CC-1',
      name: 'Ops',
      departmentId: department.id,
    });
    const employee = await organization.createEmployeeWithPlacement(tx, {
      organizationId: org.id,
      employeeCode: 'E-ADMIN',
      fullName: 'Admin Person',
      workEmail: email,
      employmentType: 'STAFF',
      hireDate: '2026-01-05',
      departmentId: department.id,
      jobTitle: 'Administrator',
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
  const organization = app.get(OrganizationApi);
  const identity = app.get(IdentityAccessApi);
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
      jobTitle: 'Administrator',
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
  const organization = app.get(OrganizationApi);

  return runner.run(async (tx) => {
    const employee = await organization.createEmployeeWithPlacement(tx, {
      organizationId: seed.organizationId,
      employeeCode: options.code,
      fullName: `Person ${options.code}`,
      workEmail: options.email,
      employmentType: 'STAFF',
      hireDate: '2026-01-05',
      departmentId: seed.departmentId,
      jobTitle: 'Administrator',
    });
    if (options.terminated) {
      await tx.$executeRaw`UPDATE employees SET status = 'TERMINATED' WHERE id = ${employee.id}::uuid`;
    }

    return { employeeId: employee.id };
  });
}
