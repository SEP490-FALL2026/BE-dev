import type { BusinessDate } from '../../../../core/business-date';
import {
  adjustmentPointOf,
  expiryReading,
  redAlertOf,
  runsAPeriod,
  type AdjustmentInput,
  type AdjustmentWindows,
} from './subscription-obligation.policy';

const annual = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  kind: 'TERM',
  commitmentTermMonths: 12,
  billingCycle: 'ANNUAL',
  noticeDeadline: null,
  noticePeriodDays: null,
  startDate: null,
  renewalDate: '2026-12-31',
  endDate: null,
  autoRenew: true,
  ...extra,
});
const monthly = (extra: Partial<AdjustmentInput> = {}): AdjustmentInput => ({
  kind: 'TERM',
  commitmentTermMonths: 1,
  billingCycle: 'MONTHLY',
  noticeDeadline: null,
  noticePeriodDays: null,
  startDate: null,
  renewalDate: '2026-12-15',
  endDate: null,
  autoRenew: true,
  ...extra,
});

/** The point of a subscription on `today` (15/11 unless a case says otherwise: a day before the payment day and the deadline of the fixtures, except a plan by the month, whose payment day falls on the 15th each month). */
const STANDARD: AdjustmentWindows = { monthlyDays: 7, annualDays: 30, redAlertDaysAnnual: 7 };
const pointOf = (input: AdjustmentInput, today: BusinessDate = '2026-11-15', windows: AdjustmentWindows = STANDARD) =>
  adjustmentPointOf(input, today, windows);

describe('adjustmentPointOf: where the IT Admin adjusts a subscription before its next period (`FR-1.4`, `QĐ-111o`)', () => {
  describe('a plan bought by the year', () => {
    it('opens 30 days before the deadline to cancel (one the IT Admin declared) and runs to the renewal day', () => {
      expect(pointOf(annual({ noticeDeadline: '2026-12-20' }))).toEqual({
        kind: 'NOTICE_DEADLINE',
        deadline: '2026-12-20',
        point: '2026-11-20',
        end: '2026-12-31',
        endKind: 'RENEWAL_DATE',
      });
    });

    it('counts the deadline back from the renewal date by the days of notice when none is declared', () => {
      expect(pointOf(annual({ noticePeriodDays: 30 }))).toEqual({
        kind: 'NOTICE_DEADLINE',
        deadline: '2026-12-01',
        point: '2026-11-01',
        end: '2026-12-31',
        endKind: 'RENEWAL_DATE',
      });
    });

    it('takes the renewal date when there is neither a deadline nor days of notice and the plan renews itself (QĐ-106i)', () => {
      expect(pointOf(annual({ autoRenew: true }))).toEqual({
        kind: 'RENEWAL_DATE',
        deadline: '2026-12-31',
        point: '2026-12-01',
        end: '2026-12-31',
        endKind: 'RENEWAL_DATE',
      });
    });

    it('takes the end date when there is no way to cancel and the plan does not renew itself', () => {
      expect(pointOf(annual({ autoRenew: false, renewalDate: null, endDate: '2026-12-31' }))).toEqual({
        kind: 'END_DATE',
        deadline: '2026-12-31',
        point: '2026-12-01',
        end: '2026-12-31',
        endKind: 'END_DATE',
      });
    });

    it('ends the period on the deadline itself when no renewal or end day is known, or when one comes before the deadline', () => {
      expect(pointOf(annual({ noticeDeadline: '2026-12-20', renewalDate: null, endDate: null }))).toMatchObject({
        end: '2026-12-20',
        endKind: 'NOTICE_DEADLINE',
      });
      expect(pointOf(annual({ noticeDeadline: '2026-12-20', renewalDate: '2026-12-10' }))).toMatchObject({
        end: '2026-12-20',
        endKind: 'NOTICE_DEADLINE',
      });
    });

    it('has no point when no date to count from is known: nothing is guessed', () => {
      expect(pointOf(annual({ renewalDate: null, endDate: null }))).toBeNull();
      expect(pointOf(annual({ autoRenew: false, renewalDate: '2026-12-31', endDate: null }))).toBeNull();
    });
  });

  describe('a plan bought by the month', () => {
    it('opens 7 days before the payment day and ends on it, whatever the deadline to cancel says', () => {
      expect(pointOf(monthly({ noticeDeadline: '2026-12-01' }), '2026-11-16')).toEqual({
        kind: 'PAYMENT_DATE',
        deadline: '2026-12-15',
        point: '2026-12-08',
        end: '2026-12-15',
        endKind: 'PAYMENT_DATE',
      });
    });

    it('counts from the end date when no renewal date is known, rolled to the payment day that is not before today, and has no point with no date at all', () => {
      // Today is 15/11: the 20th of the month that runs, not the end day a month on (R-1).
      expect(pointOf(monthly({ renewalDate: null, endDate: '2026-12-20' }))?.deadline).toBe('2026-11-20');
      expect(pointOf(monthly({ renewalDate: null, endDate: null }))).toBeNull();
    });

    it('rolls the payment day to the next month once it has passed: a plan by the month nobody adjusted just goes on (QĐ-103e)', () => {
      const lapsed = monthly({ renewalDate: '2026-12-15' });

      expect(pointOf(lapsed, '2026-12-15')).toMatchObject({ deadline: '2026-12-15', point: '2026-12-08' });
      expect(pointOf(lapsed, '2026-12-16')).toEqual({
        kind: 'PAYMENT_DATE',
        deadline: '2027-01-15',
        point: '2027-01-08',
        end: '2027-01-15',
        endKind: 'PAYMENT_DATE',
      });
      expect(pointOf(lapsed, '2027-03-02')?.deadline).toBe('2027-03-15');
    });

    it('rolls by whole months from the stored day, a shorter month ending on its last day without moving the day for the next', () => {
      const lastDay = monthly({ renewalDate: '2026-01-31' });

      expect(pointOf(lastDay, '2026-02-10')?.deadline).toBe('2026-02-28');
      expect(pointOf(lastDay, '2026-03-01')?.deadline).toBe('2026-03-31');
    });

    it('rolls the end day of a plan that renews itself when it names no renewal day', () => {
      expect(
        pointOf(monthly({ renewalDate: null, endDate: '2026-12-20', autoRenew: true }), '2026-12-21')?.deadline,
      ).toBe('2027-01-20');
    });

    it('does not roll past the end day of a plan that does not renew itself: that period really ends there', () => {
      expect(
        pointOf(monthly({ renewalDate: null, endDate: '2026-12-15', autoRenew: false }), '2026-12-16'),
      ).toMatchObject({ deadline: '2026-12-15', end: '2026-12-15', endKind: 'PAYMENT_DATE' });
    });

    it('keeps paying month by month up to the end day of a plan that does not renew itself, the last payment day being the end day', () => {
      const fixed = monthly({ renewalDate: '2026-12-15', endDate: '2027-02-10', autoRenew: false });

      expect(pointOf(fixed, '2026-12-16')?.deadline).toBe('2027-01-15');
      expect(pointOf(fixed, '2027-01-16')).toMatchObject({ deadline: '2027-02-10', end: '2027-02-10' });
      expect(pointOf(fixed, '2027-02-11')).toMatchObject({ deadline: '2027-02-10', end: '2027-02-10' });
    });

    it('is a plan by the month when it names no commitment but is paid by the month (a personal plan, K1)', () => {
      expect(pointOf(monthly({ commitmentTermMonths: null }), '2026-11-16')?.point).toBe('2026-12-08');
      expect(pointOf(annual({ commitmentTermMonths: null, noticeDeadline: '2026-12-20' }))?.point).toBe('2026-11-20');
    });
  });

  describe('with windows other than the standard ones (S20-T9b: the three parameters of FR-1.4 and FR-8.2)', () => {
    it('opens a plan by the year as many days before its deadline as its window says, and leaves the deadline and the end alone', () => {
      const windows = { ...STANDARD, annualDays: 45 };

      expect(pointOf(annual({ noticeDeadline: '2026-12-20' }), '2026-11-15', windows)).toEqual({
        kind: 'NOTICE_DEADLINE',
        deadline: '2026-12-20',
        point: '2026-11-05',
        end: '2026-12-31',
        endKind: 'RENEWAL_DATE',
      });
      expect(
        pointOf(annual({ noticeDeadline: '2026-12-20' }), '2026-11-15', { ...STANDARD, annualDays: 1 })?.point,
      ).toBe('2026-12-19');
    });

    it('opens a plan by the month as many days before its payment day as its window says', () => {
      expect(pointOf(monthly(), '2026-11-16', { ...STANDARD, monthlyDays: 14 })).toMatchObject({
        deadline: '2026-12-15',
        point: '2026-12-01',
      });
      expect(pointOf(monthly(), '2026-11-16', { ...STANDARD, monthlyDays: 28 })?.point).toBe('2026-11-17');
    });

    it('reads the window of the commitment of the plan only: the window of a month never moves a plan by the year, nor the reverse', () => {
      const windows = { ...STANDARD, monthlyDays: 2, annualDays: 90 };

      expect(pointOf(annual({ noticeDeadline: '2026-12-20' }), '2026-11-15', windows)?.point).toBe('2026-09-21');
      expect(pointOf(monthly(), '2026-11-16', windows)?.point).toBe('2026-12-13');
    });

    it('counts the red alert of a plan by the year back from its deadline by its own days, and gives a plan by the month none', () => {
      expect(redAlertOf('2026-12-20', 'ANNUAL', 7)).toBe('2026-12-13');
      expect(redAlertOf('2026-12-20', 'ANNUAL', 90)).toBe('2026-09-21');
      expect(redAlertOf('2026-12-20', 'MONTHLY', 7)).toBeNull();
    });
  });

  it('has none for a purchase made once: it has no period, so it never enters a list of what ends (a K4 key)', () => {
    expect(
      pointOf(
        annual({
          kind: 'PERPETUAL',
          commitmentTermMonths: null,
          billingCycle: null,
          renewalDate: null,
          autoRenew: false,
        }),
      ),
    ).toBeNull();
  });
});

describe('runsAPeriod: the subscriptions that have a point of adjustment at all', () => {
  const running = { kind: 'TERM' as const, status: 'ACTIVE' as const, hasSuccessor: false };

  it('is an active subscription by term that no later period continues', () => {
    expect(runsAPeriod(running)).toBe(true);
  });

  it('is not a draft, a purchase made once, or a period a later one continues', () => {
    expect(runsAPeriod({ ...running, status: 'DRAFT' })).toBe(false);
    expect(runsAPeriod({ ...running, kind: 'PERPETUAL' })).toBe(false);
    expect(runsAPeriod({ ...running, hasSuccessor: true })).toBe(false);
  });
});

describe('expiryReading: whether a subscription is near or past its period today (`QĐ-98e`, `QĐ-111o`)', () => {
  const year = {
    kind: 'NOTICE_DEADLINE' as const,
    deadline: '2026-12-20',
    point: '2026-11-20',
    end: '2026-12-31',
    endKind: 'RENEWAL_DATE' as const,
  };

  it('says nothing before the point, with the days that are left to the deadline', () => {
    expect(expiryReading(year, '2026-11-19', true)).toEqual({
      state: null,
      daysLeft: 31,
      deadlineKind: 'NOTICE_DEADLINE',
    });
  });

  it('is SOON from the day of the point, with the days left to the deadline that day', () => {
    expect(expiryReading(year, '2026-11-20', true)).toEqual({
      state: 'SOON',
      daysLeft: 30,
      deadlineKind: 'NOTICE_DEADLINE',
    });
    expect(expiryReading(year, '2026-12-20', false)).toEqual({
      state: 'SOON',
      daysLeft: 0,
      deadlineKind: 'NOTICE_DEADLINE',
    });
  });

  it('stays SOON after the deadline to cancel and up to the last day of the period: the contract still runs (QĐ-98e: past the renewal day)', () => {
    expect(expiryReading(year, '2026-12-21', true)).toEqual({
      state: 'SOON',
      daysLeft: -1,
      deadlineKind: 'NOTICE_DEADLINE',
    });
    expect(expiryReading(year, '2026-12-31', true).state).toBe('SOON');
  });

  it('is EXPIRED the day after the renewal day while seats are still held, counting the days past from the renewal day', () => {
    expect(expiryReading(year, '2027-01-01', true)).toEqual({
      state: 'EXPIRED',
      daysLeft: -1,
      deadlineKind: 'RENEWAL_DATE',
    });
    expect(expiryReading(year, '2027-01-06', true)).toMatchObject({ state: 'EXPIRED', daysLeft: -6 });
  });

  it('is EXPIRED the day after the end of a plan by the month that does not renew itself while seats are still held', () => {
    const ended = pointOf(monthly({ renewalDate: null, endDate: '2026-12-15', autoRenew: false }), '2026-12-16');

    expect(expiryReading(ended, '2026-12-15', true).state).toBe('SOON');
    expect(expiryReading(ended, '2026-12-16', true)).toEqual({
      state: 'EXPIRED',
      daysLeft: -1,
      deadlineKind: 'PAYMENT_DATE',
    });
  });

  it('is never EXPIRED past the payment day of a plan by the month that goes on: the next payment day is the deadline (QĐ-103e, QĐ-103v(5))', () => {
    const lapsed = monthly({ renewalDate: '2026-12-15' });
    const readingOn = (today: BusinessDate) => expiryReading(pointOf(lapsed, today), today, true);

    expect(readingOn('2026-12-15')).toEqual({ state: 'SOON', daysLeft: 0, deadlineKind: 'PAYMENT_DATE' });
    expect(readingOn('2026-12-16')).toEqual({ state: null, daysLeft: 30, deadlineKind: 'PAYMENT_DATE' });
    expect(readingOn('2027-01-07').state).toBeNull();
    expect(readingOn('2027-01-08')).toEqual({ state: 'SOON', daysLeft: 7, deadlineKind: 'PAYMENT_DATE' });
  });

  it('is not EXPIRED when nobody holds a seat any more: nothing is left to adjust (QĐ-98e)', () => {
    expect(expiryReading(year, '2027-01-01', false)).toEqual({
      state: null,
      daysLeft: -1,
      deadlineKind: 'RENEWAL_DATE',
    });
  });

  it('says nothing, with no days, when there is no point', () => {
    expect(expiryReading(null, '2026-11-15', true)).toEqual({ state: null, daysLeft: null, deadlineKind: null });
  });
});
