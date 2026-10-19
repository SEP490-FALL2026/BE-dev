import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import { PasswordHasher } from '../../src/modules/identity-access/accounts/password-hasher.service';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  seedInstallation,
} from '../support/http-test-app';
import { PgRelay } from '../support/pg-relay';

/** R-14 (page and count from one snapshot) and R-09 (no Argon2 for a token that cannot be redeemed). */
describe('account list snapshot and redeem cost (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let relay: PgRelay;
  let seed: SeededInstallation;
  let token: string;

  const addInvitedAccounts = async (prefix: string, count: number): Promise<void> => {
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, $2 || '-' || n, 'Person ' || n, lower($2) || n || '@acme.vn', lower($2) || n || '@acme.vn', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()
         FROM generate_series(1, $3::int) AS n`,
      [seed.organizationId, prefix, count],
    );
    await ctx.sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state, updated_at)
       SELECT gen_random_uuid(), organization_id, id, work_email, normalized_work_email, 'ACTIVE', 'INVITED', now()
         FROM employees WHERE employee_code LIKE $1 || '-%'`,
      [prefix],
    );
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        return url.toString();
      },
    });
    seed = await seedInstallation(ctx.app);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    token = bodyOf(login).data.accessToken;
    await addInvitedAccounts('LST', 4);
  }, 90000);

  afterAll(async () => {
    relay?.releaseHeld();
    await ctx?.close();
    await relay?.stop();
  });

  it('counts from the same snapshot as the page, even when an account is created in between (R-14)', async () => {
    relay.holdWhen(/^SELECT COUNT\(\*\)/i);
    const pending = request(ctx.app.getHttpServer())
      .get('/api/v1/app-users?page=1&pageSize=100')
      .set({ Authorization: `Bearer ${token}` });
    const responsePromise = pending.then((response) => response);
    for (let i = 0; i < 100 && !relay.holding; i += 1) await sleep(20);
    expect(relay.holding).toBe(true);

    await addInvitedAccounts('NEW', 1); // committed while the count waits
    relay.releaseHeld();
    const response = await responsePromise;

    expect(response.status).toBe(200);
    const data = (response.body as { data: { items: unknown[]; pagination: { totalItems: number } } }).data;
    expect(data.pagination.totalItems).toBe(data.items.length);
  }, 30000);

  it.each([
    ['malformed', 'not-a-token'],
    ['unknown', 'x'.repeat(43)],
  ])('refuses a %s invitation token without hashing the password (R-09)', async (_kind, invitation) => {
    const hasher = ctx.app.get(PasswordHasher, { strict: false });
    const hash = jest.spyOn(hasher, 'hash');
    try {
      const response = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/invitations/redeem')
        .send({ token: invitation, password: 'a perfectly fine password 42' });

      expect(response.status).toBe(400);
      expect((response.body as { error: { code: string } }).error.code).toBe('AUTH.INVITATION_INVALID');
      expect(hash).not.toHaveBeenCalled();
    } finally {
      hash.mockRestore(); // also when an expectation fails, so the next case counts its own calls
    }
  });
});
