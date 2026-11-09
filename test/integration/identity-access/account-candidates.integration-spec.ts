import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  seedInstallation,
} from '../../support/http-test-app';

interface Candidate {
  id: string;
  employeeCode: string;
}

/**
 * R-03: GET /account-candidates must return the first 20 Employees (by code) who are active and
 * have no account, however many earlier Employees already have one.
 */
describe('account candidates beyond the first 200 employees (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let adminToken: string;

  const candidates = async (query = ''): Promise<Candidate[]> => {
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/account-candidates${query}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .expect(200);

    return (response.body as { data: { items: Candidate[] } }).data.items;
  };

  /** Employees `${prefix}-001`…, each with an invited account when `withAccount` is set. */
  const bulkEmployees = async (prefix: string, count: number, withAccount: boolean): Promise<void> => {
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email,
                              employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, $2 || '-' || lpad(n::text, 3, '0'), 'Person ' || n,
              lower($2) || n || '@acme.vn', lower($2) || n || '@acme.vn', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()
         FROM generate_series(1, $3::int) AS n`,
      [seed.organizationId, prefix, count],
    );
    if (!withAccount) return;
    await ctx.sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status,
                              activation_state, updated_at)
       SELECT gen_random_uuid(), organization_id, id, work_email, normalized_work_email, 'ACTIVE', 'INVITED', now()
         FROM employees WHERE employee_code LIKE $1 || '-%'`,
      [prefix],
    );
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    adminToken = bodyOf(login).data.accessToken;
    await bulkEmployees('FXA', 200, true);
    await bulkEmployees('FXZ', 30, false);
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('returns the first 20 by code even when 200 earlier employees already have an account', async () => {
    const codes = (await candidates()).map((item) => item.employeeCode);
    expect(codes).toEqual(Array.from({ length: 20 }, (_, index) => `FXZ-${String(index + 1).padStart(3, '0')}`));
  });

  it('applies the search filter to the same rule', async () => {
    const codes = (await candidates('?search=FXZ-02')).map((item) => item.employeeCode);
    expect(codes).toEqual(Array.from({ length: 10 }, (_, index) => `FXZ-0${index + 20}`));
  });

  it('returns fewer than 20 when fewer remain, after skipping every employee with an account', async () => {
    await ctx.sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status,
                              activation_state, updated_at)
       SELECT gen_random_uuid(), organization_id, id, work_email, normalized_work_email, 'ACTIVE', 'INVITED', now()
         FROM employees WHERE employee_code LIKE 'FXZ-%' AND employee_code > 'FXZ-005'`,
    );

    const codes = (await candidates()).map((item) => item.employeeCode);
    expect(codes).toEqual(['FXZ-001', 'FXZ-002', 'FXZ-003', 'FXZ-004', 'FXZ-005']);
  });
});
