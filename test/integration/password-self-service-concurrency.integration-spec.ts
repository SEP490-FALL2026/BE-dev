import request from 'supertest';
import { Client } from 'pg';
import { PayloadCipher } from '../../src/modules/notifications/payload-cipher';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../support/http-test-app';

const ROUNDS = 6;
const NEW_PASSWORD = 'a brand new passphrase 42';
const OTHER_PASSWORD = 'a different brand new passphrase 43';

/** Resolves once at least `count` backends are waiting for a lock: never a fixed delay. */
async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.query<{ waiting: number }>(
      'SELECT count(*)::int AS waiting FROM pg_locks WHERE NOT granted',
    );
    if (rows[0].waiting >= count) return;
    if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('lock protocol: password self-service races (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let cipher: PayloadCipher;
  let adminToken: string;
  let holder: Client;
  let counter = 0;
  let clientAddress = 0;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createHttpTestApp({ env: { TRUST_PROXY_HOPS: '1' } });
    seed = await seedInstallation(ctx.app);
    cipher = ctx.app.get(PayloadCipher, { strict: false });
    adminToken = bodyOf(
      await request(server())
        .post('/api/v1/auth/login')
        .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
        .expect(200),
    ).data.accessToken;
    holder = new Client({ connectionString: ctx.database.url });
    await holder.connect();
  }, 90000);

  afterAll(async () => {
    await holder?.end();
    await ctx?.close();
  });

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await ctx.sql.query('DELETE FROM login_throttles');
  });

  const freshAddress = () => {
    clientAddress += 1;

    return `10.${Math.floor(clientAddress / 250)}.${clientAddress % 250}.2`;
  };

  const newAccount = async () => {
    counter += 1;
    const email = `race.ps.${counter}@acme.vn`;
    const account = await insertAccountFixture(ctx.app, seed, { code: `E-RP${counter}`, email, activated: true });

    return { ...account, email };
  };

  const login = (email: string, password = SEED_PASSWORD) =>
    request(server()).post('/api/v1/auth/login').send({ email, password });
  const accessTokenFor = async (email: string) => bodyOf(await login(email).expect(200)).data.accessToken;

  const forgot = (email: string) =>
    request(server())
      .post('/api/v1/auth/password-reset-requests')
      .set('X-Forwarded-For', freshAddress())
      .send({ email });
  const reset = (token: string, newPassword = NEW_PASSWORD) =>
    request(server())
      .post('/api/v1/auth/password-resets')
      .set('X-Forwarded-For', freshAddress())
      .send({ token, newPassword });
  const change = (accessToken: string, currentPassword: string, newPassword: string) =>
    request(server())
      .post('/api/v1/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword, newPassword });
  const lock = (appUserId: string) =>
    request(server()).post(`/api/v1/app-users/${appUserId}/lock`).set('Authorization', `Bearer ${adminToken}`);

  const issueLink = async (account: { appUserId: string; email: string }): Promise<string> => {
    await forgot(account.email).expect(202);
    const row = (
      await ctx.sql.query<{ id: string; payload_ciphertext: Buffer; payload_key_id: string }>(
        `SELECT o.id, o.payload_ciphertext, o.payload_key_id
           FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1 AND t.purpose = 'RESET_PASSWORD' AND t.revoked_at IS NULL
            AND t.consumed_at IS NULL AND o.status = 'PENDING'`,
        [account.appUserId],
      )
    ).rows[0];

    return cipher.decrypt(row.id, row.payload_key_id, row.payload_ciphertext).token as string;
  };

  const deadlocks = async (): Promise<number> =>
    (
      await ctx.sql.query<{ n: number }>(
        'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
      )
    ).rows[0].n;

  const state = async (appUserId: string) =>
    (
      await ctx.sql.query<{
        status: string;
        hash: string;
        open_sessions: number;
        usable_tokens: number;
        notices: number;
        pending_reset_mail: number;
      }>(
        `SELECT u.status, c.hash,
                (SELECT count(*)::int FROM auth_sessions s WHERE s.app_user_id = u.id AND s.revoked_at IS NULL) AS open_sessions,
                (SELECT count(*)::int FROM account_action_tokens t WHERE t.app_user_id = u.id AND t.consumed_at IS NULL AND t.revoked_at IS NULL) AS usable_tokens,
                (SELECT count(*)::int FROM email_outbox o WHERE o.template = 'PASSWORD_CHANGED_NOTICE' AND o.recipient = u.login_email) AS notices,
                (SELECT count(*)::int FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
                  WHERE t.app_user_id = u.id AND t.purpose = 'RESET_PASSWORD' AND o.status = 'PENDING') AS pending_reset_mail
           FROM app_users u JOIN password_credentials c ON c.app_user_id = u.id WHERE u.id = $1`,
        [appUserId],
      )
    ).rows[0];

  /**
   * Holds the account's row so every operation fired next queues behind it, then releases them together.
   * Which one the database serves first is the database's choice; the assertions hold for either order.
   */
  async function raceBehindLock<T>(appUserId: string, operations: Array<() => Promise<T>>): Promise<T[]> {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [appUserId]);
    const pending = operations.map((operation) => operation());
    await waitForWaiters(ctx.sql, operations.length);
    await holder.query('COMMIT');

    return Promise.all(pending);
  }

  it('reset racing a lock: the account ends locked, and a reset that lost wrote nothing', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newAccount();
      const link = await issueLink(account);
      const before = await state(account.appUserId);

      const [resetAnswer, lockAnswer] = await raceBehindLock(account.appUserId, [
        () => reset(link).then((response) => response),
        () => lock(account.appUserId).then((response) => response),
      ]);

      expect(lockAnswer.status).toBe(200);
      expect([200, 400]).toContain(resetAnswer.status);
      const after = await state(account.appUserId);
      expect(after.status).toBe('LOCKED');
      expect(after.usable_tokens).toBe(0);
      // The reset either won (new hash, one notice) or lost (nothing written): never half of each.
      expect(after.hash !== before.hash).toBe(resetAnswer.status === 200);
      expect(after.notices).toBe(resetAnswer.status === 200 ? 1 : 0);
      expect(after.pending_reset_mail).toBe(0);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

  it('reset racing a sign-in with the old password: no session survives the reset', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newAccount();
      const link = await issueLink(account);

      const [resetAnswer, loginAnswer] = await raceBehindLock(account.appUserId, [
        () => reset(link).then((response) => response),
        () => login(account.email).then((response) => response),
      ]);

      expect(resetAnswer.status).toBe(200);
      expect([200, 401]).toContain(loginAnswer.status);
      const after = await state(account.appUserId);
      // A sign-in that won the lock opened a session; the reset then ended it. One that lost verified a hash that
      // is gone and is refused. Either way nothing signed in with the old password is still open.
      expect(after.open_sessions).toBe(0);
      expect(after.notices).toBe(1);
      expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
      expect((await login(account.email)).status).toBe(401);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

  it('two resets with the same link: exactly one wins', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newAccount();
      const link = await issueLink(account);

      const answers = await raceBehindLock(account.appUserId, [
        () => reset(link, NEW_PASSWORD).then((response) => response),
        () => reset(link, OTHER_PASSWORD).then((response) => response),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 400]);
      const winner = answers[0].status === 200 ? NEW_PASSWORD : OTHER_PASSWORD;
      const after = await state(account.appUserId);
      expect(after.notices).toBe(1);
      expect(after.usable_tokens).toBe(0);
      expect((await login(account.email, winner)).status).toBe(200);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

  it('two changes with the same current password: exactly one wins, the other is told it is wrong', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newAccount();
      const first = await accessTokenFor(account.email);
      const second = await accessTokenFor(account.email);

      const answers = await raceBehindLock(account.appUserId, [
        () => change(first, SEED_PASSWORD, NEW_PASSWORD).then((response) => response),
        () => change(second, SEED_PASSWORD, OTHER_PASSWORD).then((response) => response),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 422]);
      const loser = answers.find((answer) => answer.status === 422);
      expect(bodyOf(loser as request.Response).error.code).toBe('AUTH.CURRENT_PASSWORD_INVALID');
      const winner = answers[0].status === 200 ? NEW_PASSWORD : OTHER_PASSWORD;
      const after = await state(account.appUserId);
      expect(after.notices).toBe(1);
      expect(after.open_sessions).toBe(0);
      expect((await login(account.email, winner)).status).toBe(200);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

  it('two requests for a link: both answered alike, one link usable, one mail pending, no server error', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newAccount();

      const answers = await raceBehindLock(account.appUserId, [
        () => forgot(account.email).then((response) => response),
        () => forgot(account.email).then((response) => response),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([202, 202]);
      expect(bodyOf(answers[0]).data).toEqual(bodyOf(answers[1]).data);
      const after = await state(account.appUserId);
      expect(after.usable_tokens).toBe(1);
      expect(after.pending_reset_mail).toBe(1);
      const issued = await ctx.sql.query(
        `SELECT 1 FROM account_action_tokens WHERE app_user_id = $1 AND purpose = 'RESET_PASSWORD'`,
        [account.appUserId],
      );
      expect(issued.rows).toHaveLength(2);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);

  it('a request for a link racing a lock: the account ends locked with no usable link and no pending mail', async () => {
    const deadlocksBefore = await deadlocks();
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newAccount();

      const [forgotAnswer, lockAnswer] = await raceBehindLock(account.appUserId, [
        () => forgot(account.email).then((response) => response),
        () => lock(account.appUserId).then((response) => response),
      ]);

      expect(forgotAnswer.status).toBe(202);
      expect(lockAnswer.status).toBe(200);
      const after = await state(account.appUserId);
      expect(after.status).toBe('LOCKED');
      expect(after.usable_tokens).toBe(0);
      expect(after.pending_reset_mail).toBe(0);
    }
    expect(await deadlocks()).toBe(deadlocksBefore);
  }, 120000);
});
