import type { StoredRow } from '../vendor-import.types';
import {
  daysToWrite,
  mappingToWrite,
  planOverlaps,
  rangeCovered,
  trackingNoticeIsMissing,
  uncoveredActivity,
  unmappedEventTypesOf,
} from './vendor-import-confirmation.policy';

const row = (overrides: Partial<StoredRow>): StoredRow => ({
  lineNumber: 1,
  identifierRaw: 'a@x.com',
  identifierNormalized: 'a@x.com',
  cells: { days: [{ date: '2026-06-02', eventClass: 'VALUE', basis: 'ACTIVE_DATE' }] },
  outcome: 'MATCHED',
  employeeId: 'E1',
  matchMethod: 'EXACT_EMAIL',
  errors: [],
  ...overrides,
});

describe('US-08-07 AC-3: planOverlaps', () => {
  it('the report that covers later wins the days both cover; a tie goes to the one confirmed after', () => {
    const current = { id: 'B', from: '2026-07-15', to: '2026-08-31' };

    expect(planOverlaps(current, [{ id: 'A', from: '2026-06-01', to: '2026-07-31' }])).toEqual([
      { otherImportId: 'A', from: '2026-07-15', to: '2026-07-31', winner: 'CURRENT' },
    ]);
    expect(
      planOverlaps({ ...current, to: '2026-07-31' }, [{ id: 'A', from: '2026-06-01', to: '2026-07-31' }])[0].winner,
    ).toBe('CURRENT');
    expect(
      planOverlaps({ ...current, to: '2026-07-20' }, [{ id: 'A', from: '2026-06-01', to: '2026-07-31' }])[0],
    ).toMatchObject({
      winner: 'OTHER',
      from: '2026-07-15',
      to: '2026-07-20',
    });
  });
});

describe('US-08-05 AC-1: the first report needs the holders to be told', () => {
  it('is missing the notice only for the first report of an application and only when none is given', () => {
    expect(trackingNoticeIsMissing(true, undefined)).toBe(true);
    expect(trackingNoticeIsMissing(true, 'SYSTEM_SENT')).toBe(false);
    expect(trackingNoticeIsMissing(true, 'CONFIRMED_DELIVERED')).toBe(false);
    expect(trackingNoticeIsMissing(false, undefined)).toBe(false);
  });
});

describe('FR-4.11: what a confirmation writes', () => {
  it('names the types of event nobody sorted, in the rows that would be written only', () => {
    const unsorted = { date: '2026-06-02', eventClass: null, eventType: 'export', basis: 'ACTIVE_DATE' as const };

    expect(
      unmappedEventTypesOf([
        row({ cells: { days: [unsorted] } }),
        row({ cells: { days: [{ ...unsorted, eventType: 'zip' }] }, outcome: 'INVALID' }),
      ]),
    ).toEqual(['export']);
  });

  it('writes each day once, for matched rows and for rows nobody is tied to yet, and never for a wrong row or a bot', () => {
    const days = daysToWrite([
      row({}),
      row({ lineNumber: 2 }),
      row({
        lineNumber: 3,
        identifierNormalized: 'b@x.com',
        outcome: 'UNMATCHED',
        employeeId: null,
        matchMethod: null,
      }),
      row({ lineNumber: 4, identifierNormalized: 'c@x.com', outcome: 'INVALID' }),
      row({ lineNumber: 5, identifierNormalized: 'd@x.com', outcome: 'NOT_A_PERSON' }),
    ]);

    expect(days.map((day) => day.identifierNormalized)).toEqual(['a@x.com', 'b@x.com']);
  });
});

describe('FR-4.5: the mapping a match writes', () => {
  it('writes a mapping for a new match, never for a mapping in force or one made by hand', () => {
    expect(mappingToWrite(row({}), new Map())).toBe('EXACT_EMAIL');
    expect(mappingToWrite(row({ matchMethod: 'ALIAS_RULE' }), new Map())).toBe('ALIAS_RULE');
    expect(mappingToWrite(row({}), new Map([['a@x.com', 'EXACT_EMAIL']]))).toBeNull();
    expect(mappingToWrite(row({ matchMethod: 'MANUAL' }), new Map())).toBeNull();
    expect(mappingToWrite(row({ outcome: 'UNMATCHED', employeeId: null, matchMethod: null }), new Map())).toBeNull();
  });
});

describe('FR-4.8 (Q-84): activity of a person with no seat', () => {
  it('finds the days no seat covers, and none when a seat covers them all', () => {
    expect(uncoveredActivity(['2026-08-10', '2026-08-12'], [])).toEqual({ first: '2026-08-10', last: '2026-08-12' });
    expect(uncoveredActivity(['2026-08-10', '2026-08-12'], [{ from: '2026-08-11', until: null }])).toEqual({
      first: '2026-08-10',
      last: '2026-08-10',
    });
    expect(uncoveredActivity(['2026-08-10'], [{ from: '2026-08-01', until: '2026-08-11' }])).toBeNull();
    expect(uncoveredActivity(['2026-08-11'], [{ from: '2026-08-01', until: '2026-08-11' }])).not.toBeNull();
  });

  it('a chain of renewals covers the days across its links', () => {
    const chain = [
      { from: '2026-06-01', until: '2026-07-01' },
      { from: '2026-07-01', until: null },
    ];

    expect(uncoveredActivity(['2026-06-30', '2026-07-01'], chain)).toBeNull();
  });
});

describe('rangeCovered — M5-27 (FR-4.8, TC-2): a finding closes only when a seat covers its own days', () => {
  it('is true when one seat, or seats end to end, cover every day from first to last', () => {
    expect(rangeCovered({ first: '2026-08-10', last: '2026-08-20' }, [{ from: '2026-08-01', until: null }])).toBe(true);
    expect(
      rangeCovered({ first: '2026-08-10', last: '2026-09-10' }, [
        { from: '2026-08-01', until: '2026-09-01' },
        { from: '2026-09-01', until: null },
      ]),
    ).toBe(true);
  });

  it('is false when the seat begins after the first day of the finding, or leaves a gap', () => {
    expect(rangeCovered({ first: '2026-06-10', last: '2026-08-20' }, [{ from: '2026-08-01', until: null }])).toBe(
      false,
    );
    expect(
      rangeCovered({ first: '2026-08-10', last: '2026-09-10' }, [
        { from: '2026-08-01', until: '2026-08-20' },
        { from: '2026-09-01', until: null },
      ]),
    ).toBe(false);
  });
});
