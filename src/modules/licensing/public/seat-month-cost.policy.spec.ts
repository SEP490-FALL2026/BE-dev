import { monthCostBefore, releaseOnLateGrant, releaseOnRevocation } from './seat-month-cost.policy';

describe('monthCostBefore (RV-07)', () => {
  it('costs nothing on day 1 of the month', () => {
    expect(monthCostBefore(200n, '2026-09-01')).toBe(0n);
  });

  it('is the share of the days before the day, in a 30-day month', () => {
    expect(monthCostBefore(300n, '2026-09-11')).toBe(100n);
  });

  it('rounds half up to the smallest unit', () => {
    // 100 over 30 days, 15 days before: exactly 50; 100 over 31 days, 15 days before: 48.38 -> 48; 10 over 30, 2 days: 0.67 -> 1.
    expect(monthCostBefore(100n, '2026-09-16')).toBe(50n);
    expect(monthCostBefore(100n, '2026-10-16')).toBe(48n);
    expect(monthCostBefore(10n, '2026-09-03')).toBe(1n);
    // 15 over 30, 1 day: 0.5 -> 1 (half up).
    expect(monthCostBefore(15n, '2026-09-02')).toBe(1n);
  });

  it('knows February of a leap year', () => {
    expect(monthCostBefore(290n, '2028-02-11')).toBe(100n);
  });
});

describe('releaseOnRevocation (RV-07, M-06)', () => {
  it('gives back the whole month and the months after when the right ends on day 1 (200 a month, 09 to 12: 800)', () => {
    expect(releaseOnRevocation({ monthlyMinor: 200n, endsOn: '2026-09-01', lastMonth: 12 })).toBe(800n);
  });

  it('keeps the days already used of the month of the end (200 a month, ends 11/09: 800 less the 10 days of 30 already used, 67)', () => {
    // 4 months (09..12) = 800, less the 10 days of 30 already used: 200 * 10 / 30 = 66.67 -> 67.
    expect(releaseOnRevocation({ monthlyMinor: 200n, endsOn: '2026-09-11', lastMonth: 12 })).toBe(733n);
  });

  it('gives back nothing when the last month committed is before the month of the end', () => {
    expect(releaseOnRevocation({ monthlyMinor: 200n, endsOn: '2026-10-05', lastMonth: 9 })).toBe(0n);
  });

  it('gives back the part of the last month not used when the end falls in it', () => {
    expect(releaseOnRevocation({ monthlyMinor: 300n, endsOn: '2026-09-11', lastMonth: 9 })).toBe(200n);
  });
});

describe('releaseOnLateGrant (M-10)', () => {
  it('gives back the months before the month of the grant and the days before it (15 a month, from 01, granted 14/07)', () => {
    // 6 months before July = 90, plus 13 days of 31 of 15 = 6.29 -> 6.
    expect(releaseOnLateGrant({ monthlyMinor: 15n, grantedOn: '2026-07-14', firstMonth: 1 })).toBe(96n);
  });

  it('gives back nothing for a grant on day 1 of the first month', () => {
    expect(releaseOnLateGrant({ monthlyMinor: 15n, grantedOn: '2026-01-01', firstMonth: 1 })).toBe(0n);
  });
});
