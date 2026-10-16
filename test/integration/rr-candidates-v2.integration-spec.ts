/**
 * R-03 / N-3 / N-6 prototype check (not a product test as written; dev A turns the essential cases into
 * test/integration/account-candidates.integration-spec.ts). Compares GET /account-candidates with an SQL
 * oracle — the first 20 ACTIVE employees without an account, by (employee_code, id), matched literally —
 * while the block of employees that already have an account grows past every old page boundary.
 * Writes evidence to RR_OUT when set.
 */
import { writeFileSync } from 'node:fs';
import request from 'supertest';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  seedInstallation,
} from '../support/http-test-app';

interface Row {
  label: string;
  leadingWithAccount: number;
  api: string[];
  oracle: string[];
  equal: boolean;
  ms: number;
}

describe('candidates: one exclusion query (integration, real PostgreSQL)', () => {
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
    const items = (response.body as { data: { items: { employeeCode: string }[] } }).data.items;
    return { codes: items.map((i) => i.employeeCode), ms: Date.now() - started };
  };

  const oracle = async (search?: string): Promise<string[]> => {
    const term = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const { rows: found } = await ctx.sql.query<{ employee_code: string }>(
      `SELECT e.employee_code FROM employees e
        WHERE e.status = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM app_users u WHERE u.employee_id = e.id)
          AND ($1::text IS NULL OR e.employee_code ILIKE $1 OR e.full_name ILIKE $1 OR e.work_email ILIKE $1)
        ORDER BY e.employee_code, e.id LIMIT 20`,
      [term],
    );
    return found.map((r) => r.employee_code);
  };

  /** Employees A-00001… with an invited account, until `total` of them exist. */
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
    const row = {
      label,
      leadingWithAccount: created,
      api: codes,
      oracle: expected,
      equal: JSON.stringify(codes) === JSON.stringify(expected),
      ms,
    };
    rows.push(row);
    return row;
  };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
      .expect(200);
    token = bodyOf(login).data.accessToken;
    // B-0001…B-0030 eligible after the block (B-0003 TERMINATED); codes with LIKE metacharacters.
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       SELECT gen_random_uuid(), $1::uuid, 'B-' || lpad(n::text, 4, '0'), 'Eligible ' || n, 'b' || n || '@rr.test', 'b' || n || '@rr.test', 'STAFF', DATE '2026-01-05',
              (CASE WHEN n = 3 THEN 'TERMINATED' ELSE 'ACTIVE' END)::"EmployeeStatus", now()
         FROM generate_series(1, 30) AS n`,
      [seed.organizationId],
    );
    await ctx.sql.query(
      `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, normalized_work_email, employment_type, hire_date, status, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'Z_1', 'Underscore', 'z1@rr.test', 'z1@rr.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()),
              (gen_random_uuid(), $1::uuid, 'ZX1', 'No underscore', 'zx1@rr.test', 'zx1@rr.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()),
              (gen_random_uuid(), $1::uuid, 'Y' || chr(92) || '1', 'Backslash', 'yb1@rr.test', 'yb1@rr.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now()),
              (gen_random_uuid(), $1::uuid, 'Y1', 'No backslash', 'y1@rr.test', 'y1@rr.test', 'STAFF', DATE '2026-01-05', 'ACTIVE', now())`,
      [seed.organizationId],
    );
  }, 120000);

  afterAll(async () => {
    if (process.env.RR_OUT) writeFileSync(process.env.RR_OUT, JSON.stringify(rows, null, 1));
    await ctx?.close();
  });

  it.each([0, 199, 200, 201, 399, 400, 401, 4980, 4981, 4999, 5000, 5001, 6000, 50000])(
    'matches the oracle with %i leading employees that have an account',
    async (n) => {
      await growLeadingBlock(n);
      const row = await record(`n=${n}`);
      expect(row.api).toEqual(row.oracle);
      expect(new Set(row.api).size).toBe(row.api.length);
    },
    300000,
  );

  it('keeps the 20th and 21st eligible employees on the right side of the limit', async () => {
    // B-0001…B-0021 minus TERMINATED B-0003: the 20th eligible is B-0021, the 21st is B-0022.
    const row = await record('boundary');
    expect(row.api).toHaveLength(20);
    expect(row.api.at(-1)).toBe('B-0021');
    expect(row.api).not.toContain('B-0022');
  });

  it('search=B-00 matches the oracle', async () => {
    const row = await record('search=B-00', '?search=B-00', 'B-00');
    expect(row.api).toEqual(row.oracle);
  });

  // Absolute expectations: the oracle copies the escaping rule, so it cannot catch a shared mistake.
  const BACKSLASH_CODE = 'Y' + String.fromCharCode(92) + '1';
  it.each([
    ['search=Z_1 (underscore is literal)', 'Z_1', ['Z_1']],
    ['search=% (percent is literal)', '%', []],
    ['search=Y<backslash>1 (backslash is literal)', BACKSLASH_CODE, [BACKSLASH_CODE]],
  ])('%s', async (label, term, expected) => {
    const row = await record(label, `?search=${encodeURIComponent(term)}`, term);
    expect(row.api).toEqual(expected);
    expect(row.api).toEqual(row.oracle);
  });
});
