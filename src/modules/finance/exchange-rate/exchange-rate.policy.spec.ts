import { EARLIEST_RATE_DATE, rateDateProblem } from './exchange-rate.policy';

describe('rateDateProblem', () => {
  const today = '2026-10-20';

  it('accepts today, an earlier day and the earliest day allowed', () => {
    expect(rateDateProblem(today, today)).toBeNull();
    expect(rateDateProblem('2026-09-01', today)).toBeNull();
    expect(rateDateProblem(EARLIEST_RATE_DATE, today)).toBeNull();
  });

  it('refuses a day after today, however near', () => {
    expect(rateDateProblem('2026-10-21', today)).toBe('DATE_IN_FUTURE');
    expect(rateDateProblem('2099-01-01', today)).toBe('DATE_IN_FUTURE');
  });

  it('refuses a day before the earliest day allowed', () => {
    expect(rateDateProblem('1999-12-31', today)).toBe('DATE_TOO_OLD');
  });
});
