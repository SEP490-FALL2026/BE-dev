import { earliestReducibleOn, type AdjustmentInput } from './subscription-obligation.policy';

const annual = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  kind: 'TERM',
  commitmentTermMonths: 12,
  billingCycle: 'ANNUAL',
  noticeDeadline: null,
  noticePeriodDays: 30,
  startDate: '2026-07-01',
  renewalDate: '2027-07-01',
  endDate: '2027-07-01',
  autoRenew: true,
  ...extra,
});

const monthly = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  kind: 'TERM',
  commitmentTermMonths: 1,
  billingCycle: 'MONTHLY',
  noticeDeadline: null,
  noticePeriodDays: null,
  startDate: '2027-01-15',
  renewalDate: '2027-01-15',
  endDate: null,
  autoRenew: true,
  ...extra,
});

describe('earliestReducibleOn: earliest effective date for seat reduction (Q-F / R-LATE)', () => {
  it('returns the current period renewal date on or before the annual notice deadline', () => {
    const sub = annual();

    expect(earliestReducibleOn(sub, '2026-11-15')).toBe('2027-07-01');
    expect(earliestReducibleOn(sub, '2027-05-02')).toBe('2027-07-01');
    expect(earliestReducibleOn(sub, '2027-06-01')).toBe('2027-07-01');
  });

  it('rolls an auto-renewing annual plan to the next cycle after missing the notice deadline', () => {
    const sub = annual();

    expect(earliestReducibleOn(sub, '2027-06-02')).toBe('2028-07-01');
    expect(earliestReducibleOn(sub, '2027-06-30')).toBe('2028-07-01');
  });

  it('keeps the current end date for a non-auto-renewing annual plan before period end', () => {
    const sub = annual({ autoRenew: false, noticePeriodDays: 30, endDate: '2027-07-01', renewalDate: null });

    expect(earliestReducibleOn(sub, '2027-06-02')).toBe('2027-07-01');
    expect(earliestReducibleOn(sub, '2027-07-02')).toBeNull();
  });

  it('rolls a monthly plan to its next payment day and advances past the payment day', () => {
    const sub = monthly();

    expect(earliestReducibleOn(sub, '2027-01-20')).toBe('2027-02-15');
    expect(earliestReducibleOn(sub, '2027-02-08')).toBe('2027-02-15');
    expect(earliestReducibleOn(sub, '2027-02-15')).toBe('2027-02-15');
    expect(earliestReducibleOn(sub, '2027-02-16')).toBe('2027-03-15');
  });

  it('returns null for perpetual plans or plans without dates', () => {
    expect(earliestReducibleOn(annual({ kind: 'PERPETUAL' }), '2027-02-01')).toBeNull();
    expect(
      earliestReducibleOn(
        annual({ renewalDate: null, endDate: null, noticeDeadline: null, noticePeriodDays: null }),
        '2027-02-01',
      ),
    ).toBeNull();
  });
});
