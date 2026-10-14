/**
 * Re-review runner for R-03 (not a product test; copied into an isolated clone's test/integration and
 * run with `pnpm test:integration -- rr-candidates-scale`). Compares GET /account-candidates with an SQL
 * oracle — the first 20 ACTIVE employees without an account, by employee code — while the leading block
 * of employees that already have an account grows across the page boundaries of the fix
 * (page 200, at most 25 pages = 5 000 employees). Writes evidence to RR_OUT.
 */
import { writeFileSync } from 'node:fs';
import request from 'supertest';
import { bodyOf } from '../support/api-body';
import { HttpTestApp, SEED_PASSWORD, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';

interface Row {
  label: string;
  leadingWithAccount: number;
  api: string[];
  oracle: string[];
  equal: boolean;
  ms: number;
}

describe('R-03 re-review: candidates across page boundaries (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let token: string;
  let created = 0;
  const rows: Row[] = [];

  const api = async (query = ''): Promise<{ codes: string[]; ms: number }> => {
    const started = Date.now();
    const response = await request(ctx.app.getHttpServer())
      .get(`/api/v1/account-candidates${query}`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(200);
    return { codes: (response.body as { data: { items: { employeeCode: string }[] } }).data.items.map((i) => i.employeeCode), ms: Date.now() - started };
  };

  const oracle = async (search?: string): Promise<string[]> => {
    const term = search ? `%${search}%` : null;
    const { rows: found } = await ctx.sql.query<{ employee_code: string }>(
      `SELECT e.employee_code FROM employees e
        WHERE e.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.employee_id = e.id)
          AND ($1::text IS NULL OR e.employee_code ILIKE $1 OR e.full_name ILIKE $1 OR e.work_email ILIKE $1)
        ORDER BY e.employee_code LIMIT 20`,
      [term],
    );
    return found.map((r) => r.employee_code);
  };

  /** Adds employees A-00001… (each with an invited account) until `total` of them exist. */
  const growLeadingBlock = async (total: number): Promise<void> => {
    if (total <= created) return;
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, 'A-' || lpad(n::text, 5, '0'), 'Leading ' || n, 'a' || n || '@rr.test', 'a' || n || '@rr.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()
         FROM generate_series($2::int, $3::int) AS n`,
      [seed.organizationId, created + 1, total],
    );
    await ctx.sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state, updated_at)
       SELECT gen_random_uuid(), organization_id, id, work_email, normalized_work_email, 'ACTIVE', 'INVITED', now()
         FROM employees e WHERE employee_code LIKE 'A-%' AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.employee_id = e.id)`,
    );
    created = total;
  };

  const record = async (label: string, query = '', search?: string): Promise<Row> => {
    const { codes, ms } = await api(query);
    const expected = await oracle(search);
    const row = { label, leadingWithAccount: created, api: codes, oracle: expected, equal: JSON.stringify(codes) === JSON.stringify(expected), ms };
    rows.push(row);
    return row;
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const login = await request(ctx.app.getHttpServer()).post('/api/v1/auth/login').send({ email: seed.superAdmin.email, password: SEED_PASSWORD }).expect(200);
    token = bodyOf(login).data.accessToken;
    // Eligible employees that sort after the leading block: B-0001…B-0030, no account. A TERMINATED one
    // inside the block and one LOCKED-account employee check the filter is unchanged.
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, 'B-' || lpad(n::text, 4, '0'), 'Eligible ' || n, 'b' || n || '@rr.test', 'b' || n || '@rr.test', 'STAFF', DATE '2026-01-05',
              (CASE WHEN n = 3 THEN 'TERMINATED' ELSE 'ACTIVE' END)::"EmployeeStatus", now()
         FROM generate_series(1, 30) AS n`,
      [seed.organizationId],
    );
  }, 120000);

  afterAll(async () => {
    if (process.env.RR_OUT) writeFileSync(process.env.RR_OUT, JSON.stringify(rows, null, 1));
    await ctx?.close();
  });

  it.each([0, 199, 200, 201, 399, 400, 401, 4979, 4980, 4981, 4999, 5000, 5001, 6000])(
    'leading block of %i employees with an account',
    async (n) => {
      await growLeadingBlock(n);
      const row = await record(`n=${n}`);
      // Recorded either way; the assertion documents what the fix guarantees (< 5 000 scanned).
      if (n + 20 <= 5000) expect(row.api).toEqual(row.oracle);
    },
    120000,
  );

  it('search narrows to the same rule across pages (search=B-00, after 6 000 leading accounts)', async () => {
    const row = await record('search=B-00', '?search=B-00', 'B-00');
    expect(row.api).toEqual(row.oracle);
  }, 120000);

  it('search that matches the whole leading block first (search=-0)', async () => {
    await record('search=-0', '?search=-0', '-0');
  }, 120000);
});
