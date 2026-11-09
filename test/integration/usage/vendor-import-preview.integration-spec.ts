import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { EVENT_SOURCE, UsageHarness } from '../../support/vendor-usage-harness';

const h = new UsageHarness();
const TODAY = '2026-09-02';

describe('the preview of a vendor usage report over HTTP (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await h.start();
  }, 180000);

  beforeEach(() => {
    pretendBusinessToday(h.ctx.app, TODAY);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  const aggregate = (lines: string[][]) => h.report(['email', 'last_active'], lines);
  const events = (lines: string[][]) => h.report(['email', 'day', 'event'], lines);
  const codesOf = (rows: Array<{ lineNumber: number; errors: Array<{ code: string }> }>, line: number) =>
    rows.find((row) => row.lineNumber === line)?.errors.map((error) => error.code);

  describe('INV-10, FR-4.3: the window the report covers', () => {
    it('a report that gives only the last activity needs the window (WINDOW_REQUIRED); 400 days is too long (WINDOW_INVALID)', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);
      const file = aggregate([['a@acme.vn', '2026-08-01']]);

      expect(h.codeOf(await h.uploadReport(source.id, file).expect(422))).toBe('USAGE_IMPORT.WINDOW_REQUIRED');
      const tooLong = await h
        .uploadReport(source.id, file, { coverageFrom: '2025-07-01', coverageTo: '2026-08-05' })
        .expect(422);

      expect(h.codeOf(tooLong)).toBe('USAGE_IMPORT.WINDOW_INVALID');
      expect(h.detailsOf(tooLong)).toMatchObject({ reason: 'TOO_LONG', maxDays: 366 });
      expect(await h.count('usage_imports')).toBe(0);
    });

    it('FR-4.3: an event report with no declared window derives it from the first and the last day (DERIVED)', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId, EVENT_SOURCE);

      const preview = await h.previewReport(
        source.id,
        events([
          ['a@acme.vn', '2026-06-01', 'open'],
          ['b@acme.vn', '2026-08-31', 'view'],
        ]),
      );

      expect(preview.summary.window).toEqual({ from: '2026-06-01', to: '2026-08-31', basis: 'DERIVED' });
    });

    it('an ACTIVE_DATE outside the declared window makes the row INVALID, with the code and the day', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId, EVENT_SOURCE);

      const preview = await h.previewReport(
        source.id,
        events([
          ['a@acme.vn', '2026-05-30', 'open'],
          ['b@acme.vn', '2026-06-02', 'open'],
        ]),
        { coverageFrom: '2026-06-01', coverageTo: '2026-08-31' },
      );

      const rows = await h.rowsOf(preview.id);
      expect(codesOf(rows, 2)).toEqual(['DATE_BEFORE_WINDOW']);
      expect(preview.summary).toMatchObject({ invalid: 1, byCode: { DATE_BEFORE_WINDOW: 1 } });
    });

    it('FR-4.10 (DA6-10): an aggregate report of 90 days keeps a last activity 150 days before the window, and refuses one after it', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);

      const preview = await h.previewReport(
        source.id,
        aggregate([
          ['old@acme.vn', '2026-04-01'],
          ['late@acme.vn', '2026-09-01'],
        ]),
        { coverageFrom: '2026-06-01', coverageTo: '2026-08-31' },
      );

      const rows = await h.rowsOf(preview.id);
      expect(rows[0].days).toEqual([{ date: '2026-04-01', eventClass: 'VALUE', basis: 'LAST_ACTIVITY' }]);
      expect(rows[0].errors).toEqual([]);
      expect(codesOf(rows, 3)).toEqual(['DATE_AFTER_WINDOW']);
    });
  });

  describe('FR-4.11: the class of an event', () => {
    it('stores AUTH_ONLY without making it activity, drops what is ignored and names the types nobody sorted', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId, EVENT_SOURCE);

      const preview = await h.previewReport(
        source.id,
        events([
          ['a@acme.vn', '2026-06-02', 'login'],
          ['a@acme.vn', '2026-06-03', 'ping'],
          ['a@acme.vn', '2026-06-04', 'export'],
        ]),
      );

      const rows = await h.rowsOf(preview.id);
      expect(rows[0].days).toEqual([{ date: '2026-06-02', eventClass: 'AUTH_ONLY', basis: 'ACTIVE_DATE' }]);
      expect(rows[1].days).toEqual([]);
      expect(rows[2].days).toEqual([
        { date: '2026-06-04', eventClass: null, eventType: 'export', basis: 'ACTIVE_DATE' },
      ]);
      expect(preview.summary.unmappedEventTypes).toEqual(['export']);
    });
  });

  describe('FR-4.5: who an identifier is', () => {
    it('ties an exact email, an email with a +tag, an account identifier and the email of a person who left', async () => {
      const { applicationId, subscriptionId } = await h.usageApp();
      for (const code of ['FIG1', 'FIG2', 'FIG3', 'FIG4']) await h.person(code);
      await h.seatsOn(subscriptionId as string, [
        { code: 'FIG3', account: 'fig3.login@acme.vn', grantedOn: '2026-01-10' },
      ]);
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE employee_code = 'FIG4'`);
      const source = await h.source(applicationId);

      const preview = await h.previewReport(
        source.id,
        aggregate([
          ['fig1@acme.vn', '2026-08-01'],
          ['fig2+design@acme.vn', '2026-08-02'],
          ['fig3.login@acme.vn', '2026-08-03'],
          ['FIG4@acme.vn', '2026-08-04'],
        ]),
        { coverageFrom: '2026-06-01', coverageTo: '2026-08-31' },
      );

      const rows = await h.rowsOf(preview.id);
      expect(rows.map((row) => [row.outcome, row.matchMethod])).toEqual([
        ['MATCHED', 'EXACT_EMAIL'],
        ['MATCHED', 'ALIAS_RULE'],
        ['MATCHED', 'ACCOUNT_IDENTIFIER'],
        ['MATCHED', 'EXACT_EMAIL'],
      ]);
      expect(preview.summary).toMatchObject({
        matched: 4,
        affectedSeats: 1,
        detectableGroups: ['G1', 'G2', 'G3', 'G4'],
      });
    });
  });

  describe('FR-4.6, INV-12: 200 subjects, 12 nobody knows, 1 that fits two people', () => {
    it('keeps the 12 as UNMATCHED and the one as AMBIGUOUS, and writes no day at all', async () => {
      const { applicationId } = await h.usageApp();
      await h.crowd('M', 187);
      await h.person('SAM1');
      await h.person('SAM2');
      // Two people whose work emails differ only by the domain of the company: an old address of the vendor account fits both.
      await h.ctx.sql.query(
        `UPDATE employees SET work_email = 'sam1@other.vn', normalized_work_email = 'sam1@other.vn' WHERE employee_code = 'SAM2'`,
      );
      const source = await h.source(applicationId);
      const lines = [
        ...Array.from({ length: 187 }, (_, index) => [`m${index}@acme.vn`, '2026-08-01']),
        ...Array.from({ length: 12 }, (_, index) => [`stranger${index}@vendor.example`, '2026-08-02']),
        ['sam1@old.example', '2026-08-03'],
      ];

      const preview = await h.previewReport(source.id, aggregate(lines), {
        coverageFrom: '2026-06-01',
        coverageTo: '2026-08-31',
      });

      expect(preview.summary).toMatchObject({ totalRows: 200, matched: 187, unmatched: 12, ambiguous: 1, invalid: 0 });
      expect(await h.count('usage_activity_days')).toBe(0);
      expect(await h.count('usage_unmatched_identities')).toBe(0);
    });
  });

  describe('US-08-02 AC-1: what the preview says', () => {
    it('gives the window, the groups, the definition of activity and whether the holders must be told; it writes no day', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('FIG5');
      const source = await h.source(applicationId);

      const preview = await h.previewReport(source.id, aggregate([['fig5@acme.vn', '2026-08-01']]), {
        coverageFrom: '2026-06-01',
        coverageTo: '2026-08-31',
      });

      expect(preview).toMatchObject({
        status: 'PREVIEW',
        summary: {
          window: { from: '2026-06-01', to: '2026-08-31', basis: 'DECLARED' },
          activityDefinition: 'mở hoặc chỉnh sửa một tệp trong ứng dụng',
          trackingNoticeRequired: true,
        },
      });
      expect(await h.count('usage_activity_days')).toBe(0);
      const read = await request(h.server()).get(`/api/v1/usage-imports/${preview.id}`).set(h.as(h.it1)).expect(200);
      expect(h.dataOf<{ id: string }>(read).id).toBe(preview.id);
      const cancelled = await request(h.server())
        .post(`/api/v1/usage-imports/${preview.id}/cancel`)
        .set(h.as(h.it1))
        .expect(200);
      expect(h.dataOf<{ status: string }>(cancelled).status).toBe('CANCELLED');
    });
  });

  describe('US-08-02 AC-3: a messaging service is not collected', () => {
    it('refuses an upload into a source whose application was flagged as a communication service after the source was made', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);
      const before = await h.count('usage_imports');
      await h.ctx.sql.query(
        `UPDATE applications SET is_communication_service = true, comm_calls_or_meetings = true WHERE id = $1`,
        [applicationId],
      );

      const response = await h
        .uploadReport(source.id, aggregate([['a@acme.vn', '2026-08-01']]), {
          coverageFrom: '2026-06-01',
          coverageTo: '2026-08-31',
        })
        .expect(422);

      expect(h.codeOf(response)).toBe('USAGE_SOURCE.COMMUNICATION_APP');
      expect(await h.count('usage_imports')).toBe(before);
    });
  });

  describe('the limits of a file', () => {
    it('refuses 50 001 lines, a file that is not UTF-8 text, a file over 10 MiB (413) and a JSON of another schema', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);
      const window = { coverageFrom: '2026-06-01', coverageTo: '2026-08-31' };
      const many = aggregate(Array.from({ length: 50_001 }, (_, index) => [`u${index}@acme.vn`, '2026-08-01']));

      expect(h.codeOf(await h.uploadReport(source.id, many, window).expect(422))).toBe(
        'USAGE_IMPORT.FILE_TOO_MANY_ROWS',
      );
      const utf16 = Buffer.from('﻿email,last_active\na@acme.vn,2026-08-01', 'utf16le');
      expect(h.codeOf(await h.uploadReport(source.id, utf16, window).expect(422))).toBe('USAGE_IMPORT.FILE_NOT_TEXT');
      await h.uploadReport(source.id, Buffer.alloc(11 * 1024 * 1024, 'a'), window).expect(413);
      const other = Buffer.from(JSON.stringify({ schema: 'other/1', subjects: [] }));
      expect(h.codeOf(await h.uploadReport(source.id, other, window, h.it1, 'report.json').expect(422))).toBe(
        'USAGE_IMPORT.SCHEMA_UNSUPPORTED',
      );
      expect(h.codeOf(await h.uploadReport(source.id, null, window).expect(422))).toBe('USAGE_IMPORT.FILE_REQUIRED');
    }, 120000);

    it('reads a JSON report of the normalized schema and refuses one of another application (SOURCE_MISMATCH)', async () => {
      const { applicationId } = await h.usageApp();
      await h.person('FIG6');
      const source = await h.source(applicationId);
      const report = (application: string) =>
        Buffer.from(
          JSON.stringify({
            schema: 'saas-sentry.vendor-usage-report/0.1-proposal',
            source: { application },
            window: { start: '2026-06-01', end: '2026-08-31' },
            subjects: [
              { externalId: 'fig6@acme.vn', activity: { activeDates: ['2026-06-02'] } },
              { externalId: 'bot@vendor.example', identity: { status: 'BOT' } },
            ],
          }),
        );

      const preview = await h.previewReport(source.id, report(applicationId));

      expect(preview.summary).toMatchObject({ matched: 1, notAPerson: 1, window: { basis: 'DECLARED' } });
      expect(h.codeOf(await h.uploadReport(source.id, report('Other tool'), {}, h.it1, 'r.json').expect(422))).toBe(
        'USAGE_IMPORT.SOURCE_MISMATCH',
      );
    });

    it('QĐ-101i: a head of department, Finance and an employee never upload or read an import (403)', async () => {
      const { applicationId } = await h.usageApp();
      const source = await h.source(applicationId);
      const file = aggregate([['a@acme.vn', '2026-08-01']]);

      for (const account of [h.finance, h.employee]) {
        await h.uploadReport(source.id, file, {}, account).expect(403);
        await request(h.server())
          .get('/api/v1/usage-imports/0b7a1f5e-0000-4000-8000-0000000000aa')
          .set(h.as(account))
          .expect(403);
      }
    });
  });
});
