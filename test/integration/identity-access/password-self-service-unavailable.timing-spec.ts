import { createHash } from 'node:crypto';
import request from 'supertest';
import { PayloadCipher } from '../../../src/modules/notifications/payload-cipher.service';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../../support/http-test-app';
import { PgRelay } from '../../support/pg-relay';

const QUERY_TIMEOUT_MS = 2000;
const SLACK_MS = 1500;
const NEW_PASSWORD = 'a brand new passphrase 42';
const WRITES_THE_CREDENTIAL = /UPDATE\s+.*"password_credentials"/;

/**
 * The database stops answering in the middle of the transaction that replaces a password: the caller gets a
 * retryable 503, and nothing is half-written (password, link, sessions, mail, audit all stay as they were).
 */
describe('password reset and change when the database stops answering mid-transaction (integration)', () => {
  let ctx: HttpTestApp;
  let relay: PgRelay;
  let seed: SeededInstallation;
  let cipher: PayloadCipher;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createHttpTestApp({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        return url.toString();
      },
      env: {
        DB_QUERY_TIMEOUT_MS: String(QUERY_TIMEOUT_MS),
        DB_STATEMENT_TIMEOUT_MS: '1500',
        DB_LOCK_TIMEOUT_MS: '500',
        DB_CONNECT_TIMEOUT_MS: '1000',
        TRUST_PROXY_HOPS: '1',
      },
    });
    seed = await seedInstallation(ctx.app);
    cipher = ctx.app.get(PayloadCipher, { strict: false });
  }, 90000);

  afterAll(async () => {
    relay?.releaseHeld();
    await ctx?.close();
    await relay?.stop();
  });

  afterEach(() => relay.releaseHeld());

  const newAccount = async () => {
    counter += 1;
    const email = `stall.ps.${counter}@acme.vn`;
    const account = await insertAccountFixture(ctx.app, seed, { code: `E-ST${counter}`, email, activated: true });

    return { ...account, email };
  };

  /** Rows that a half-written change would leave behind, for one account. */
  const footprint = async (appUserId: string) =>
    (
      await ctx.sql.query(
        `SELECT (SELECT hash FROM password_credentials WHERE app_user_id = $1) AS hash,
                (SELECT count(*)::int FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL) AS open_sessions,
                (SELECT count(*)::int FROM account_action_tokens WHERE app_user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL) AS usable_tokens,
                (SELECT count(*)::int FROM audit_events WHERE resource_id = $1::text) AS audit_events,
                (SELECT count(*)::int FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' AND recipient = (SELECT login_email FROM app_users WHERE id = $1)) AS notices`,
        [appUserId],
      )
    ).rows[0] as Record<string, unknown>;

  const noBackendLeftIdleInTransaction = async (): Promise<void> => {
    const deadline = Date.now() + 5000;
    for (;;) {
      const { rows } = await ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND state LIKE 'idle in transaction%'`,
      );
      if (rows[0].n === 0) return;
      if (Date.now() > deadline) throw new Error('A backend is still idle in transaction after the stall ended.');
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  };

  const linkFor = async (account: { appUserId: string; email: string }): Promise<string> => {
    await request(server())
      .post('/api/v1/auth/password-reset-requests')
      .set('X-Forwarded-For', `10.9.${counter}.1`)
      .send({ email: account.email })
      .expect(202);
    const row = (
      await ctx.sql.query<{ id: string; payload_ciphertext: Buffer; payload_key_id: string }>(
        `SELECT o.id, o.payload_ciphertext, o.payload_key_id
           FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1 AND t.purpose = 'RESET_PASSWORD' AND t.revoked_at IS NULL AND t.consumed_at IS NULL`,
        [account.appUserId],
      )
    ).rows[0];

    return cipher.decrypt(row.id, row.payload_key_id, row.payload_ciphertext).token as string;
  };

  it('answers a reset 503 AUTH.UNAVAILABLE within the query timeout and writes nothing, then works again', async () => {
    const account = await newAccount();
    const link = await linkFor(account);
    const before = await footprint(account.appUserId);

    relay.holdWhen(WRITES_THE_CREDENTIAL);
    const started = Date.now();
    const stalled = await request(server())
      .post('/api/v1/auth/password-resets')
      .set('X-Forwarded-For', '10.9.200.1')
      .send({ token: link, newPassword: NEW_PASSWORD });
    const elapsed = Date.now() - started;
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(stalled.status).toBe(503);
    expect(bodyOf(stalled).error.code).toBe('AUTH.UNAVAILABLE');
    expect(elapsed).toBeLessThan(QUERY_TIMEOUT_MS + SLACK_MS + 4000);
    await noBackendLeftIdleInTransaction();
    expect(await footprint(account.appUserId)).toEqual(before);
    const stillUsable = await ctx.sql.query(
      `SELECT 1 FROM account_action_tokens WHERE token_hash = $1 AND consumed_at IS NULL AND revoked_at IS NULL`,
      [createHash('sha256').update(link).digest('hex')],
    );
    expect(stillUsable.rows).toHaveLength(1);

    await request(server())
      .post('/api/v1/auth/password-resets')
      .set('X-Forwarded-For', '10.9.200.2')
      .send({ token: link, newPassword: NEW_PASSWORD })
      .expect(200);
  }, 60000);

  it('answers a request for a link 503 AUTH.UNAVAILABLE when the database stops answering', async () => {
    const account = await newAccount();

    relay.holdWhen(/"normalized_login_email"/);
    const stalled = await request(server())
      .post('/api/v1/auth/password-reset-requests')
      .set('X-Forwarded-For', '10.9.201.1')
      .send({ email: account.email });
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(stalled.status).toBe(503);
    expect(bodyOf(stalled).error.code).toBe('AUTH.UNAVAILABLE');
    await noBackendLeftIdleInTransaction();
    await request(server())
      .post('/api/v1/auth/password-reset-requests')
      .set('X-Forwarded-For', '10.9.201.2')
      .send({ email: account.email })
      .expect(202);
  }, 60000);

  it('answers a change 503 SERVICE_UNAVAILABLE and writes nothing, then works again', async () => {
    const account = await newAccount();
    const session = bodyOf(
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: account.email, password: SEED_PASSWORD })
        .expect(200),
    ).data.accessToken;
    const before = await footprint(account.appUserId);

    relay.holdWhen(WRITES_THE_CREDENTIAL);
    const stalled = await request(server())
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${session}`)
      .send({ currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD });
    expect(relay.holding).toBe(true);
    relay.releaseHeld();

    expect(stalled.status).toBe(503);
    expect(bodyOf(stalled).error.code).toBe('SERVICE_UNAVAILABLE');
    await noBackendLeftIdleInTransaction();
    expect(await footprint(account.appUserId)).toEqual(before);
    // The session was not ended by a change that did not happen.
    await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${session}`).expect(200);

    await request(server())
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${session}`)
      .send({ currentPassword: SEED_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
  }, 60000);
});
