import {
  changeLastDayRefusal,
  blockNowDayIsTodayRefusal,
  departureEffectiveOn,
  lastWorkingDayOf,
  leavesAtOnce,
  recordRefusal,
  type ChangeLastDayFacts,
  type RecordFacts,
} from '../offboarding.policy';

const NOTE = 'Quyết định nghỉ việc số QD-12/2026';
/** Thursday 12/11/2026, the day of the case in the number tests (SPEC §8, T-MF2). */
const TODAY = '2026-11-12';

const record = (extra: Partial<RecordFacts> = {}): RecordFacts => ({
  today: TODAY,
  hireDate: '2020-01-01',
  placementFrom: '2026-01-05',
  lastWorkingDay: TODAY,
  accessBlockMode: 'BLOCK_NOW',
  employee: { status: 'ACTIVE', workState: 'WORKING' },
  groundsNote: NOTE,
  pendingTransfer: null,
  cancelPendingTransfer: false,
  namedAsSuccessor: false,
  successor: null,
  ...extra,
});

const change = (extra: Partial<ChangeLastDayFacts> = {}): ChangeLastDayFacts => ({
  state: 'HANDING_OVER',
  accessBlockMode: 'WITH_LAST_DAY',
  today: TODAY,
  hireDate: '2020-01-01',
  placementFrom: '2026-01-05',
  currentLastWorkingDay: '2026-11-20',
  newLastWorkingDay: '2026-11-25',
  reason: 'Dời ngày',
  groundsNote: NOTE,
  successor: null,
  ...extra,
});

describe('the last working day of a departure blocked now is the day it is recorded (QĐ-110b, S2)', () => {
  it('is today when none is given, and what was given otherwise, for the planned handover nothing is guessed', () => {
    expect(lastWorkingDayOf('BLOCK_NOW', undefined, TODAY)).toBe(TODAY);
    expect(lastWorkingDayOf('BLOCK_NOW', '  ', TODAY)).toBe(TODAY);
    expect(lastWorkingDayOf('BLOCK_NOW', '2026-11-20', TODAY)).toBe('2026-11-20');
    expect(lastWorkingDayOf('WITH_LAST_DAY', undefined, TODAY)).toBeUndefined();
    expect(lastWorkingDayOf('WITH_LAST_DAY', '2026-11-20', TODAY)).toBe('2026-11-20');
  });

  it('accepts a departure blocked now with no last day, or with today', () => {
    expect(recordRefusal(record({ lastWorkingDay: undefined }))).toBeNull();
    expect(recordRefusal(record({ lastWorkingDay: TODAY }))).toBeNull();
  });

  it.each([
    ['a day in the past', '2026-11-10'],
    ['a day ahead', '2026-11-13'],
    ['a day far ahead', '2026-12-31'],
  ])('refuses a departure blocked now with %s: 422 LAST_WORKING_DAY_INVALID, saying it must be today', (_name, day) => {
    expect(recordRefusal(record({ lastWorkingDay: day }))).toEqual({
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BLOCK_NOW_DAY_IS_TODAY', today: TODAY },
    });
  });

  it('still refuses today for a person who has not come yet, or whose placement begins later', () => {
    expect(recordRefusal(record({ hireDate: '2026-11-13' }))).toMatchObject({
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BEFORE_HIRE_DATE' },
    });
    expect(recordRefusal(record({ placementFrom: '2026-11-13' }))).toMatchObject({
      code: 'LAST_WORKING_DAY_INVALID',
      details: { reason: 'BEFORE_PLACEMENT_START' },
    });
  });

  it('keeps asking a planned handover for its last working day', () => {
    expect(recordRefusal(record({ accessBlockMode: 'WITH_LAST_DAY', lastWorkingDay: undefined }))).toEqual({
      code: 'LAST_WORKING_DAY_REQUIRED',
    });
  });

  it('is left at once: blocked now with today as the last working day', () => {
    expect(leavesAtOnce({ accessBlockMode: 'BLOCK_NOW', lastWorkingDay: TODAY, today: TODAY })).toBe(true);
    expect(leavesAtOnce({ accessBlockMode: 'WITH_LAST_DAY', lastWorkingDay: TODAY, today: TODAY })).toBe(false);
  });
});

describe('the day of a departure blocked now is asked before the person is read', () => {
  it.each([
    ['left out', undefined, null],
    ['blank', '  ', null],
    ['today', TODAY, null],
    ['yesterday', '2026-11-11', 'BLOCK_NOW_DAY_IS_TODAY'],
    ['tomorrow', '2026-11-13', 'BLOCK_NOW_DAY_IS_TODAY'],
  ])('a day %s', (_name, day, reason) => {
    expect(blockNowDayIsTodayRefusal('BLOCK_NOW', day, TODAY)).toEqual(
      reason ? { code: 'LAST_WORKING_DAY_INVALID', details: { reason, today: TODAY } } : null,
    );
  });

  it('asks nothing of a planned handover, whatever its day', () => {
    expect(blockNowDayIsTodayRefusal('WITH_LAST_DAY', '2026-11-30', TODAY)).toBeNull();
    expect(blockNowDayIsTodayRefusal('WITH_LAST_DAY', undefined, TODAY)).toBeNull();
  });
});

describe('the days of the number test T-MF2 (SPEC §8)', () => {
  it('blocks now on Thursday 12/11: last day 12/11, the successor and the end of the placement from Friday 13/11', () => {
    const effectiveOn = departureEffectiveOn({
      lastWorkingDay: lastWorkingDayOf('BLOCK_NOW', undefined, TODAY) as string,
      blockNow: true,
      today: TODAY,
      placementFrom: '2026-01-05',
    });

    expect(effectiveOn).toBe('2026-11-13');
  });

  it('a placement that begins today still ends the day after, never on its first day (US-03-04 AC-18)', () => {
    expect(departureEffectiveOn({ lastWorkingDay: TODAY, blockNow: true, today: TODAY, placementFrom: TODAY })).toBe(
      '2026-11-13',
    );
  });

  it('a planned handover ending on Wednesday 30/09 ends the placement on Thursday 01/10', () => {
    expect(
      departureEffectiveOn({
        lastWorkingDay: '2026-09-30',
        blockNow: false,
        today: '2026-09-20',
        placementFrom: '2026-01-05',
      }),
    ).toBe('2026-10-01');
  });
});

describe('moving the last working day of a departure blocked now (P2, QĐ-110b)', () => {
  it('moves a planned handover', () => {
    expect(changeLastDayRefusal(change())).toBeNull();
  });

  it.each(['HANDING_OVER', 'LEFT'] as const)(
    'refuses with 409 a case blocked now, also one still handing over: its day is the day it was recorded (%s)',
    (state) => {
      expect(changeLastDayRefusal(change({ accessBlockMode: 'BLOCK_NOW', state }))).toEqual({
        code: 'BLOCK_NOW_LAST_DAY_FIXED',
      });
    },
  );

  it('says a cancelled case is not a handover under way before it says anything about the mode', () => {
    expect(changeLastDayRefusal(change({ accessBlockMode: 'BLOCK_NOW', state: 'CANCELLED' }))).toEqual({
      code: 'NOT_HANDING_OVER',
    });
  });
});
