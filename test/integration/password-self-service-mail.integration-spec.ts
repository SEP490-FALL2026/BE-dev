import { INestApplicationContext } from '@nestjs/common';
import { SMTPServer } from 'smtp-server';
import { fakeSmtpEnvironment, listenOnLoopback } from '../support/fake-smtp';
import request from 'supertest';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../support/http-test-app';

interface Received {
  to: string[];
  body: string;
}

/** Nodemailer sends non-ASCII text as quoted-printable; undo it so the tests can read the body. */
function decodeQuotedPrintable(raw: string): string {
  const softBreak = String.fromCharCode(61, 13, 10);
  const unfolded = raw.split(softBreak).join('');
  const bytes = Buffer.from(
    unfolded.replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    'latin1',
  );

  return bytes.toString('utf8');
}

const NEW_PASSWORD = 'a brand new passphrase 42';

describe('password self-service mail through the real worker and an in-process SMTP server (integration)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let worker: INestApplicationContext | undefined;
  let smtp: SMTPServer;
  let smtpDown = false;
  const received: Received[] = [];
  const originalEnv = { ...process.env };
  let counter = 0;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      onRcptTo(_address, _session, callback) {
        if (smtpDown) return callback(Object.assign(new Error('try later'), { responseCode: 451 }));
        callback();
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          received.push({
            to: session.envelope.rcptTo.map((r) => r.address),
            body: decodeQuotedPrintable(Buffer.concat(chunks).toString()),
          });
          callback();
        });
      },
    });
    // The suite owns the whole SMTP configuration (H7-VRF-01); `originalEnv` is restored in afterAll.
    Object.assign(process.env, fakeSmtpEnvironment(await listenOnLoopback(smtp)));
    process.env.OUTBOX_POLL_INTERVAL_MS = '500';
    process.env.APP_PUBLIC_URL = 'https://app.acme.test';

    ctx = await createHttpTestApp({ env: { TRUST_PROXY_HOPS: '1' } });
    seed = await seedInstallation(ctx.app);
  }, 90000);

  afterAll(async () => {
    await worker?.close();
    await ctx?.close();
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    process.env = originalEnv;
  });

  /** Starts the worker (once). Imported only now: the configuration module validates the environment when first loaded. */
  const startWorker = async () => {
    if (worker) return;
    const { NestFactory } = await import('@nestjs/core');
    const { WorkerModule } = await import('../../src/worker.module');
    worker = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  };

  /** Polls until the condition holds; never a fixed sleep. */
  const until = async <T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20000): Promise<T> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await read();
      if (done(value)) return value;
      if (Date.now() > deadline)
        throw new Error(`Condition not met within ${timeoutMs} ms; last value: ${JSON.stringify(value)}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }
  };

  const newAccount = async (email?: string) => {
    counter += 1;
    const login = email ?? `mail.ps.${counter}@acme.vn`;
    const account = await insertAccountFixture(ctx.app, seed, {
      code: `E-ML${counter}`,
      email: login,
      activated: true,
    });

    return { ...account, email: login };
  };

  const forgot = (email: string) =>
    request(server())
      .post('/api/v1/auth/password-reset-requests')
      .set('X-Forwarded-For', `10.8.${counter}.1`)
      .send({ email })
      .expect(202);

  const mailsTo = (recipient: string) => received.filter((mail) => mail.to.includes(recipient));

  const outboxOf = async (recipient: string, template: string) =>
    (
      await ctx.sql.query<{ status: string; attempts: number; last_error_code: string | null }>(
        'SELECT status, attempts, last_error_code FROM email_outbox WHERE recipient = $1 AND template = $2 ORDER BY created_at',
        [recipient, template],
      )
    ).rows;

  // The first tests run before any worker exists, so mail stays exactly where the code left it.
  it('does not send a reset link to an employee who left after it was queued (T-10)', async () => {
    const account = await newAccount();
    await forgot(account.email);
    expect(await outboxOf(account.email, 'PASSWORD_RESET')).toMatchObject([{ status: 'PENDING' }]);
    // Fixture only: the offboarding flow that terminates an employee belongs to G6.
    await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [account.employeeId]);

    await startWorker();

    await until(
      () => outboxOf(account.email, 'PASSWORD_RESET'),
      (rows) => rows[0]?.status === 'CANCELLED',
    );
    expect(mailsTo(account.email)).toEqual([]);
  }, 60000);

  it('never queues a link for a locked account, so the worker has nothing to send (T-10)', async () => {
    const account = await newAccount();
    const admin = bodyOf(
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
        .expect(200),
    ).data.accessToken;
    await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [account.appUserId]);

    await forgot(account.email);
    await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${admin}`).expect(200);

    expect(await outboxOf(account.email, 'PASSWORD_RESET')).toEqual([]);
    expect(mailsTo(account.email)).toEqual([]);
  }, 60000);

  it('sends the reset link, then, after the reset, a notice with no link to the stored email (AC-12)', async () => {
    await startWorker();
    const account = await newAccount('Mail.Case@acme.vn');
    await forgot('mail.case@acme.vn');
    await until(
      () => outboxOf(account.email, 'PASSWORD_RESET'),
      (rows) => rows[0]?.status === 'SENT',
    );

    const [linkMail] = mailsTo(account.email);
    const token = /reset-password#token=([A-Za-z0-9_-]{43})/.exec(linkMail.body)?.[1];
    expect(token).toBeDefined();
    expect(linkMail.body).not.toContain('/activate');
    await request(server())
      .post('/api/v1/auth/password-resets')
      .set('X-Forwarded-For', '10.8.250.1')
      .send({ token, newPassword: NEW_PASSWORD })
      .expect(200);

    await until(
      () => outboxOf(account.email, 'PASSWORD_CHANGED_NOTICE'),
      (rows) => rows[0]?.status === 'SENT',
    );
    const notice = mailsTo(account.email).find((mail) => mail !== linkMail);
    expect(notice?.to).toEqual([account.email]);
    expect(notice?.body).not.toContain('#token=');
    expect(notice?.body).not.toMatch(/https?:\/\//);
    expect(notice?.body).not.toContain(token as string);
    expect(notice?.body).toContain('Mật khẩu của bạn đã được đặt lại');
  }, 90000);

  it('keeps the change in force when the mail server is down, and delivers the notice once it is back (AC-12)', async () => {
    await startWorker();
    const account = await newAccount();
    const session = bodyOf(
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: account.email, password: SEED_PASSWORD })
        .expect(200),
    ).data.accessToken;
    smtpDown = true;

    await request(server())
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${session}`)
      .send({ currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);

    // The change stands whatever the mail does.
    await request(server())
      .post('/api/v1/auth/login')
      .send({ email: account.email, password: NEW_PASSWORD })
      .expect(200);
    const failing = await until(
      () => outboxOf(account.email, 'PASSWORD_CHANGED_NOTICE'),
      (rows) => rows[0]?.status === 'PENDING' && rows[0].attempts >= 1 && rows[0].last_error_code !== null,
    );
    expect(failing).toHaveLength(1);
    expect(mailsTo(account.email)).toEqual([]);

    smtpDown = false;
    await ctx.sql.query(
      `UPDATE email_outbox SET next_attempt_at = now() - interval '1 second'
        WHERE recipient = $1 AND template = 'PASSWORD_CHANGED_NOTICE'`,
      [account.email],
    );
    await until(
      () => outboxOf(account.email, 'PASSWORD_CHANGED_NOTICE'),
      (rows) => rows[0]?.status === 'SENT',
    );
    expect(mailsTo(account.email)).toHaveLength(1);
  }, 90000);
});
