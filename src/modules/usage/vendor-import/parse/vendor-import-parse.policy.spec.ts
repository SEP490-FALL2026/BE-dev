import { UsageImportFileError } from '../vendor-import.errors';
import { REPORT_SCHEMA } from '../vendor-import.types';
import { resolveWindow, judgeDayInWindow, daysBetween } from './coverage-window.policy';
import { parseReport } from './vendor-import-parse.policy';
import type { ReadingSource } from './vendor-import-parse.types';

const TODAY = '2026-09-02';

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
const members: ReadingSource = {
  identifierType: 'EMAIL',
  reportShape: 'AGGREGATE',
  template: { columns: { identifier: 'email' }, eventClasses: {} },
  capabilities: { memberList: true, lastActivity: false, eventDetail: false, maxHistoryDays: null },
};

/** What a report that cannot be read throws: the problem and its details. */
function thrown(run: () => unknown): { problem: string; details: Record<string, unknown> } {
  try {
    run();
  } catch (error) {
    if (error instanceof UsageImportFileError) return { problem: error.problem, details: error.details };
    throw error;
  }
  throw new Error('The report was read');
}
const csv = (...lines: string[]) => lines.join('\n');
const codes = (rows: { errors: { code: string }[] }[]) => rows.map((row) => row.errors.map((error) => error.code));

describe('INV-10, FR-4.3: the window a report covers', () => {
  it('a declared window is DECLARED; one that is not declared is derived from the first and the last day of an event report (DERIVED)', () => {
    const declared = parseReport({
      format: 'CSV',
      text: csv('email,day,event', 'a@x.com,2026-06-05,open'),
      source: events,
      declared: { from: '2026-06-01', to: '2026-08-31' },
      today: TODAY,
    });
    const derived = parseReport({
      format: 'CSV',
      text: csv('email,day,event', 'a@x.com,2026-06-01,open', 'b@x.com,2026-08-31,view'),
      source: events,
      declared: {},
      today: TODAY,
    });

    expect(declared.window).toEqual({ from: '2026-06-01', to: '2026-08-31', basis: 'DECLARED' });
    expect(derived.window).toEqual({ from: '2026-06-01', to: '2026-08-31', basis: 'DERIVED' });
  });

  it('WINDOW_REQUIRED: a report of last activity dates alone says nothing of what it covers', () => {
    expect(
      thrown(() =>
        parseReport({
          format: 'CSV',
          text: csv('email,last_active', 'a@x.com,2026-08-01'),
          source: aggregate,
          declared: {},
          today: TODAY,
        }),
      ),
    ).toMatchObject({ problem: 'WINDOW_REQUIRED' });
  });

  it.each([
    ['400 days', { from: '2025-07-01', to: '2026-08-05' }, 'TOO_LONG'],
    ['one end only', { from: '2026-06-01' }, 'INCOMPLETE'],
    ['from after to', { from: '2026-08-01', to: '2026-07-01' }, 'ORDER'],
    ['the future', { from: '2026-08-01', to: '2026-12-01' }, 'IN_THE_FUTURE'],
    ['a day that is no day', { from: '2026-02-31', to: '2026-03-01' }, 'NOT_A_DATE'],
  ])('WINDOW_INVALID: %s', (_label, declared, reason) => {
    expect(
      thrown(() =>
        parseReport({
          format: 'CSV',
          text: csv('email,last_active', 'a@x.com,2026-08-01'),
          source: aggregate,
          declared,
          today: TODAY,
        }),
      ),
    ).toMatchObject({ problem: 'WINDOW_INVALID', details: { reason } });
  });

  it('warns when the window is longer than the history the vendor keeps', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,last_active', 'a@x.com,2026-08-01'),
      source: aggregate,
      declared: { from: '2026-06-01', to: '2026-08-31' },
      today: TODAY,
    });

    expect(parsed.warnings).toEqual(['WINDOW_EXCEEDS_HISTORY_CAP']);
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2026-01-01', '2027-01-02')).toBe(366);
    expect(
      resolveWindow({ declared: { from: '2026-06-01', to: '2026-06-01' }, rows: [], today: TODAY, maxHistoryDays: 1 })
        .warnings,
    ).toEqual([]);
  });
});

describe('FR-4.10 (DA6-10): a day against the window', () => {
  const window = { from: '2026-06-01', to: '2026-08-31', basis: 'DECLARED' as const };

  it('a day after the window is wrong; one before it is wrong unless it is the last activity of a person', () => {
    expect(judgeDayInWindow({ date: '2026-09-01', basis: 'ACTIVE_DATE' }, window)).toBe('DATE_AFTER_WINDOW');
    expect(judgeDayInWindow({ date: '2026-09-01', basis: 'LAST_ACTIVITY' }, window)).toBe('DATE_AFTER_WINDOW');
    expect(judgeDayInWindow({ date: '2026-05-31', basis: 'ACTIVE_DATE' }, window)).toBe('DATE_BEFORE_WINDOW');
    expect(judgeDayInWindow({ date: '2026-01-02', basis: 'LAST_ACTIVITY' }, window)).toBeNull();
  });

  it('an aggregate report of 90 days keeps a last activity 150 days before and refuses one after the window', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,last_active', 'old@x.com,2026-04-01', 'late@x.com,2026-09-01'),
      source: aggregate,
      declared: { from: '2026-06-01', to: '2026-08-31' },
      today: TODAY,
    });

    expect(parsed.rows[0].days).toEqual([{ date: '2026-04-01', eventClass: 'VALUE', basis: 'LAST_ACTIVITY' }]);
    expect(codes(parsed.rows)).toEqual([[], ['DATE_AFTER_WINDOW']]);
  });

  it('a day of ACTIVE_DATE outside the window makes the row INVALID', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,day,event', 'a@x.com,2026-05-30,open', 'b@x.com,2026-06-02,open'),
      source: events,
      declared: { from: '2026-06-01', to: '2026-08-31' },
      today: TODAY,
    });

    expect(codes(parsed.rows)).toEqual([['DATE_BEFORE_WINDOW'], []]);
  });
});

describe('FR-4.11: the class of an event', () => {
  it('AUTH_ONLY is kept as a class, IGNORED is dropped, and a type with no class is kept unsorted and named', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('email,day,event', 'a@x.com,2026-06-02,login', 'a@x.com,2026-06-03,ping', 'a@x.com,2026-06-04,export'),
      source: events,
      declared: {},
      today: TODAY,
    });

    expect(parsed.rows.map((row) => row.days)).toEqual([
      [{ date: '2026-06-02', eventClass: 'AUTH_ONLY', basis: 'ACTIVE_DATE' }],
      [],
      [{ date: '2026-06-04', eventClass: null, eventType: 'export', basis: 'ACTIVE_DATE' }],
    ]);
    expect(parsed.unmappedEventTypes).toEqual(['export']);
  });
});

describe('the rows of a report', () => {
  it('a member listed with no date is one appearance on the last day of the window, never activity', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv('Email', 'A@X.com'),
      source: members,
      declared: { from: '2026-06-01', to: '2026-08-31' },
      today: TODAY,
    });

    expect(parsed.rows[0]).toMatchObject({
      identifierRaw: 'A@X.com',
      identifierNormalized: 'a@x.com',
      days: [{ date: '2026-08-31', eventClass: 'AUTH_ONLY', basis: 'ACTIVE_DATE' }],
    });
  });

  it('refuses an empty identifier, a secret (masked, never shown) and a repeated one, row by row', () => {
    const parsed = parseReport({
      format: 'CSV',
      text: csv(
        'email,last_active',
        ',2026-08-01',
        'ghp_abcdefghijklmnopqrstuvwxyz0123456789,2026-08-01',
        'a@x.com,2026-08-01',
        'A@x.com,2026-08-02',
      ),
      source: aggregate,
      declared: { from: '2026-06-01', to: '2026-08-31' },
      today: TODAY,
    });

    expect(codes(parsed.rows)).toEqual([
      ['IDENTIFIER_EMPTY'],
      ['IDENTIFIER_LOOKS_LIKE_SECRET'],
      [],
      ['IDENTIFIER_DUPLICATE'],
    ]);
    expect(parsed.rows[1].identifierRaw).toBe('***');
    expect(JSON.stringify(parsed.rows[1])).not.toContain('ghp_');
  });

  it('refuses a file that lacks a column the template names, and one that has too many rows', () => {
    expect(
      thrown(() =>
        parseReport({
          format: 'CSV',
          text: csv('mail,last_active', 'a@x.com,2026-08-01'),
          source: aggregate,
          declared: {},
          today: TODAY,
        }),
      ),
    ).toMatchObject({ problem: 'FILE_MISSING_COLUMNS', details: { missing: ['email'] } });
    const many = csv('email,last_active', ...Array.from({ length: 50_001 }, (_, i) => `u${i}@x.com,2026-08-01`));

    expect(
      thrown(() =>
        parseReport({
          format: 'CSV',
          text: many,
          source: aggregate,
          declared: { from: '2026-06-01', to: '2026-08-31' },
          today: TODAY,
        }),
      ),
    ).toMatchObject({ problem: 'FILE_TOO_MANY_ROWS' });
  });
});

describe('the JSON report of the normalized schema', () => {
  const report = (extra: object = {}) =>
    JSON.stringify({
      schema: REPORT_SCHEMA,
      source: { application: 'Figma' },
      window: { start: '2026-06-01', end: '2026-08-31' },
      subjects: [
        { externalId: 'A@x.com', activity: { activeDates: ['2026-06-02', '2026-06-03'] } },
        { externalId: 'bot@x.com', identity: { status: 'BOT' } },
      ],
      ...extra,
    });

  it('reads the window of the file, the active dates, and a subject that is a bot as not a person', () => {
    const parsed = parseReport({ format: 'JSON', text: report(), source: aggregate, declared: {}, today: TODAY });

    expect(parsed.application).toBe('Figma');
    expect(parsed.window).toEqual({ from: '2026-06-01', to: '2026-08-31', basis: 'DECLARED' });
    expect(parsed.rows[0].days).toHaveLength(2);
    expect(parsed.rows[1]).toMatchObject({ notAPerson: true, days: [] });
  });

  it('SCHEMA_UNSUPPORTED for another schema, REPORT_INVALID (the path only) for a key it does not know', () => {
    expect(
      thrown(() =>
        parseReport({
          format: 'JSON',
          text: report({ schema: 'other/1' }),
          source: aggregate,
          declared: {},
          today: TODAY,
        }),
      ),
    ).toMatchObject({ problem: 'SCHEMA_UNSUPPORTED' });
    try {
      parseReport({ format: 'JSON', text: report({ surprise: 1 }), source: aggregate, declared: {}, today: TODAY });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(UsageImportFileError);
      expect((error as UsageImportFileError).problem).toBe('REPORT_INVALID');
      expect(JSON.stringify((error as UsageImportFileError).details)).not.toContain('Figma');
    }
  });
});
