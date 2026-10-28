import { INestApplicationContext } from '@nestjs/common';
import { SMTPServer } from 'smtp-server';
import { fakeSmtpEnvironment, listenOnLoopback } from '../support/fake-smtp';
import request from 'supertest';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import {
  provisionDatabaseRoles,
  reconcileDatabaseRoles,
} from '../../src/infrastructure/database/roles/database-role-provisioning';
import { readProvisionSettings } from '../../src/infrastructure/database/roles/database-role-settings';
import { RuntimeDatabaseRoleGuard } from '../../src/infrastructure/database/runtime-role.guard';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { bodyOf } from '../support/api-body';
import { BudgetHarness, type VersionWire } from '../support/budget-harness';
import { LeaveHarness } from '../support/leave-harness';
import { migrateDisposableDatabase } from '../support/disposable-database';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';
import {
  RoleSeparatedDatabase,
  allowDeployToReadMarker,
  createRoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  tableFingerprints,
  withClient,
} from '../support/role-separated-database';
import { testConfig } from '../support/test-config';

/** A database with the three roles of H7 provisioned, migrated by the deploy role and reconciled for the runtime role. */
async function prepareRoleDatabase(): Promise<RoleSeparatedDatabase> {
  const database = await createRoleSeparatedDatabase();
  await withClient(database.bootstrapUrl, (client) =>
    provisionDatabaseRoles(client, readProvisionSettings(database.provisionEnvironment)),
  );
  await allowDeployToReadMarker(database);
  await migrateDisposableDatabase(database.deployHandle);
  await withClient(database.deploy.url, (client) => reconcileDatabaseRoles(client, database.runtime.role));

  return database;
}

/** The role the application session really ran as: the runtime role, whatever the test harness uses to look at the rows. */
async function sessionRoleOf(app: INestApplicationContext): Promise<string> {
  const rows = await app
    .get(TransactionRunner, { strict: false })
    .run((tx) => tx.$queryRaw<{ who: string }[]>`SELECT current_user AS who`);

  return rows[0].who;
}

/**
 * H7: the API and the worker do their work as the runtime role — the whole Nest application and the worker graph, not a
 * stub — and the start-up check accepts that login and refuses the deploy role, the cluster superuser and a runtime role
 * that became a member of another. PostgreSQL 17 (TEST_DATABASE_BOOTSTRAP_URL).
 */
describe('the API and the worker run as the runtime role (integration, PostgreSQL)', () => {
  let database: RoleSeparatedDatabase;
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let worker: INestApplicationContext | undefined;
  let smtp: SMTPServer;
  const received: string[] = [];
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    smtp = new SMTPServer({
      authOptional: true,
      disableReverseLookup: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, session, callback) {
        stream.resume();
        stream.on('end', () => {
          received.push(...session.envelope.rcptTo.map((recipient) => recipient.address));
          callback();
        });
      },
    });
    // The suite owns the whole SMTP configuration (H7-VRF-01); `originalEnv` is restored in afterAll.
    Object.assign(process.env, fakeSmtpEnvironment(await listenOnLoopback(smtp)));
    process.env.OUTBOX_POLL_INTERVAL_MS = '500';

    database = await prepareRoleDatabase();
    ctx = await createHttpTestApp({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
    seed = await seedInstallation(ctx.app);
  }, 120000);

  afterAll(async () => {
    await worker?.close();
    await ctx?.close();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    if (database) await dropRoleSeparatedDatabase(database);
    process.env = originalEnv;
  });

  it('serves the API as the runtime role: sign-in, refresh, an audited write, the Audit Trail and a locked transaction', async () => {
    const server = ctx.app.getHttpServer();
    const sessionRole = await ctx.app.get(TransactionRunner).run(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4243)`;
      await tx.$queryRaw`SELECT id FROM app_users FOR UPDATE`;
      return tx.$queryRaw<{ who: string }[]>`SELECT current_user AS who`;
    });
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: bodyOf(login).data.refreshToken })
      .expect(200);
    const authorization = { Authorization: `Bearer ${bodyOf(refreshed).data.accessToken}` };
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, { code: 'E-H7', email: 'h7.runtime@acme.vn' });
    await request(server).post('/api/v1/app-users').set(authorization).send({ employeeId, roles: [] }).expect(201);
    const trail = await request(server).get('/api/v1/audit-events').set(authorization).expect(200);

    expect(sessionRole).toEqual([{ who: database.runtime.role }]);
    expect((trail.body as { data: { items: unknown[] } }).data.items.length).toBeGreaterThan(0);
  });

  it('delivers mail from the worker as the runtime role', async () => {
    const { NestFactory } = await import('@nestjs/core');
    const { WorkerModule } = await import('../../src/worker.module');
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !received.includes('h7.runtime@acme.vn')) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const statuses = await withClient(
      database.bootstrapUrl,
      async (client) =>
        (await client.query<{ status: string }>('SELECT status FROM email_outbox ORDER BY created_at')).rows,
    );

    expect(received).toContain('h7.runtime@acme.vn');
    expect(statuses).toContainEqual({ status: 'SENT' });
  });

  it('left the migration history as the deploy role wrote it', async () => {
    const fingerprints = await tableFingerprints(database);
    const migrations = await withClient(
      database.bootstrapUrl,
      async (client) =>
        (await client.query<{ count: number }>('SELECT count(*)::int AS count FROM _prisma_migrations')).rows[0].count,
    );

    expect(fingerprints._prisma_migrations.startsWith(`${migrations}:`)).toBe(true);
  });

  describe('start-up check in production (RuntimeDatabaseRoleGuard)', () => {
    const check = async (url: string): Promise<string | null> => {
      const prisma = new PrismaService(testConfig({ DATABASE_URL: url }));
      try {
        await new RuntimeDatabaseRoleGuard(prisma, testConfig({ NODE_ENV: 'production' })).onModuleInit();
        return null;
      } catch (error) {
        return (error as Error).message;
      } finally {
        await prisma.$disconnect();
      }
    };

    it('accepts the runtime role', async () => {
      expect(await check(database.runtime.url)).toBeNull();
    });

    it('refuses the deploy role, which owns the database and its objects', async () => {
      expect(await check(database.deploy.url)).toContain(
        `"${database.deploy.role}" must not be used by the API or the worker: OWNS_DATABASE, OWNS_OBJECTS`,
      );
    });

    it('refuses the cluster superuser that the old production wiring gave the API and the worker', async () => {
      expect(await check(database.bootstrapUrl)).toMatch(
        new RegExp(
          `"${database.bootstrapRole}" must not be used by the API or the worker: SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, .*OWNS_OBJECTS`,
        ),
      );
    });

    it('refuses the runtime role once it is a member of another role', async () => {
      await withClient(database.bootstrapUrl, (client) =>
        client.query(`GRANT "${database.deploy.role}" TO "${database.runtime.role}"`),
      );
      try {
        expect(await check(database.runtime.url)).toContain('MEMBERSHIP');
      } finally {
        await withClient(database.bootstrapUrl, (client) =>
          client.query(`REVOKE "${database.deploy.role}" FROM "${database.runtime.role}"`),
        );
      }
    });
  });
});

/**
 * `g0-g6-final-business-baseline-remediation`, F52 (spec Task 6.3): the write paths of the two last groups run as the runtime
 * role too — it needs nothing beyond the data rights the default privileges give it (no CREATE, no ownership), so a table added
 * by a migration of G5 or G6 that the role cannot write would fail here and not at the first request of production.
 */
describe('a write path of G5 runs as the runtime role: a budget proposal sent, built, sent on and approved (integration, PostgreSQL)', () => {
  const h = new BudgetHarness();
  let database: RoleSeparatedDatabase;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
  }, 240000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('writes the proposal, the version, the decision and the notices without any right beyond data', async () => {
    const executive = await h.departmentWithUnit('P-RR-EXE');
    const boss = await h.staff(executive, 'RR-BOSS');
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
    const unit = await h.departmentWithHead('P-RR-D1');
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
    const version = await h.built(proposal.id);
    await h.sendVersion(version.id).expect(200);

    const decided = await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(200);

    expect(h.dataOf<{ version: VersionWire }>(decided).version).toMatchObject({ state: 'APPROVED' });
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    const written = await h.ctx.sql.query<{ proposals: number; decisions: number; history: number }>(
      `SELECT (SELECT count(*)::int FROM budget_proposals WHERE id = $1) AS proposals,
              (SELECT count(*)::int FROM budget_version_decisions WHERE version_id = $2) AS decisions,
              (SELECT count(*)::int FROM budget_version_history WHERE version_id = $2) AS history`,
      [proposal.id, version.id],
    );
    expect(written.rows[0]).toMatchObject({ proposals: 1, decisions: 1 });
    expect(written.rows[0].history).toBeGreaterThanOrEqual(1);
  });
});

describe('a write path of G6 runs as the runtime role: a long leave recorded by the Super Admin (integration, PostgreSQL)', () => {
  const h = new LeaveHarness();
  let database: RoleSeparatedDatabase;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
  }, 240000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('writes the leave, its log, the work state and the Audit Trail without any right beyond data', async () => {
    const department = await h.departmentWithUnit('P-RR-HR');
    const person = await h.worker(department, 'RR-W1');

    const leave = await h.started({
      employeeId: person.employeeId,
      startedOn: h.day(-30),
      approvedReturnOn: h.day(60),
      grounds: h.approval,
    });

    expect(leave).toMatchObject({ status: 'ACTIVE', employee: { id: person.employeeId } });
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
    expect(await h.changeRows(leave.id)).toEqual([{ kind: 'STARTED' }]);
    expect(await h.auditEventsOf('LONG_LEAVE.STARTED', leave.id)).toHaveLength(1);
  });
});
