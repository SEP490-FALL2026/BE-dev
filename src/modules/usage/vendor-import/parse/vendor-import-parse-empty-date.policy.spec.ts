import { REPORT_SCHEMA } from '../vendor-import.types';
import { parseReport } from './vendor-import-parse.policy';
import type { ReadingSource } from './vendor-import-parse.types';

const TODAY = '2026-09-02';
const WINDOW = { from: '2026-06-01', to: '2026-08-31' };

const aggregate: ReadingSource = {
  identifierType: 'EMAIL',
  reportShape: 'AGGREGATE',
  template: { columns: { identifier: 'email', lastActivityDate: 'last_active' }, eventClasses: {} },
  capabilities: { memberList: true, lastActivity: true, eventDetail: false, maxHistoryDays: 90 },
};
const events: ReadingSource = {
  identifierType: 'EMAIL',
  reportShape: 'EVENT',
  template: {
    columns: { identifier: 'email', date: 'day', eventType: 'event' },
    eventClasses: { open: 'VALUE', view: 'PASSIVE', login: 'AUTH_ONLY', ping: 'IGNORED' },
  },
  capabilities: { memberList: true, lastActivity: true, eventDetail: true, maxHistoryDays: null },
};

const csv = (...lines: string[]) => lines.join('\n');
const codes = (rows: { errors: { code: string }[] }[]) => rows.map((row) => row.errors.map((error) => error.code));

describe('FR-4.10, FR-4.11: a person named in a report with no date', () => {
  it('a person of an aggregate report that tells the last activity, with the date left empty, never was active: no day is kept', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,last_active', 'a@x.com,', 'b@x.com,2026-08-01'),
      source: aggregate,
      declared: WINDOW,
      today: TODAY,
    });

    expect(codes(parsed.rows)).toEqual([[], []]);
    expect(parsed.rows[0]).toMatchObject({ identifierNormalized: 'a@x.com', days: [] });
    expect(parsed.rows[1].days).toEqual([{ date: '2026-08-01', eventClass: 'VALUE', basis: 'LAST_ACTIVITY' }]);
  });

  it('a subject of a JSON report with no last activity date, or with no activity at all, never was active in such a source', () => {
    const parsed = parseReport({
      format: 'JSON',
      text: JSON.stringify({
        schema: REPORT_SCHEMA,
        source: { application: 'Figma' },
        window: { start: WINDOW.from, end: WINDOW.to },
        subjects: [
          { externalId: 'a@x.com', activity: { lastActivityDate: null } },
          { externalId: 'b@x.com' },
          { externalId: 'c@x.com', activity: { lastActivityDate: '2026-08-01' } },
        ],
      }),
      source: aggregate,
      declared: {},
      today: TODAY,
    });

    expect(codes(parsed.rows)).toEqual([[], [], []]);
    expect(parsed.rows.map((row) => row.days)).toEqual([
      [],
      [],
      [{ date: '2026-08-01', eventClass: 'VALUE', basis: 'LAST_ACTIVITY' }],
    ]);
  });

  it('a person of an event log that names no day is still one appearance on the last day of the window', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,day,event', 'a@x.com,,'),
      source: events,
      declared: WINDOW,
      today: TODAY,
    });

    expect(codes(parsed.rows)).toEqual([[]]);
    expect(parsed.rows[0].days).toEqual([{ date: '2026-08-31', eventClass: 'AUTH_ONLY', basis: 'ACTIVE_DATE' }]);
  });

  it('DATE_INVALID: a cell that is no date, like Never, still makes the row INVALID with no day kept', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,last_active', 'a@x.com,Never'),
      source: aggregate,
      declared: WINDOW,
      today: TODAY,
    });

    expect(codes(parsed.rows)).toEqual([['DATE_INVALID']]);
    expect(parsed.rows[0].days).toEqual([]);
  });
});
