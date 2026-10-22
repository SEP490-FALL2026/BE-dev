import {
  addDays,
  businessDateAt,
  fromDateColumn,
  isBusinessDate,
  isValidTimeZone,
  toDateColumn,
} from './business-date';

describe('business dates', () => {
  it('moves 23:30 UTC to the next day in UTC+7 (US-02-01 TS-3)', () => {
    const instant = new Date('2026-10-11T23:30:00.000Z');
    expect(businessDateAt(instant, 'Asia/Ho_Chi_Minh')).toBe('2026-10-12');
    expect(businessDateAt(instant, 'UTC')).toBe('2026-10-11');
  });

  it('round-trips a date through the date column representation', () => {
    expect(fromDateColumn(toDateColumn('2026-02-28'))).toBe('2026-02-28');
  });

  it.each(['2026-02-30', '2026-13-01', '26-01-01', '2026-1-1', '', 'not-a-date'])('rejects %p', (value) => {
    expect(isBusinessDate(value)).toBe(false);
  });

  it('accepts a real calendar date', () => {
    expect(isBusinessDate('2024-02-29')).toBe(true);
  });

  it('accepts IANA zones and rejects offsets and unknown names', () => {
    expect(isValidTimeZone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('+07:00')).toBe(false);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-12-31', -30, '2026-12-01'],
    ['2026-12-31', -15, '2026-12-16'],
    ['2026-12-31', -7, '2026-12-24'],
    ['2026-12-01', -15, '2026-11-16'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2024-03-01', -1, '2024-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-12-31', 0, '2026-12-31'],
    ['2026-01-01', -1, '2025-12-31'],
  ])('%s shifted by %d days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});
