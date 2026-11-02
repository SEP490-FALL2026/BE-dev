import { setTimeout as sleep } from 'node:timers/promises';
import request from 'supertest';
import { PasswordHasher } from '../../../src/modules/identity-access/credentials/password-hasher.service';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  seedInstallation,
} from '../../support/http-test-app';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

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

  it('lists managers placed in a department on the requested day with constant query count', async () => {
    const rows = (
      await ctx.sql.query<{ employee: string; account: string }>(
        `SELECT e.id AS employee, u.id AS account FROM employees e JOIN app_users u ON u.employee_id = e.id
       WHERE e.employee_code LIKE 'LST-%' ORDER BY e.employee_code`,
      )
    ).rows;
    for (const row of rows.slice(0, 2)) {
      await ctx.sql.query(
        `INSERT INTO role_grants (id, organization_id, app_user_id, role)
        VALUES (gen_random_uuid(), $1, $2, 'MANAGER')`,
        [seed.organizationId, row.account],
      );
    }
    await ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
      VALUES (gen_random_uuid(), $1, $2, $3, '2026-02-01')`,
      [seed.organizationId, rows[0].employee, seed.departmentId],
    );
    const list = () =>
      request(ctx.app.getHttpServer())
        .get(`/api/v1/app-users?departmentId=${seed.departmentId}&memberOn=2026-03-01&role=MANAGER`)
        .set({ Authorization: `Bearer ${token}` })
        .then((response) => response);
    const first = await QueryCounter.on(relay).run(list);
    expect(first.result.status).toBe(200);
    expect((first.result.body as { data: { items: { id: string }[] } }).data.items.map((item) => item.id)).toEqual([
      rows[0].account,
    ]);
    await ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
      VALUES (gen_random_uuid(), $1, $2, $3, '2026-02-01')`,
      [seed.organizationId, rows[1].employee, seed.departmentId],
    );
    const second = await QueryCounter.on(relay).run(list);
    expect(second.result.status).toBe(200);
    expect(
      (second.result.body as { data: { items: { id: string }[] } }).data.items.map((item) => item.id).sort(),
    ).toEqual(
      rows
        .slice(0, 2)
        .map((row) => row.account)
        .sort(),
    );
    expect(dataStatements(second.statements).length).toBe(dataStatements(first.statements).length);
    await ctx.sql.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role)
      VALUES (gen_random_uuid(), $1, $2, 'SPENDING_APPROVER')`,
      [seed.organizationId, rows[2].account],
    );
    const approvers = await request(ctx.app.getHttpServer())
      .get('/api/v1/app-users?role=SPENDING_APPROVER')
      .set({ Authorization: `Bearer ${token}` });
    expect(approvers.status).toBe(200);
    expect((approvers.body as { data: { items: { id: string }[] } }).data.items.map((item) => item.id)).toEqual([
      rows[2].account,
    ]);
    const beforePlacement = await request(ctx.app.getHttpServer())
      .get(`/api/v1/app-users?departmentId=${seed.departmentId}&memberOn=2026-01-20&role=MANAGER`)
      .set({ Authorization: `Bearer ${token}` });
    expect(beforePlacement.status).toBe(200);
    expect((beforePlacement.body as { data: { items: unknown[] } }).data.items).toEqual([]);
    const missing = await request(ctx.app.getHttpServer())
      .get('/api/v1/app-users?memberOn=2026-03-01')
      .set({ Authorization: `Bearer ${token}` });
    expect([missing.status, (missing.body as { error: { code: string } }).error.code]).toEqual([
      422,
      'VALIDATION_ERROR',
    ]);
    const unknown = await request(ctx.app.getHttpServer())
      .get('/api/v1/app-users?departmentId=00000000-0000-4000-8000-000000000001')
      .set({ Authorization: `Bearer ${token}` });
    expect(unknown.status).toBe(200);
    expect((unknown.body as { data: { items: unknown[] } }).data.items).toEqual([]);
  });

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
