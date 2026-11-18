import type { Response } from 'supertest';
import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  seedInstallation,
} from '../../support/http-test-app';

/**
 * GET /account-candidates against an SQL oracle: the first 20 ACTIVE employees without an account, by
 * (employee_code, id), search matched literally.
 *
 * - N-3 / R-03: the answer does not depend on how many earlier employees already have an account. The
 *   block of employees with accounts grows past every old page boundary (200, 400, 5 000 ...) and the API
 *   must keep matching the oracle, with the 20th and 21st eligible employees on the right side of the limit.
 * - N-6: `%`, `_` and the backslash in a search term are literal characters, not LIKE wildcards. The
 *   oracle escapes with the same rule, so a shared mistake would pass it; the absolute expectations
 *   (`Z_1`, `%`, `Y\1`) are what pin the rule down.
 *
 * Scale beyond a few thousand accounts (the 50 000 measurement) belongs to the review runner, not to CI.
 */
describe('account candidates: exclusion, limit and literal search (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let token: string;
  let accounts = 0;

  const BACKSLASH_CODE = 'Y' + String.fromCharCode(92) + '1';

  const codesOf = (response: Response): string[] =>
    (bodyOf(response).data as unknown as { items: { employeeCode: string }[] }).items.map((i) => i.employeeCode);

  const api = async (query = ''): Promise<string[]> =>
    codesOf(
      await request(ctx.app.getHttpServer())
        .get(`/api/v1/account-candidates${query}`)
        .set({ Authorization: `Bearer ${token}` })
        .expect(200),
    );

  const oracle = async (search?: string): Promise<string[]> => {
    const term = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const { rows } = await ctx.sql.query<{ employee_code: string }>(
      `SELECT e.employee_code FROM employees e
        WHERE e.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.employee_id = e.id)
          AND ($1::text IS NULL OR e.employee_code ILIKE $1 OR e.full_name ILIKE $1 OR e.work_email ILIKE $1)
        ORDER BY e.employee_code, e.id LIMIT 20`,
      [term],
    );
    return rows.map((r) => r.employee_code);
  };

  /** Employees A-00001... with an invited account, until `total` of them exist. */
  const growLeadingBlock = async (total: number): Promise<void> => {
    if (total <= accounts) return;
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, 'A-' || lpad(n::text, 5, '0'), 'Leading ' || n, 'a' || n || '@acme.test', 'a' || n || '@acme.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()
         FROM generate_series($2::int, $3::int) AS n`,
      [seed.organizationId, accounts + 1, total],
    );
    await ctx.sql.query(
      `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state, updated_at)
       SELECT gen_random_uuid(), organization_id, id, work_email, normalized_work_email, 'ACTIVE', 'INVITED', now()
         FROM employees e WHERE employee_code LIKE 'A-%' AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.employee_id = e.id)`,
    );
    accounts = total;
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    token = bodyOf(login).data.accessToken;
    // B-0001...B-0030 are eligible after the block (B-0003 is TERMINATED); codes with LIKE metacharacters.
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, 'B-' || lpad(n::text, 4, '0'), 'Eligible ' || n, 'b' || n || '@acme.test', 'b' || n || '@acme.test', 'STAFF', DATE '2026-01-05',
              (CASE WHEN n = 3 THEN 'TERMINATED' ELSE 'ACTIVE' END)::"EmployeeStatus", now()
         FROM generate_series(1, 30) AS n`,
      [seed.organizationId],
    );
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'Z_1', 'Underscore', 'z1@acme.test', 'z1@acme.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()),
              (gen_random_uuid(), $1::uuid, 'ZX1', 'No underscore', 'zx1@acme.test', 'zx1@acme.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()),
              (gen_random_uuid(), $1::uuid, $2, 'Backslash', 'yb1@acme.test', 'yb1@acme.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()),
              (gen_random_uuid(), $1::uuid, 'Y1', 'No backslash', 'y1@acme.test', 'y1@acme.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now())`,
      [seed.organizationId, BACKSLASH_CODE],
    );
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  it.each([0, 199, 200, 201, 399, 400, 401, 4980, 4981, 4999, 5000, 5001, 6000])(
    'matches the oracle with %i leading employees that have an account',
    async (n) => {
      await growLeadingBlock(n);

      const found = await api();

      expect(found).toEqual(await oracle());
      expect(new Set(found).size).toBe(found.length);
    },
    60000,
  );

  it('keeps the 20th and 21st eligible employees on the right side of the limit', async () => {
    // B-0001...B-0021 minus TERMINATED B-0003: the 20th eligible is B-0021, the 21st is B-0022.
    const found = await api();

    expect(found).toHaveLength(20);
    expect(found.at(-1)).toBe('B-0021');
    expect(found).not.toContain('B-0022');
  });

  it('search=B-00 matches the oracle', async () => {
    expect(await api('?search=B-00')).toEqual(await oracle('B-00'));
  });

  // Absolute expectations: the oracle copies the escaping rule, so it cannot catch a shared mistake.
  it.each([
    ['search=Z_1 (underscore is literal)', 'Z_1', ['Z_1']],
    ['search=% (percent is literal)', '%', []],
    ['search=Y<backslash>1 (backslash is literal)', BACKSLASH_CODE, [BACKSLASH_CODE]],
  ])('%s', async (_label, term, expected) => {
    const found = await api(`?search=${encodeURIComponent(term)}`);

    expect(found).toEqual(expected);
    expect(found).toEqual(await oracle(term));
  });
});
