import { businessYearOf, calendarRefusal, seedCalendar } from './seed-calendar';

const facts = (mode: 'plan' | 'apply', today: string, datasetYear: number | null = null, fiscalYearStartMonth = 1) => ({
  mode,
  today,
  datasetYear,
  fiscalYearStartMonth,
});

describe('the calendar of the demo dataset', () => {
  it('lets apply write from the 1st of January to the 30th of November', () => {
    expect(calendarRefusal(facts('apply', '2026-01-01'))).toBeNull();
    expect(calendarRefusal(facts('apply', '2026-11-30'))).toBeNull();
    expect(calendarRefusal(facts('apply', '2026-10-30', 2026))).toBeNull();
  });

  it('allows apply throughout December', () => {
    expect(calendarRefusal(facts('apply', '2026-12-01'))).toBeNull();
    expect(calendarRefusal(facts('apply', '2026-12-31', 2026))).toBeNull();
  });

  it('lets plan read any day of the year the dataset was applied in', () => {
    expect(calendarRefusal(facts('plan', '2026-12-28', 2026))).toBeNull();
    expect(calendarRefusal(facts('plan', '2026-12-28'))).toBeNull();
  });

  it('refuses plan and apply once the year has turned: the dataset belongs to the year it was applied in', () => {
    for (const mode of ['plan', 'apply'] as const) {
      expect(calendarRefusal(facts(mode, '2027-01-04', 2026))).toMatch(/applied in 2026.*this is 2027/);
    }
  });

  it('dates the first apply in the organization time zone, not in UTC', () => {
    expect(businessYearOf('2026-12-31T18:30:00.000Z', 'Asia/Ho_Chi_Minh')).toBe(2027);
    expect(businessYearOf('2027-01-01T03:00:00.000Z', 'America/Los_Angeles')).toBe(2026);
    expect(businessYearOf('2026-10-30T09:00:00.000Z', 'UTC')).toBe(2026);
  });

  it('refuses a fiscal year that does not begin in January', () => {
    expect(calendarRefusal(facts('apply', '2026-05-10', null, 4))).toMatch(/FISCAL_YEAR_START_MONTH/);
  });
});

describe('shared paid-request budget calendar', () => {
  it.each([
    ['2026-01-01', '2026-01-08', [2026]],
    ['2026-06-15', '2026-06-22', [2026]],
    ['2026-11-24', '2026-12-01', [2026]],
    ['2026-11-25', '2027-01-01', [2026, 2027]],
    ['2026-11-30', '2027-01-01', [2026, 2027]],
    ['2026-12-01', '2027-01-01', [2026, 2027]],
    ['2026-12-25', '2027-01-01', [2026, 2027]],
    ['2026-12-31', '2027-01-01', [2026, 2027]],
    ['2027-12-10', '2028-01-03', [2027, 2028]],
  ] as const)('dates %s with a one-month in-plan term', (today, spendDay, years) => {
    expect(seedCalendar(today, 1)).toEqual({ spendDay, years });
  });
  it('can force the next-year branch for a test on any day', () => {
    expect(seedCalendar('2026-01-01', 1, true)).toEqual({ spendDay: '2027-01-01', years: [2026, 2027] });
  });
});
