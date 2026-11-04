import { INestApplicationContext } from '@nestjs/common';
import { SMTPServer } from 'smtp-server';
import { fakeSmtpEnvironment, listenOnLoopback } from '../../support/fake-smtp';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

describe('worker mail loop (integration, PostgreSQL + in-process SMTP)', () => {
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
          received.push(...session.envelope.rcptTo.map((r) => r.address));
          callback();
        });
      },
    });
    // The suite owns the whole SMTP configuration (H7-VRF-01); `originalEnv` is restored in afterAll.
    Object.assign(process.env, fakeSmtpEnvironment(await listenOnLoopback(smtp)));
    process.env.OUTBOX_POLL_INTERVAL_MS = '500';

    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
  }, 90000);

  afterAll(async () => {
    await worker?.close();
    await ctx?.close();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    process.env = originalEnv;
  });

  it('delivers the invitation queued by an account creation, without any HTTP request involved', async () => {
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, { code: 'E-W1', email: 'worker.target@acme.vn' });
    const created = await request(ctx.app.getHttpServer())
      .post('/api/v1/app-users')
      .set({ Authorization: `Bearer ${bodyOf(login).data.accessToken}` })
      .send({ employeeId, role: 'EMPLOYEE' })
      .expect(201);
    expect(received).toHaveLength(0);

    // Imported only now: the configuration module validates the environment when it is first loaded.
    const { NestFactory } = await import('@nestjs/core');
    const { WorkerModule } = await import('../../../src/worker/worker.module');
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });

    const accountId = (created.body as { data: { id: string } }).data.id;
    const deadline = Date.now() + 15000;
    let mailStatus: string | undefined;
    while (Date.now() < deadline) {
      const mail = await ctx.sql.query<{ status: string }>(
        `SELECT o.status FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1`,
        [accountId],
      );
      mailStatus = mail.rows[0]?.status;
      if (received.length > 0 && mailStatus === 'SENT') break;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }

    expect(received).toEqual(['worker.target@acme.vn']);
    expect(mailStatus).toBe('SENT');
  }, 60000);
});
