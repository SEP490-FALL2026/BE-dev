import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { pretendBusinessToday } from '../../support/pretend-today';
import { QueryCounter, tablesOf } from '../../support/query-count';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/** LD-11, LD-14 and LD-15 of the post-merge review: one snapshot, histories that say when they are cut (LD-12, the projects, went with QĐ-93h). */
describe('organization and identity read contracts (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    pretendBusinessToday(h.ctx.app, '2026-12-01');
  }, 120000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
    await relay?.stop();
  });

  const asAdmin = () => ({ Authorization: `Bearer ${h.admin}` });
  const get = (path: string, headers: Record<string, string> = h.as(h.it1)) =>
    counter.run(() => request(h.server()).get(path).set(headers).expect(200));
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;

  /** Every statement that touched `table`, plus whether they ran inside one repeatable-read transaction. */
  const oneSnapshot = (statements: string[], table: string, expected: number): boolean => {
    const touched = statements
      .map((statement, index) => ({ statement, index }))
      .filter(({ statement }) => tablesOf(statement).includes(table));
    if (touched.length !== expected) return false;
    const first = touched[0].index;
    const last = touched[touched.length - 1].index;
    const begin = statements
      .slice(0, first)
      .reduce((found, statement, index) => (/^\s*BEGIN/i.test(statement) ? index : found), -1);
    const commit = statements.findIndex((statement, index) => /^\s*COMMIT/i.test(statement) && index > last);

    return (
      begin >= 0 &&
      commit > last &&
      statements.slice(begin, commit).some((statement) => /REPEATABLE\s+READ/i.test(statement))
    );
  };

  describe('LD-12 retired (QĐ-93h): no project on the profile', () => {
    it('reads the department profile with no project key and without touching a project table', async () => {
      const { result, statements } = await get(`/api/v1/departments/${h.seed.departmentId}`);

      const profile = dataOf<Record<string, unknown>>(result);
      expect(profile).not.toHaveProperty('projects');
      expect(profile).not.toHaveProperty('projectTotal');
      expect(statements.filter((one) => /\b(?:projects|project_departments)\b/i.test(one))).toEqual([]);
      await request(h.server()).get('/api/v1/projects').set(asAdmin()).expect(404);
    });
  });

  describe('LD-11: the people of a department and of a Cost Center', () => {
    it('counts and cuts the members in one repeatable-read snapshot, and reads whether there is an email, not the email', async () => {
      await h.crowd('LD11', 3);

      // The members with their work state are read by the Super Admin and the head of the department (the IT Admin reads a minimum).
      const { result, statements } = await get(
        `/api/v1/departments/${h.seed.departmentId}/employees?pageSize=2`,
        asAdmin(),
      );

      const page = dataOf<{ items: Record<string, unknown>[]; pagination: { totalItems: number } }>(result);
      expect(page.items).toHaveLength(2);
      expect(page.pagination.totalItems).toBeGreaterThanOrEqual(5);
      expect(Object.keys(page.items[0]).sort()).toEqual([
        'employeeCode',
        'fullName',
        'hasWorkEmail',
        'memberSince',
        'status',
        'workState',
      ]);
      expect(oneSnapshot(statements, 'employee_placements', 2)).toBe(true);
      expect(JSON.stringify(page)).not.toContain('@acme.vn');
      for (const statement of statements.filter((one) => tablesOf(one).includes('employee_placements'))) {
        expect(statement).not.toMatch(/e\.work_email(?!\s+IS\s+NOT\s+NULL)/);
      }
    });

    it('counts and cuts the employees of a Cost Center in one repeatable-read snapshot', async () => {
      const unit = await h.ownUnit();

      const { result, statements } = await get(`/api/v1/cost-centers/${unit.id}/employees?pageSize=2`, h.as(h.finance));

      expect(dataOf<{ items: unknown[]; pagination: { totalItems: number } }>(result).items).toHaveLength(2);
      expect(oneSnapshot(statements, 'employee_placements', 2)).toBe(true);
    });
  });

  describe('LD-14: a history that is cut says so', () => {
    it('shows the newest 50 grants of an account, oldest of them first, with roleHistoryHasMore', async () => {
      await h.ctx.sql.query(
        `INSERT INTO role_grants (id, organization_id, app_user_id, role, granted_at, revoked_at)
         SELECT gen_random_uuid(), $1, $2, 'FINANCE', timestamptz '2025-01-01' + n * interval '1 day',
                timestamptz '2025-01-01' + n * interval '1 day' + interval '1 hour'
           FROM generate_series(1, 80) AS n`,
        [h.seed.organizationId, h.employee.appUserId],
      );

      const { result } = await get(`/api/v1/app-users/${h.employee.appUserId}`, asAdmin());

      const detail = dataOf<{ roleHistory: { grantedAt: string }[]; roleHistoryHasMore: boolean }>(result);
      expect(detail.roleHistory).toHaveLength(50);
      expect(detail.roleHistoryHasMore).toBe(true);
      const times = detail.roleHistory.map((entry) => entry.grantedAt);
      expect(times).toEqual([...times].sort());
      expect(times[times.length - 1]).toBe(
        new Date('2025-01-01T00:00:00Z').toISOString().replace('2025-01-01', '2025-03-22'),
      );
    });

    it('says there is nothing older when the whole history is shown', async () => {
      const { result } = await get(`/api/v1/app-users/${h.finance.appUserId}`, asAdmin());

      expect(dataOf<{ roleHistoryHasMore: boolean }>(result).roleHistoryHasMore).toBe(false);
    });

    it('shows the newest 20 values of an operating parameter with hasMore', async () => {
      await h.ctx.sql.query(
        `INSERT INTO parameter_values (id, organization_id, key, value, valid_from, valid_to)
         SELECT gen_random_uuid(), $1, 'APPROVAL_SLA_WORKING_DAYS', to_jsonb(n), timestamptz '2025-01-01' + n * interval '1 day',
                timestamptz '2025-01-01' + n * interval '1 day' + interval '1 hour'
           FROM generate_series(1, 25) AS n`,
        [h.seed.organizationId],
      );

      const { result } = await get('/api/v1/operating-parameters/APPROVAL_SLA_WORKING_DAYS/history', asAdmin());

      const history = dataOf<{ items: unknown[]; hasMore: boolean }>(result);
      expect(history.items).toHaveLength(20);
      expect(history.hasMore).toBe(true);
    });

    it('shows the newest 50 head periods of a department with headHistoryHasMore', async () => {
      const head = await h.person('LD14HEAD');
      await h.ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
         SELECT gen_random_uuid(), $1, $2, $3, date '2026-02-01' + n * 2, date '2026-02-01' + n * 2 + 1
           FROM generate_series(1, 60) AS n`,
        [h.seed.organizationId, h.seed.departmentId, head],
      );

      const { result } = await get(`/api/v1/departments/${h.seed.departmentId}`);

      const profile = dataOf<{ headHistory: unknown[]; headHistoryHasMore: boolean }>(result);
      expect(profile.headHistory).toHaveLength(50);
      expect(profile.headHistoryHasMore).toBe(true);
    });
  });

  describe('LD-15: the department warnings are a page', () => {
    it('pages the warnings by code then kind, with the total, and refuses a page size over 100', async () => {
      for (const code of ['P-LD15A', 'P-LD15B', 'P-LD15C']) {
        await request(h.server())
          .post('/api/v1/departments')
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({ code, name: code })
          .expect(201);
      }

      const first = dataOf<{
        items: { code: string; warning: string }[];
        pagination: { totalItems: number; pageSize: number };
      }>((await get('/api/v1/department-warnings?pageSize=2&page=1')).result);
      const second = dataOf<{ items: { code: string; warning: string }[] }>(
        (await get('/api/v1/department-warnings?pageSize=2&page=2')).result,
      );

      expect(first.items).toHaveLength(2);
      expect(first.pagination.totalItems).toBeGreaterThanOrEqual(3);
      const keys = [...first.items, ...second.items].map((item) => `${item.code}/${item.warning}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toEqual([...keys].sort());
      await request(h.server()).get('/api/v1/department-warnings?pageSize=101').set(h.as(h.it1)).expect(422);
    });
  });
});
