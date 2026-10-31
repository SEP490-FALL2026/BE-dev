import { INestApplicationContext } from '@nestjs/common';
import { SMTPServer } from 'smtp-server';
import { fakeSmtpEnvironment, listenOnLoopback } from '../../support/fake-smtp';
import request from 'supertest';
import { PrismaService } from '../../../src/infrastructure/database/prisma.service';
import { RuntimeDatabaseRoleGuard } from '../../../src/infrastructure/database/runtime-role.guard';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';
import { prepareRoleDatabase } from '../../support/role-database-prepare';
import {
  RoleSeparatedDatabase,
  dropRoleSeparatedDatabase,
  tableFingerprints,
  withClient,
} from '../../support/role-separated-database';
import { testConfig } from '../../support/test-config';

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
    const { WorkerModule } = await import('../../../src/worker/worker.module');
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
