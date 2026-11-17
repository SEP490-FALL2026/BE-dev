import type { PeriodAdjustment } from '../../../catalog/public/subscription-period.types';
import type { RenewalChoice, RenewalOutcomeKind } from '../subscription-renewal.types';
import { nextPeriodProblem, nextStartProblem } from './renewal-record.policy';

const adjustment = (extra: Partial<PeriodAdjustment> = {}): PeriodAdjustment => ({
  kind: 'NOTICE_DEADLINE',
  deadline: '2026-12-01',
  point: '2026-11-01',
  end: '2026-12-31',
  redAlertOn: '2026-11-24',
  commitment: 'ANNUAL',
  ...extra,
});

describe('a result with no new period (A1C-03)', () => {
  const refusal = { problem: 'NEXT_PERIOD_REQUIRED' };
  const without = (choice: RenewalChoice, outcome: RenewalOutcomeKind, commitment: 'MONTHLY' | 'ANNUAL' = 'ANNUAL') =>
    nextPeriodProblem({ choice, outcome, hasNextPeriod: false, commitment });

  it('is a dead end for a renewal, a reduction and an increase, so the new period is required', () => {
    for (const choice of ['RENEW', 'REDUCE', 'INCREASE'] as const) {
      expect(without(choice, 'AS_DECIDED')).toEqual(refusal);
      expect(without(choice, 'DIFFERENT')).toEqual(refusal);
      expect(without(choice, 'VENDOR_REFUSED')).toEqual(refusal);
    }
    expect(
      nextPeriodProblem({ choice: 'REDUCE', outcome: 'DIFFERENT', hasNextPeriod: true, commitment: 'ANNUAL' }),
    ).toBeNull();
  });

  it('is allowed for a plan by the month when the vendor refused: the next payment day opens another point', () => {
    expect(without('REDUCE', 'VENDOR_REFUSED', 'MONTHLY')).toBeNull();
    expect(without('REDUCE', 'DIFFERENT', 'MONTHLY')).toEqual(refusal);
    expect(without('REDUCE', 'AS_DECIDED', 'MONTHLY')).toEqual(refusal);
  });

  it('is allowed for a cancellation only as decided: the vendor that did not carry it out made a period, which is recorded (V-2)', () => {
    expect(without('CANCEL', 'AS_DECIDED')).toBeNull();
    expect(without('CANCEL', 'AS_DECIDED', 'MONTHLY')).toBeNull();
  });

  it('is a dead end for a cancellation the vendor refused or did otherwise, by the year and by the month alike (V-2)', () => {
    for (const commitment of ['ANNUAL', 'MONTHLY'] as const) {
      for (const outcome of ['VENDOR_REFUSED', 'DIFFERENT'] as const) {
        expect(without('CANCEL', outcome, commitment)).toEqual(refusal);
      }
    }
    for (const outcome of ['AS_DECIDED', 'VENDOR_REFUSED', 'DIFFERENT'] as const) {
      expect(nextPeriodProblem({ choice: 'CANCEL', outcome, hasNextPeriod: true, commitment: 'ANNUAL' })).toBeNull();
    }
  });
});

describe('the day the new period starts (A1C-04)', () => {
  const refused = (end: string, startDate: string, commitment: 'MONTHLY' | 'ANNUAL' = 'ANNUAL') =>
    nextStartProblem(adjustment({ end, commitment }), startDate);
  const notOnTheDay = { problem: 'PERIOD_REFUSED', details: { reason: 'NOT_ON_RENEWAL_DAY', renewalOn: '2026-12-31' } };

  it('is the renewal day of a plan by the year, or the day after the last day it ends on (either way the vendor words it)', () => {
    expect(refused('2026-12-31', '2026-12-31')).toBeNull();
    expect(refused('2026-12-31', '2027-01-01')).toBeNull();
  });

  it('is refused before the renewal day, which would be a reduction in the middle of the period', () => {
    expect(refused('2026-12-31', '2026-12-30')).toEqual(notOnTheDay);
    expect(refused('2026-12-31', '2026-06-01')).toEqual(notOnTheDay);
  });

  it('is refused after the day that follows it, which would keep the old period paying for the gap', () => {
    expect(refused('2026-12-31', '2027-01-02')).toEqual(notOnTheDay);
    expect(refused('2026-12-31', '2027-02-15')).toEqual(notOnTheDay);
  });

  it('is the payment day itself for a plan by the month', () => {
    expect(refused('2026-12-31', '2026-12-31', 'MONTHLY')).toBeNull();
    expect(refused('2026-12-31', '2027-01-01', 'MONTHLY')).toEqual(notOnTheDay);
    expect(refused('2026-12-31', '2026-12-30', 'MONTHLY')).toEqual(notOnTheDay);
  });
});
