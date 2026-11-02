import { SMTPServer } from 'smtp-server';
import request from 'supertest';
import { IdentityAccessApi } from '../../src/modules/identity-access/public/identity-access.api';
import { EmailDeliveryApi } from '../../src/modules/notifications/public/email-delivery.api';
import { bodyOf } from '../support/api-body';
import { fakeSmtpEnvironment, listenOnLoopback } from '../support/fake-smtp';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  seedInstallation,
} from '../support/http-test-app';

/** Nodemailer sends the body as quoted-printable; undo it so the link can be read. */
function decodeQuotedPrintable(raw: string): string {
  const unfolded = raw.split('=\r\n').join('');

  return Buffer.from(
    unfolded.replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16))),
    'latin1',
  ).toString('utf8');
}

const PASSWORD = 'a long enough passphrase';
const EMAIL = 'first.it@acme.vn';

/**
 * E2E smoke: the installation, the first account the Super Admin invites (the mail sent by the worker's mail service), its sign-in,
 * a protected route, the refresh and the logout, after which the old refresh token is refused. Real HTTP, real PostgreSQL, an
 * in-process SMTP server.
 */
describe('a session from the installation to the logout (e2e)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let smtp: SMTPServer;
  const mails: { to: string[]; body: string }[] = [];
  const server = () => ctx.app.getHttpServer();
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = (email: string, password: string) =>
    request(server()).post('/api/v1/auth/login').send({ email, password });

  let adminToken = '';
  let appUserId = '';
  let firstRefresh = '';
  let session = { accessToken: '', refreshToken: '' };

  beforeAll(async () => {
    smtp = new SMTPServer({
      authOptional: true,
      disableReverseLookup: true,
      disabledCommands: ['STARTTLS'],
      onData(stream, smtpSession, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          mails.push({
            to: smtpSession.envelope.rcptTo.map((rcpt) => rcpt.address),
            body: decodeQuotedPrintable(Buffer.concat(chunks).toString()),
          });
          callback();
        });
      },
    });
    const port = await listenOnLoopback(smtp);
    ctx = await createHttpTestApp({ env: { ...fakeSmtpEnvironment(port), APP_PUBLIC_URL: 'https://app.acme.test' } });
    // What the installation command creates: the organization, a department and the activated Super Admin.
    seed = await seedInstallation(ctx.app);
  }, 120000);

  afterAll(async () => {
    // The SMTP server is closed even when the application or its database fail to close: an open server keeps Jest alive.
    try {
      await ctx?.close();
    } finally {
      await new Promise<void>((resolve) => (smtp ? smtp.close(() => resolve()) : resolve()));
    }
  });

  it('signs the Super Admin of the installation in, and the protected route knows who they are', async () => {
    const response = await login(seed.superAdmin.email, SEED_PASSWORD).expect(200);
    adminToken = bodyOf(response).data.accessToken;

    const me = await request(server()).get('/api/v1/me').set(bearer(adminToken)).expect(200);

    expect(bodyOf(me).data).toMatchObject({ appUserId: seed.superAdmin.appUserId, loginEmail: seed.superAdmin.email });
    expect((me.body as { data: { roles: { effective: string[] } } }).data.roles.effective).toContain('SUPER_ADMIN');
  });

  it('enters an employee and invites their first account; the mail service of the worker sends the link', async () => {
    const employee = await request(server())
      .post('/api/v1/employees')
      .set(bearer(adminToken))
      .send({
        employeeCode: 'E-IT-FIRST',
        fullName: 'First IT Admin',
        workEmail: EMAIL,
        employmentType: 'STAFF',
        hireDate: '2026-10-01',
        departmentCode: 'P-OPS',
        jobTitle: 'IT Administrator',
      })
      .expect(201);
    const employeeId = (employee.body as { data: { id: string } }).data.id;
    const created = await request(server())
      .post('/api/v1/app-users')
      .set(bearer(adminToken))
      .send({ employeeId, roles: ['IT_ADMIN'] })
      .expect(201);
    appUserId = (created.body as { data: { id: string } }).data.id;
    expect(mails).toEqual([]);

    // One tick of the worker's mail loop (worker/email-dispatch.job.ts), without its timer.
    const identity = ctx.app.get(IdentityAccessApi, { strict: false });
    await ctx.app.get(EmailDeliveryApi, { strict: false }).dispatchDue((hash) => identity.isActionLinkUsable(hash));

    expect(mails.map((mail) => mail.to)).toEqual([[EMAIL]]);
    const outbox = await ctx.sql.query<{ status: string }>(`SELECT status FROM email_outbox WHERE recipient = $1`, [
      EMAIL,
    ]);
    expect(outbox.rows).toEqual([{ status: 'SENT' }]);
  });

  it('activates the account from the link in the mail, and the new IT Admin signs in', async () => {
    const token = /\/activate#token=([A-Za-z0-9_-]{43})/.exec(mails[0].body)?.[1];
    expect(token).toBeDefined();

    await request(server()).post('/api/v1/auth/invitations/redeem').send({ token, password: PASSWORD }).expect(200);
    const signedIn = bodyOf(await login(EMAIL, PASSWORD).expect(200)).data;
    session = { accessToken: signedIn.accessToken, refreshToken: signedIn.refreshToken };
    firstRefresh = signedIn.refreshToken;

    const me = await request(server()).get('/api/v1/me').set(bearer(session.accessToken)).expect(200);
    expect(bodyOf(me).data).toMatchObject({ appUserId, loginEmail: EMAIL });
    // A route only an IT Admin may call answers for the session, and not without it.
    await request(server()).get('/api/v1/provisioning-tasks').set(bearer(session.accessToken)).expect(200);
    await request(server()).get('/api/v1/provisioning-tasks').expect(401);
  });

  it('refreshes the session: new tokens, and the new access token is accepted', async () => {
    const refreshed = bodyOf(
      await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200),
    ).data;

    // The refresh token is single-use and rotates; the access token is of the same session (it may read the same within a second).
    expect(refreshed.refreshToken).not.toBe(session.refreshToken);
    expect(new Date(refreshed.refreshExpiresAt).getTime()).toBeGreaterThan(Date.now());
    session = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
    await request(server()).get('/api/v1/me').set(bearer(session.accessToken)).expect(200);
  });

  it('logs out: the session ends, and neither refresh token nor the access token is accepted any more', async () => {
    await request(server()).post('/api/v1/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);

    const refused = await request(server())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    expect(bodyOf(refused).error.code).toBe('AUTH.SESSION_INVALID');
    await request(server()).post('/api/v1/auth/refresh').send({ refreshToken: firstRefresh }).expect(401);
    await request(server()).get('/api/v1/me').set(bearer(session.accessToken)).expect(401);
    const ended = await ctx.sql.query<{ revoked_reason: string }>(
      `SELECT revoked_reason FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NOT NULL`,
      [appUserId],
    );
    expect(ended.rows).toEqual([{ revoked_reason: 'LOGOUT' }]);
  });
});
