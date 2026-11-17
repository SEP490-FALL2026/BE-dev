import {
  adjustmentPeriodInstantOf,
  type AdjustmentInput,
  type PeriodStartInput,
} from './subscription-obligation.policy';

const annual = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  kind: 'TERM',
  commitmentTermMonths: 12,
  billingCycle: 'ANNUAL',
  noticeDeadline: null,
  noticePeriodDays: null,
  renewalDate: '2026-12-31',
  endDate: null,
  autoRenew: true,
  ...extra,
});
const monthly = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  ...annual(),
  commitmentTermMonths: 1,
  billingCycle: 'MONTHLY',
  renewalDate: '2026-12-15',
  ...extra,
});

describe('adjustmentPeriodInstantOf: the instant the parameters of a period are read at (S20-T9b, R2-9, QĐ-106h)', () => {
  const started = (extra: Partial<PeriodStartInput> = {}): PeriodStartInput => ({
    ...annual({ noticeDeadline: '2026-12-20' }),
    startDate: '2026-01-10',
    createdAt: new Date('2026-01-05T09:30:00Z'),
    ...extra,
  });

  it('is the start of the day a plan by the year starts on: the whole year keeps the values of that day', () => {
    expect(adjustmentPeriodInstantOf(started(), '2026-11-15')).toEqual(new Date('2026-01-10T00:00:00Z'));
    expect(adjustmentPeriodInstantOf(started(), '2026-12-30')).toEqual(new Date('2026-01-10T00:00:00Z'));
  });

  it('is the start of the day the record was created on when no start day is known', () => {
    expect(adjustmentPeriodInstantOf(started({ startDate: null }), '2026-11-15')).toEqual(
      new Date('2026-01-05T00:00:00Z'),
    );
  });

  it('is the start of the month that runs for a plan by the month: one row that lives many months reads each month at its own start', () => {
    const row = started({ ...monthly({ renewalDate: '2026-01-15' }), startDate: '2026-01-15' });

    // Payment day 2026-11-15 on 2026-11-02: the month that runs began on 2026-10-15.
    expect(adjustmentPeriodInstantOf(row, '2026-11-02')).toEqual(new Date('2026-10-15T00:00:00Z'));
    // The next month, the payment day has moved on and so has the instant.
    expect(adjustmentPeriodInstantOf(row, '2026-11-20')).toEqual(new Date('2026-11-15T00:00:00Z'));
  });

  it('is the start day itself for the first month of a plan by the month: the month cannot begin before the plan does', () => {
    const row = started({ ...monthly({ renewalDate: '2026-02-15' }), startDate: '2026-01-20' });

    expect(adjustmentPeriodInstantOf(row, '2026-01-25')).toEqual(new Date('2026-01-20T00:00:00Z'));
  });

  it('falls back on the created day for a plan by the month with no start day, and on the start day when no point exists', () => {
    const noStart = started({
      ...monthly({ renewalDate: '2026-01-15' }),
      startDate: null,
      createdAt: new Date('2026-11-12T18:00:00Z'),
    });

    expect(adjustmentPeriodInstantOf(noStart, '2026-11-13')).toEqual(new Date('2026-11-12T00:00:00Z'));
    expect(
      adjustmentPeriodInstantOf(started({ renewalDate: null, endDate: null, noticeDeadline: null }), '2026-11-15'),
    ).toEqual(new Date('2026-01-10T00:00:00Z'));
  });
});
