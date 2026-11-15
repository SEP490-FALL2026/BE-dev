import { dataStatusOf, periodsOf, resolveRange } from './usage-overview.policy';

describe('resolveRange', () => {
  const today = '2026-11-15';

  it('ends today and looks back thirty days when nothing is asked for', () => {
    expect(resolveRange({ today })).toEqual({
      ok: true,
      range: { from: '2026-10-17', to: '2026-11-15', effectiveTo: '2026-11-15' },
    });
  });

  it('takes the day a range is asked for from either side, thirty days apart', () => {
    expect(resolveRange({ today, to: '2026-10-31' })).toMatchObject({ ok: true, range: { from: '2026-10-02' } });
    expect(resolveRange({ today, from: '2026-11-10' })).toMatchObject({ ok: true, range: { to: '2026-11-15' } });
  });

  it('never counts a day that has not come: the range may end later but the days stop today', () => {
    expect(resolveRange({ today, from: '2026-11-01', to: '2026-12-31' })).toEqual({
      ok: true,
      range: { from: '2026-11-01', to: '2026-12-31', effectiveTo: '2026-11-15' },
    });
  });

  it('refuses a range that ends before it starts', () => {
    expect(resolveRange({ today, from: '2026-11-10', to: '2026-11-09' })).toEqual({
      ok: false,
      problem: 'RANGE_INVERTED',
    });
  });

  it('allows a range of 366 days and refuses 367', () => {
    expect(resolveRange({ today, from: '2025-11-15', to: '2026-11-15' })).toMatchObject({ ok: true });
    expect(resolveRange({ today, from: '2025-11-14', to: '2026-11-15' })).toEqual({
      ok: false,
      problem: 'RANGE_TOO_LONG',
    });
  });
});

describe('periodsOf', () => {
  const range = { from: '2026-10-28', to: '2026-11-10', effectiveTo: '2026-11-10' };

  it('makes a period of each day', () => {
    const periods = periodsOf({ from: '2026-11-01', to: '2026-11-03', effectiveTo: '2026-11-03' }, 'DAY');

    expect(periods).toEqual([
      { start: '2026-11-01', end: '2026-11-01', days: 1 },
      { start: '2026-11-02', end: '2026-11-02', days: 1 },
      { start: '2026-11-03', end: '2026-11-03', days: 1 },
    ]);
  });

  it('cuts weeks from Monday to Sunday (ISO) and counts only the days of the range in the first and the last', () => {
    // Wed 28/10/2026 .. Tue 10/11/2026: the first week has five days of the range (Wed–Sun), the last two (Mon–Tue).
    expect(periodsOf(range, 'WEEK')).toEqual([
      { start: '2026-10-28', end: '2026-11-01', days: 5 },
      { start: '2026-11-02', end: '2026-11-08', days: 7 },
      { start: '2026-11-09', end: '2026-11-10', days: 2 },
    ]);
  });

  it('cuts months by the calendar, the first and the last as far as the range goes', () => {
    expect(periodsOf(range, 'MONTH')).toEqual([
      { start: '2026-10-28', end: '2026-10-31', days: 4 },
      { start: '2026-11-01', end: '2026-11-10', days: 10 },
    ]);
  });

  it('stops at the day the range is counted to, not at the day it is asked to end', () => {
    const periods = periodsOf({ from: '2026-11-13', to: '2026-11-30', effectiveTo: '2026-11-15' }, 'MONTH');

    expect(periods).toEqual([{ start: '2026-11-13', end: '2026-11-15', days: 3 }]);
  });

  it('has no period when the whole range is still to come', () => {
    expect(periodsOf({ from: '2026-11-20', to: '2026-11-30', effectiveTo: '2026-11-15' }, 'DAY')).toEqual([]);
  });

  it('puts the last days of December in the ISO week they belong to even when the week crosses the year', () => {
    // 31/12/2026 is a Thursday: its week runs Mon 28/12 – Sun 03/01/2027.
    const periods = periodsOf({ from: '2026-12-30', to: '2027-01-04', effectiveTo: '2027-01-04' }, 'WEEK');

    expect(periods).toEqual([
      { start: '2026-12-30', end: '2027-01-03', days: 5 },
      { start: '2027-01-04', end: '2027-01-04', days: 1 },
    ]);
  });
});

describe('dataStatusOf', () => {
  it('says NO_DATA when no day of the period is covered by anything, however many days there are', () => {
    expect(dataStatusOf(0, 7)).toBe('NO_DATA');
  });

  it('says PARTIAL when some days are covered and some are not', () => {
    expect(dataStatusOf(3, 7)).toBe('PARTIAL');
  });

  it('says HAS_DATA only when every day of the period is covered', () => {
    expect(dataStatusOf(7, 7)).toBe('HAS_DATA');
  });
});
