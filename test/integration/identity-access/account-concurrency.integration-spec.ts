import request from 'supertest';
import { Client } from 'pg';
import { PayloadCipher } from '../../../src/modules/notifications/email/payload-cipher.service';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

const PASSWORD = 'a long enough passphrase';
const ROUNDS = 8;

/** Resolves once at least `count` backends are waiting for a lock — never guesses with a fixed delay. */
async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.query<{ waiting: number }>(
      'SELECT count(*)::int AS waiting FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()',
    );
    if (rows[0].waiting >= count) return;
    if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

describe('lock protocol: account administration races (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let adminToken: string;
  let holder: Client;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asAdmin = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const response = await request(server())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    adminToken = bodyOf(response).data.accessToken;
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

  const invitationToken = async (appUserId: string): Promise<string> => {
    const cipher = ctx.app.get<PayloadCipher>(PayloadCipher, { strict: false });
    const { rows } = await ctx.sql.query<{ id: string; payload_key_id: string; payload_ciphertext: Buffer }>(
      `SELECT o.id, o.payload_key_id, o.payload_ciphertext FROM email_outbox o
         JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
        WHERE t.app_user_id = $1 AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND o.payload_ciphertext IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1`,
      [appUserId],
    );
    return cipher.decrypt(rows[0].id, rows[0].payload_key_id, rows[0].payload_ciphertext).token as string;
  };

  const newInvitedAccount = async () => {
    counter += 1;
    const email = `race${counter}@acme.vn`;
    const { employeeId } = await insertEmployeeFixture(ctx.app, seed, { code: `E-C${counter}`, email });
    const response = await request(server())
      .post('/api/v1/app-users')
      .set(asAdmin())
      .send({ employeeId, role: 'IT_ADMIN' })
      .expect(201);
    return { id: (response.body as { data: { id: string } }).data.id, email };
  };

  const newActivatedAccount = async () => {
    const account = await newInvitedAccount();
    const token = await invitationToken(account.id);
    await request(server()).post('/api/v1/auth/invitations/redeem').send({ token, password: PASSWORD }).expect(200);
    return account;
  };

  /**
   * Holds the account's row so every operation fired next queues behind it, then releases them
   * together. Which one the database serves first is the database's choice; the assertions below
   * hold for either order.
   */
  async function raceBehindLock<T>(appUserId: string, operations: Array<() => Promise<T>>): Promise<T[]> {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [appUserId]);
    const pending = operations.map((operation) => operation());
    await waitForWaiters(ctx.sql, operations.length);
    await holder.query('COMMIT');

    return Promise.all(pending);
  }

  const lock = (appUserId: string) => () =>
    request(server())
      .post(`/api/v1/app-users/${appUserId}/lock`)
      .set(asAdmin())
      .send({ reason: 'Lock racing the invitation redeem' })
      .then((r) => r);

  it('redeem racing a lock: never an activated account with a usable link, never a server error', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newInvitedAccount();
      const token = await invitationToken(account.id);

      const [redeemed, locked] = await raceBehindLock(account.id, [
        () =>
          request(server())
            .post('/api/v1/auth/invitations/redeem')
            .send({ token, password: PASSWORD })
            .then((r) => r),
        lock(account.id),
      ]);

      expect(locked.status).toBe(200);
      expect([200, 400]).toContain(redeemed.status);
      const state = await ctx.sql.query<{ status: string; activation_state: string; credentials: number }>(
        `SELECT u.status, u.activation_state,
                (SELECT count(*)::int FROM password_credentials c WHERE c.app_user_id = u.id) AS credentials
           FROM app_users u WHERE u.id = $1`,
        [account.id],
      );
      expect(state.rows[0].status).toBe('LOCKED');
      // The redeem either won (activated, with its credential) or lost (nothing written): never half of each.
      expect(state.rows[0].activation_state === 'ACTIVATED').toBe(redeemed.status === 200);
      expect(state.rows[0].credentials).toBe(redeemed.status === 200 ? 1 : 0);
      const usable = await ctx.sql.query(
        'SELECT 1 FROM account_action_tokens WHERE app_user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL',
        [account.id],
      );
      expect(usable.rows).toHaveLength(0);
    }
  }, 120000);

  it('login racing a lock: a locked account never keeps an open session', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newActivatedAccount();

      const [login, locked] = await raceBehindLock(account.id, [
        () =>
          request(server())
            .post('/api/v1/auth/login')
            .send({ email: account.email, password: PASSWORD })
            .then((r) => r),
        lock(account.id),
      ]);

      expect(locked.status).toBe(200);
      expect([200, 401]).toContain(login.status);
      const open = await ctx.sql.query('SELECT 1 FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL', [
        account.id,
      ]);
      expect(open.rows).toHaveLength(0);
      await ctx.sql.query('DELETE FROM login_throttles');
    }
  }, 120000);

  it('refresh racing a lock: the rotated token of a locked account is useless', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newActivatedAccount();
      const session = await request(server())
        .post('/api/v1/auth/login')
        .send({ email: account.email, password: PASSWORD })
        .expect(200);
      const refreshToken = bodyOf(session).data.refreshToken;

      const [refreshed, locked] = await raceBehindLock(account.id, [
        () =>
          request(server())
            .post('/api/v1/auth/refresh')
            .send({ refreshToken })
            .then((r) => r),
        lock(account.id),
      ]);

      expect(locked.status).toBe(200);
      expect([200, 401]).toContain(refreshed.status);
      if (refreshed.status === 200) {
        await request(server())
          .get('/api/v1/me')
          .set({ Authorization: `Bearer ${bodyOf(refreshed).data.accessToken}` })
          .expect(401);
      }
      const open = await ctx.sql.query('SELECT 1 FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL', [
        account.id,
      ]);
      expect(open.rows).toHaveLength(0);
    }
  }, 120000);

  it('two resends at once end with exactly one usable token and no pending mail for a dead one', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newInvitedAccount();
      const resend = () =>
        request(server())
          .post(`/api/v1/app-users/${account.id}/invitations`)
          .set(asAdmin())
          .then((r) => r);

      const results = await raceBehindLock(account.id, [resend, resend]);

      expect(results.map((r) => r.status)).toEqual([202, 202]);
      const usable = await ctx.sql.query<{ token_hash: string }>(
        'SELECT token_hash FROM account_action_tokens WHERE app_user_id = $1 AND consumed_at IS NULL AND revoked_at IS NULL',
        [account.id],
      );
      expect(usable.rows).toHaveLength(1);
      const live = await ctx.sql.query(
        `SELECT o.status FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1 AND o.status = 'PENDING' AND t.revoked_at IS NOT NULL`,
        [account.id],
      );
      expect(live.rows).toHaveLength(0);
    }
  }, 120000);

  it('two redemptions of one link at once: exactly one wins', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const account = await newInvitedAccount();
      const token = await invitationToken(account.id);
      const redeem = () =>
        request(server())
          .post('/api/v1/auth/invitations/redeem')
          .send({ token, password: PASSWORD })
          .then((r) => r);

      const results = await raceBehindLock(account.id, [redeem, redeem]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    }
  }, 120000);
});
