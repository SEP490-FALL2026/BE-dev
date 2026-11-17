import type { BusinessDate } from '../../../../core/business-date';
import { adjustmentPointOf, type AdjustmentInput, type AdjustmentWindows } from './subscription-obligation.policy';

const STANDARD: AdjustmentWindows = { monthlyDays: 7, annualDays: 30, redAlertDaysAnnual: 7 };
const monthly = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  kind: 'TERM',
  commitmentTermMonths: 1,
  billingCycle: 'MONTHLY',
  noticeDeadline: null,
  noticePeriodDays: null,
  startDate: '2026-01-01',
  renewalDate: null,
  endDate: '2026-12-31',
  autoRenew: true,
  ...extra,
});
const pointOn = (input: AdjustmentInput, today: BusinessDate) => adjustmentPointOf(input, today, STANDARD);

describe('the next payment day of a plan by the month: the grid of its stored day, rolled both ways (R-1, QĐ-106i(2))', () => {
  it('rolls back from an end day months away to the nearest payment day that is not before today: a plan by the month opens its point every month', () => {
    const endsInDecember = monthly();

    expect(pointOn(endsInDecember, '2026-11-17')).toMatchObject({ deadline: '2026-11-30', point: '2026-11-23' });
    // 30/11 is the grid day of 31/12 counted back by one month (the 31st clamped); the day after it the next is the 31st of December.
    expect(pointOn(endsInDecember, '2026-12-01')).toMatchObject({ deadline: '2026-12-31', point: '2026-12-24' });
    expect(pointOn(endsInDecember, '2026-02-01')?.deadline).toBe('2026-02-28');
    expect(pointOn(endsInDecember, '2027-01-05')?.deadline).toBe('2027-01-31');
  });

  it('does the same from the renewal day when that is months away, and keeps the renewal day itself when it is the nearest', () => {
    const renewsInJanuary = monthly({ renewalDate: '2027-01-15', endDate: null });

    expect(pointOn(renewsInJanuary, '2026-11-17')?.deadline).toBe('2026-12-15');
    expect(pointOn(renewsInJanuary, '2026-12-15')?.deadline).toBe('2026-12-15');
    expect(pointOn(monthly({ renewalDate: '2026-12-01', endDate: null }), '2026-11-17')?.deadline).toBe('2026-12-01');
  });

  it('never counts a payment day from before the plan starts, whatever the stored day says', () => {
    const notBegun = monthly({ endDate: '2027-12-20', startDate: '2026-12-02' });

    // Today 15/11 is before the start: the first payment day is the first one of the grid on or after 2/12, the 20th.
    expect(pointOn(notBegun, '2026-11-15')?.deadline).toBe('2026-12-20');
    expect(pointOn(notBegun, '2026-12-21')?.deadline).toBe('2027-01-20');
  });

  it('has no point with only a start day: it bounds the payment days and anchors none, nothing is guessed', () => {
    expect(pointOn(monthly({ endDate: null, startDate: '2026-03-10' }), '2026-11-15')).toBeNull();
  });

  it('keeps the stop of a plan that does not renew itself at its end day while rolling back from it', () => {
    const fixedTerm = monthly({ autoRenew: false });

    expect(pointOn(fixedTerm, '2026-11-17')).toMatchObject({ deadline: '2026-11-30', end: '2026-11-30' });
    expect(pointOn(fixedTerm, '2026-12-01')).toMatchObject({ deadline: '2026-12-31', end: '2026-12-31' });
    expect(pointOn(fixedTerm, '2027-01-02')).toMatchObject({ deadline: '2026-12-31', end: '2026-12-31' });
  });
});
