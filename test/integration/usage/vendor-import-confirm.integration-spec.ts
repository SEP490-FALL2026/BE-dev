import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { EVENT_SOURCE, UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
const TODAY = '2026-09-02';
const WINDOW = { coverageFrom: '2026-06-01', coverageTo: '2026-08-31' };

describe('the confirmation of a vendor usage report over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    // A report of 50 000 rows is written in one transaction: the budget of a test is wider than the 10 s of production, which a bulk report may need.
    await h.start({
      env: { DB_TRANSACTION_TIMEOUT_MS: '120000', DB_STATEMENT_TIMEOUT_MS: '60000', DB_QUERY_TIMEOUT_MS: '90000' },
    });
  }, 360000);

  beforeEach(() => {
    pretendBusinessToday(h.ctx.app, TODAY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  }, 120000);

  const aggregate = (lines: string[][]) => h.report(['email', 'last_active'], lines);
  const events = (lines: string[][]) => h.report(['email', 'day', 'event'], lines);

  describe('the preview is confirmed once, as it was', () => {
    it('writes no day at upload; an old version, the same key, another key and a day later behave as the matrix says', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('CNF1');
      const source = await h.source(applicationId);
      const preview = await h.previewReport(source.id, aggregate([['cnf1@acme.vn', '2026-08-01']]), WINDOW);
      expect(await h.days(preview.id)).toEqual([]);

      const stale = await h
        .confirmReport(preview.id, preview.previewVersion + 1, { notice: 'SYSTEM_SENT' })
        .expect(409);
      expect(h.codeOf(stale)).toBe('USAGE_IMPORT.PREVIEW_STALE');
      expect(await h.days(preview.id)).toEqual([]);

      const key = randomUUID();
      const first = await h
        .confirmReport(preview.id, preview.previewVersion, { key, notice: 'SYSTEM_SENT' })
        .expect(200);
      const again = await h
        .confirmReport(preview.id, preview.previewVersion, { key, notice: 'SYSTEM_SENT' })
        .expect(200);

      expect(h.dataOf<{ replayed: boolean }>(first).replayed).toBe(false);
      expect(h.dataOf<{ replayed: boolean }>(again).replayed).toBe(true);
      expect(h.dataOf<{ import: { result: unknown } }>(again).import.result).toEqual(
        h.dataOf<{ import: { result: unknown } }>(first).import.result,
      );
      expect(await h.days(preview.id)).toEqual([
        { normalized_identifier: 'cnf1@acme.vn', activity_date: '2026-08-01', event_class: 'VALUE' },
      ]);
      const other = await h.confirmReport(preview.id, preview.previewVersion, { notice: 'SYSTEM_SENT' }).expect(409);
      expect(h.codeOf(other)).toBe('USAGE_IMPORT.ALREADY_CONFIRMED');

      const late = await h.previewReport(source.id, aggregate([['cnf1@acme.vn', '2026-08-02']]), WINDOW);
      await h.ctx.sql.query(`UPDATE usage_imports SET expires_at = now() - interval '1 minute' WHERE id = $1`, [
        late.id,
      ]);
      const expired = await h.confirmReport(late.id, late.previewVersion).expect(409);
      expect(h.codeOf(expired)).toBe('USAGE_IMPORT.NOT_OPEN');
      const cancelled = await h.previewReport(source.id, aggregate([['cnf1@acme.vn', '2026-08-03']]), WINDOW);
      await request(h.server()).post(`/api/v1/usage-imports/${cancelled.id}/cancel`).set(h.as(h.it1)).expect(200);
      expect(h.codeOf(await h.confirmReport(cancelled.id, cancelled.previewVersion).expect(409))).toBe(
        'USAGE_IMPORT.NOT_OPEN',
      );
    });

    it('refuses a confirmation with no Idempotency-Key (422) and a head of department (403)', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);
      const preview = await h.previewReport(source.id, aggregate([['a@acme.vn', '2026-08-01']]), WINDOW);

      await request(h.server())
        .post(`/api/v1/usage-imports/${preview.id}/confirm`)
        .set(h.as(h.it1))
        .send({ previewVersion: 1, notice: 'SYSTEM_SENT' })
        .expect(422);
      await h.confirmReport(preview.id, 1, { notice: 'SYSTEM_SENT' }, h.finance).expect(403);
    });

    it('FR-4.11: a type of event nobody sorted is refused with its name, and nothing is written', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('CNF2');
      const source = await h.source(applicationId, EVENT_SOURCE);
      const preview = await h.previewReport(
        source.id,
        events([
          ['cnf2@acme.vn', '2026-06-02', 'login'],
          ['cnf2@acme.vn', '2026-06-03', 'export'],
        ]),
      );

      const refused = await h.confirmReport(preview.id, 1, { notice: 'SYSTEM_SENT' }).expect(422);

      expect(h.codeOf(refused)).toBe('USAGE_IMPORT.EVENT_TYPE_UNMAPPED');
      expect(h.detailsOf(refused)).toEqual({ eventTypes: ['export'] });
      expect(await h.days(preview.id)).toEqual([]);
    });

    it('FR-4.11: AUTH_ONLY is written but is not activity; the person appears', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('CNF3');
      const source = await h.source(applicationId, EVENT_SOURCE);

      const { preview } = await h.confirmed(source.id, events([['cnf3@acme.vn', '2026-06-02', 'login']]));

      expect(await h.days(preview.id)).toEqual([
        { normalized_identifier: 'cnf3@acme.vn', activity_date: '2026-06-02', event_class: 'AUTH_ONLY' },
      ]);
    });
  });

  describe('US-08-05: the holders are told before the usage is written', () => {
    it('AC-1: the first report needs the notice (422); AC-2 SYSTEM_SENT tells 70 holders with every parameter, before the days exist', async () => {
      const { applicationId, subscriptionId } = await h.usageApp();
      await h.crowd('H', 70);
      await h.written(
        { subscriptionId: subscriptionId as string },
        Array.from({ length: 70 }, (_, index) => ({
          employee_code: `H${index}`,
          account_identifier: `h${index}@acme.vn`,
          granted_on: '2026-01-10',
        })),
      );
      const source = await h.source(applicationId);
      const preview = await h.previewReport(
        source.id,
        aggregate(Array.from({ length: 70 }, (_, index) => [`h${index}@acme.vn`, '2026-08-01'])),
        WINDOW,
      );
      expect(preview.summary).toMatchObject({ trackingNoticeRequired: true, matched: 70, affectedSeats: 70 });

      const missing = await h.confirmReport(preview.id, 1).expect(422);
      expect(h.codeOf(missing)).toBe('USAGE_IMPORT.TRACKING_NOTICE_REQUIRED');
      expect(await h.days(preview.id)).toEqual([]);

      const confirmed = await h.confirmReport(preview.id, 1, { notice: 'SYSTEM_SENT' }).expect(200);

      expect(
        h.dataOf<{ import: { result: { noticesSent: number; daysWritten: number } } }>(confirmed).import.result,
      ).toMatchObject({
        noticesSent: 70,
        daysWritten: 70,
      });
      const { rows } = await h.ctx.sql.query<{ n: number; first_day: Date; notice_at: Date }>(
        `SELECT (SELECT count(*)::int FROM in_app_notifications WHERE code = 'USAGE_TRACKING_NOTICE' AND subject_id = $2) AS n,
                (SELECT min(created_at) FROM usage_activity_days WHERE import_id = $1) AS first_day,
                (SELECT notice_at FROM usage_imports WHERE id = $1) AS notice_at`,
        [preview.id, applicationId],
      );
      expect(rows[0].n).toBe(70);
      expect(rows[0].notice_at.getTime()).toBeLessThanOrEqual(rows[0].first_day.getTime());
      const [notice] = await h.trackingNoticesOf(
        (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = 'H0'`)).rows[0].id,
      );
      expect(Object.keys(notice.params).sort()).toEqual(
        ['activityDefinition', 'applicationId', 'dataKinds', 'purpose', 'retentionMonths', 'viewPath'].sort(),
      );
      expect(notice.params).toMatchObject({
        activityDefinition: 'mở hoặc chỉnh sửa một tệp trong ứng dụng',
        retentionMonths: 6,
      });
    }, 120000);

    it('AC-3: CONFIRMED_DELIVERED is enough for the first report and the holders are still told once', async () => {
      const { applicationId, subscriptionId } = await h.usageApp();
      await h.seatsOn(subscriptionId as string, [{ code: 'CNF4', grantedOn: '2026-01-10' }]);
      const source = await h.source(applicationId);
      const preview = await h.previewReport(source.id, aggregate([['cnf4@acme.vn', '2026-08-01']]), WINDOW);

      const response = await h.confirmReport(preview.id, 1, { notice: 'CONFIRMED_DELIVERED' }).expect(200);

      expect(h.dataOf<{ import: { noticeMode: string } }>(response).import.noticeMode).toBe('CONFIRMED_DELIVERED');
      expect(await h.trackingNoticesOf(await h.person('CNF4'))).toHaveLength(1);
    });

    it('AC-4 (DA6-08): a person given a seat after the first report is told by the next one, before their days; the others are not told again', async () => {
      const { applicationId, subscriptionId } = await h.usageApp();
      await h.seatsOn(subscriptionId as string, [{ code: 'OLD1', grantedOn: '2026-01-10' }]);
      const source = await h.source(applicationId);
      await h.confirmed(source.id, aggregate([['old1@acme.vn', '2026-08-01']]), WINDOW);
      expect(await h.trackingNoticesOf(await h.person('OLD1'))).toHaveLength(1);
      await h.seatsOn(subscriptionId as string, [{ code: 'E9', grantedOn: '2026-08-15' }]);
      expect(await h.trackingNoticesOf(await h.person('E9'))).toHaveLength(0);

      const second = await h.previewReport(source.id, aggregate([['e9@acme.vn', '2026-08-20']]), {
        coverageFrom: '2026-09-01',
        coverageTo: '2026-09-02',
      });
      expect(second.summary.trackingNoticeRequired).toBe(false);
      const response = await h.confirmReport(second.id, 1).expect(200);

      expect(h.dataOf<{ import: { result: { noticesSent: number } } }>(response).import.result.noticesSent).toBe(1);
      const e9 = await h.trackingNoticesOf(await h.person('E9'));
      expect(e9).toHaveLength(1);
      const { rows } = await h.ctx.sql.query<{ before: boolean }>(
        `SELECT (SELECT notice_at FROM usage_imports WHERE id = $1) <= (SELECT min(created_at) FROM usage_activity_days WHERE import_id = $1) AS before`,
        [second.id],
      );
      expect(rows[0].before).toBe(true);
      expect(await h.trackingNoticesOf(await h.person('OLD1'))).toHaveLength(1);
    });
  });

  describe('US-08-07 AC-3: two reports of one source share their days', () => {
    it('the days of the first report that the second covers are given up to the second, the others stay', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('OVL1');
      const source = await h.source(applicationId, EVENT_SOURCE);
      const first = await h.confirmed(
        source.id,
        events([
          ['ovl1@acme.vn', '2026-06-10', 'open'],
          ['ovl1@acme.vn', '2026-07-20', 'open'],
        ]),
        { coverageFrom: '2026-06-01', coverageTo: '2026-07-31' },
      );

      const second = await h.confirmed(source.id, events([['ovl1@acme.vn', '2026-08-02', 'view']]), {
        coverageFrom: '2026-07-15',
        coverageTo: '2026-08-31',
      });

      const { rows } = await h.ctx.sql.query<{ activity_date: string; superseded_by_import_id: string | null }>(
        `SELECT to_char(activity_date, 'YYYY-MM-DD') AS activity_date, superseded_by_import_id FROM usage_activity_days
          WHERE import_id = $1 ORDER BY activity_date`,
        [first.import.id],
      );
      expect(rows).toEqual([
        { activity_date: '2026-06-10', superseded_by_import_id: null },
        { activity_date: '2026-07-20', superseded_by_import_id: second.import.id },
      ]);
      expect(second.import.result).toMatchObject({ daysSuperseded: 1 });
    });

    it('DA6-12: two confirmations of two overlapping reports at once leave the days of the overlap with the one that covers later', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('RACE1');
      const source = await h.source(applicationId, EVENT_SOURCE);
      await h.confirmed(source.id, events([['race1@acme.vn', '2026-06-02', 'open']]), WINDOW);
      const early = await h.previewReport(source.id, events([['race1@acme.vn', '2026-07-20', 'open']]), {
        coverageFrom: '2026-07-01',
        coverageTo: '2026-07-31',
      });
      const late = await h.previewReport(source.id, events([['race1@acme.vn', '2026-07-22', 'view']]), {
        coverageFrom: '2026-07-10',
        coverageTo: '2026-08-31',
      });

      const [a, b] = await Promise.all([h.confirmReport(early.id, 1), h.confirmReport(late.id, 1)]);

      expect([a.status, b.status]).toEqual([200, 200]);
      const { rows } = await h.ctx.sql.query<{ import_id: string; n: number }>(
        `SELECT import_id, count(*)::int AS n FROM usage_activity_days
          WHERE source_id = $1 AND activity_date BETWEEN '2026-07-10' AND '2026-07-31' AND superseded_by_import_id IS NULL GROUP BY import_id`,
        [source.id],
      );
      expect(rows).toEqual([{ import_id: late.id, n: 1 }]);
    });

    it('two confirmations of the same import at once write once: one of them answers the result, the other is refused with another key', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('RACE2');
      const source = await h.source(applicationId);
      const preview = await h.previewReport(source.id, aggregate([['race2@acme.vn', '2026-08-01']]), WINDOW);
      const key = randomUUID();

      const [a, b, c] = await Promise.all([
        h.confirmReport(preview.id, 1, { key, notice: 'SYSTEM_SENT' }),
        h.confirmReport(preview.id, 1, { key, notice: 'SYSTEM_SENT' }),
        h.confirmReport(preview.id, 1, { notice: 'SYSTEM_SENT' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 200]);
      expect(c.status).toBe(409);
      expect(await h.days(preview.id)).toHaveLength(1);
    });
  });

  describe('FR-4.8 (Q-84): activity with no seat is a finding, never a seat', () => {
    it('opens a finding for a person active with no seat, makes no seat, and closes it when a later report finds a seat that covers the day', async () => {
      const { applicationId, subscriptionId } = await h.usageApp();
      await h.person('E9X');
      const source = await h.source(applicationId);
      const seatsBefore = await h.count('license_assignments');

      const first = await h.confirmed(source.id, aggregate([['e9x@acme.vn', '2026-08-10']]), WINDOW);

      expect(first.import.result).toMatchObject({ findingsOpened: 1 });
      const open = h.dataOf<{ items: Array<{ employeeCode: string; firstActivityDate: string }> }>(
        await request(h.server())
          .get('/api/v1/usage-no-assignment-findings')
          .query({ applicationId })
          .set(h.as(h.it1))
          .expect(200),
      );
      expect(open.items).toMatchObject([{ employeeCode: 'E9X', firstActivityDate: '2026-08-10' }]);
      expect(await h.count('license_assignments')).toBe(seatsBefore);

      await h.seatsOn(subscriptionId as string, [{ code: 'E9X', grantedOn: '2026-08-01' }]);
      const second = await h.confirmed(source.id, aggregate([['e9x@acme.vn', '2026-08-10']]), {
        coverageFrom: '2026-09-01',
        coverageTo: '2026-09-02',
      });

      expect(second.import.result).toMatchObject({ findingsClosed: 1 });
      const closed = h.dataOf<{ items: unknown[] }>(
        await request(h.server())
          .get('/api/v1/usage-no-assignment-findings')
          .query({ applicationId })
          .set(h.as(h.it1))
          .expect(200),
      );
      expect(closed.items).toEqual([]);
    });

    it('the IT Admin dashboard counts the open findings as its discrepancies', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('DSH1');
      await h.person('DSH2');
      const source = await h.source(applicationId);
      await h.confirmed(
        source.id,
        aggregate([
          ['dsh1@acme.vn', '2026-08-10'],
          ['dsh2@acme.vn', '2026-08-11'],
        ]),
        WINDOW,
      );
      const open = await h.count('usage_no_assignment_findings');

      const overview = h.dataOf<{
        sections: { discrepancies: { state: string; count: number; sourceOperationId: string } };
      }>(await request(h.server()).get('/api/v1/dashboards/it-admin').set(h.as(h.it1)).expect(200));

      expect(overview.sections.discrepancies).toMatchObject({
        state: 'COUNTED',
        sourceOperationId: 'usageNoAssignmentFindingList',
      });
      expect(overview.sections.discrepancies.count).toBe(open - (await closedFindings()));
    });
  });

  describe('performance', () => {
    it('writes 50 000 rows in chunks within the time of a test', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);
      const lines = Array.from({ length: 50_000 }, (_, index) => [`bulk${index}@vendor.example`, '2026-08-01']);
      const preview = await h.previewReport(source.id, aggregate(lines), WINDOW);

      const confirmed = await h.confirmReport(preview.id, 1, { notice: 'SYSTEM_SENT' }).expect(200);

      expect(
        h.dataOf<{ import: { result: { daysWritten: number; unmatched: number } } }>(confirmed).import.result,
      ).toMatchObject({
        daysWritten: 50_000,
        unmatched: 50_000,
      });
      expect(await h.count('usage_unmatched_identities')).toBeGreaterThanOrEqual(50_000);
    }, 280000);
  });

  const closedFindings = async (): Promise<number> =>
    (
      await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM usage_no_assignment_findings WHERE status = 'CLOSED'`,
      )
    ).rows[0].n;
});
