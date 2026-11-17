import type { PeriodAdjustment, RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { SeatsNeededCounts } from '../seats-needed/renewal-seats-needed.policy';
import type { RenewalChoice, RenewalRecord } from '../subscription-renewal.types';
import {
  countsRefusal,
  existingCaseOf,
  lateRenewalOf,
  noticeBasisOf,
  pointOf,
  preflightOf,
  unintendedRenewalOf,
} from './renewal-record.policy';

const adjustment = (extra: Partial<PeriodAdjustment> = {}): PeriodAdjustment => ({
  kind: 'NOTICE_DEADLINE',
  deadline: '2026-12-01',
  point: '2026-11-01',
  end: '2026-12-31',
  redAlertOn: '2026-11-24',
  commitment: 'ANNUAL',
  ...extra,
});

const period = (extra: Partial<RenewalPeriodFacts> = {}): RenewalPeriodFacts => ({
  subscriptionId: 'sub',
  planId: 'plan',
  planName: 'Team',
  planPricingModel: 'PER_SEAT',
  applicationId: 'app',
  applicationName: 'Figma',
  applicationKind: 'SAAS',
  ownerDepartmentId: null,
  responsibleItAdminEmployeeId: null,
  provisioningType: 'K2',
  commitmentTermMonths: 12,
  vendorMinimumSeats: null,
  isPrimaryForPlan: true,
  kind: 'TERM',
  status: 'ACTIVE',
  purchasedQuantity: 10,
  unitPrice: { amountMinor: 12_000n, currency: 'VND' },
  billingCycle: 'ANNUAL',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  renewalDate: '2027-01-01',
  autoRenew: true,
  allowsMidTermReduction: false,
  notice: { source: 'DECLARED', deadline: '2026-12-01', baseDate: '2026-12-01' },
  adjustment: adjustment(),
  renewedFromId: null,
  renewedById: null,
  ...extra,
});

const counts = (extra: Partial<SeatsNeededCounts> = {}): SeatsNeededCounts => ({
  heldPastRenewal: 6,
  pendingContinuations: 1,
  approvedAwaitingGrant: 1,
  seatsNeeded: 8,
  vendorMinimumSeats: null,
  target: 8,
  activeSeatsToday: 7,
  openRequests: 1,
  ...extra,
});

const reason = (extra: Partial<RenewalPeriodFacts>) => {
  const result = preflightOf({
    period: period(extra),
    ending: false,
    today: '2026-11-10',
    choice: 'REDUCE',
    quantity: 8,
  });

  return 'refusal' in result ? result.refusal : null;
};

describe('the order of the refusals of a recorded renewal (SBF-20 §4.4 steps 2, 4, 5)', () => {
  const run = (
    extra: Partial<RenewalPeriodFacts>,
    today = '2026-11-10',
    choice: RenewalChoice = 'REDUCE',
    quantity = 8,
    ending = false,
  ) => preflightOf({ period: period(extra), ending, today, choice, quantity });

  it('gives the adjustment of a subscription of the shared pool that is a live term the day the point has come', () => {
    expect(run({})).toEqual({ adjustment: adjustment() });
    // A department that owns a K2 workspace keeps a point (a K2 of before the pool).
    expect(run({ ownerDepartmentId: 'dep' })).toEqual({ adjustment: adjustment() });
  });

  it('names why a subscription has no renewal, in the order perpetual, internal, not a pool term, not active, continued (step 2)', () => {
    expect(reason({ kind: 'PERPETUAL', provisioningType: 'K4' })).toEqual({
      problem: 'NOT_RENEWABLE',
      details: { reason: 'PERPETUAL' },
    });
    expect(reason({ applicationKind: 'INTERNAL', provisioningType: 'K5' })).toEqual({
      problem: 'NOT_RENEWABLE',
      details: { reason: 'INTERNAL' },
    });
    expect(reason({ provisioningType: 'K1', ownerDepartmentId: 'dep' })).toEqual({
      problem: 'NOT_RENEWABLE',
      details: { reason: 'NOT_POOL_TERM' },
    });
    expect(reason({ status: 'DRAFT' })).toEqual({ problem: 'NOT_RENEWABLE', details: { reason: 'NOT_ACTIVE' } });
    expect(reason({ renewedById: 'next' })).toEqual({
      problem: 'NOT_RENEWABLE',
      details: { reason: 'ALREADY_CONTINUED' },
    });
    // A subscription the company recorded as cancelled has no point either, after the others of the list (`A1C-02`).
    expect(run({}, '2026-11-10', 'REDUCE', 8, true)).toEqual({
      refusal: { problem: 'NOT_RENEWABLE', details: { reason: 'CANCELLED' } },
    });
    expect(run({ renewedById: 'next' }, '2026-11-10', 'REDUCE', 8, true)).toMatchObject({
      refusal: { details: { reason: 'ALREADY_CONTINUED' } },
    });
    // Several at once: the first of the list answers.
    expect(reason({ kind: 'PERPETUAL', status: 'DRAFT', renewedById: 'next', provisioningType: 'K4' })).toMatchObject({
      details: { reason: 'PERPETUAL' },
    });
    expect(reason({ status: 'DRAFT', renewedById: 'next' })).toMatchObject({ details: { reason: 'NOT_ACTIVE' } });
  });

  it('asks for the contract data when no date gives a point, after the reasons of step 2 and before the point (step 2, 4)', () => {
    expect(reason({ adjustment: null })).toEqual({ problem: 'CONTRACT_DATA_INCOMPLETE' });
    expect(reason({ adjustment: null, kind: 'PERPETUAL' })).toMatchObject({ problem: 'NOT_RENEWABLE' });
    expect(run({ adjustment: null }, '2026-10-01')).toEqual({ refusal: { problem: 'CONTRACT_DATA_INCOMPLETE' } });
  });

  it('refuses before the point with the day it opens and the deadline, and accepts it from that day to long after the end (step 4)', () => {
    expect(run({}, '2026-10-31')).toEqual({
      refusal: {
        problem: 'BEFORE_ADJUSTMENT_POINT',
        details: { adjustmentPointOn: '2026-11-01', deadline: '2026-12-01' },
      },
    });
    expect(run({}, '2026-11-01')).toEqual({ adjustment: adjustment() });
    // A result recorded after the renewal day is a late renewal, not a refusal (`QĐ-98e`).
    expect(run({}, '2027-02-15')).toEqual({ adjustment: adjustment() });
  });

  it('judges the point before the shape of the choice (step 4 before step 5)', () => {
    expect(run({}, '2026-10-31', 'CANCEL', 3)).toMatchObject({ refusal: { problem: 'BEFORE_ADJUSTMENT_POINT' } });
    expect(run({}, '2026-11-10', 'CANCEL', 3)).toEqual({ refusal: { problem: 'QUANTITY_INVALID' } });
  });

  it('fits the quantity to the choice: none to cancel, as bought to renew, fewer to reduce, more to increase (step 5)', () => {
    const shape = (choice: 'RENEW' | 'REDUCE' | 'INCREASE' | 'CANCEL', quantity: number | null) =>
      'refusal' in preflightOf({ period: period(), ending: false, today: '2026-11-10', choice, quantity })
        ? 'QUANTITY_INVALID'
        : null;

    expect(shape('CANCEL', null)).toBeNull();
    expect(shape('CANCEL', 0)).toBe('QUANTITY_INVALID');
    expect(shape('RENEW', 10)).toBeNull();
    expect(shape('RENEW', 9)).toBe('QUANTITY_INVALID');
    expect(shape('RENEW', null)).toBe('QUANTITY_INVALID');
    expect(shape('REDUCE', 8)).toBeNull();
    expect(shape('REDUCE', 10)).toBe('QUANTITY_INVALID');
    expect(shape('REDUCE', 12)).toBe('QUANTITY_INVALID');
    expect(shape('REDUCE', null)).toBe('QUANTITY_INVALID');
    expect(shape('INCREASE', 12)).toBeNull();
    expect(shape('INCREASE', 10)).toBe('QUANTITY_INVALID');
    expect(shape('INCREASE', 3)).toBe('QUANTITY_INVALID');
    expect(shape('INCREASE', null)).toBe('QUANTITY_INVALID');
    expect(shape('REDUCE', -1)).toBe('QUANTITY_INVALID');
  });
});

describe('what the counted seats say of the choice (SBF-20 §4.4 step 6)', () => {
  const choice = (
    extra: Partial<SeatsNeededCounts>,
    input: { choice: 'RENEW' | 'REDUCE' | 'INCREASE' | 'CANCEL'; quantity: number | null; note?: string },
  ) => countsRefusal(counts(extra), { note: null, ...input });

  it('accepts the exact target, and a cancellation only when the three conditions hold', () => {
    expect(choice({}, { choice: 'REDUCE', quantity: 8 })).toBeNull();
    expect(
      choice({ seatsNeeded: 0, target: 0, activeSeatsToday: 0, openRequests: 0 }, { choice: 'CANCEL', quantity: null }),
    ).toBeNull();
  });

  it('refuses a cancellation with its six counts, whichever of the three conditions fails (QĐ-104d(2))', () => {
    const all = {
      seatsNeeded: 8,
      heldPastRenewal: 6,
      pendingContinuations: 1,
      approvedAwaitingGrant: 1,
      activeSeatsToday: 7,
      openRequests: 1,
    };
    expect(choice({}, { choice: 'CANCEL', quantity: null })).toEqual({ problem: 'CANCEL_NOT_ALLOWED', details: all });
    expect(
      choice(
        {
          seatsNeeded: 0,
          target: 0,
          heldPastRenewal: 0,
          pendingContinuations: 0,
          approvedAwaitingGrant: 0,
          activeSeatsToday: 2,
          openRequests: 0,
        },
        { choice: 'CANCEL', quantity: null },
      ),
    ).toMatchObject({
      problem: 'CANCEL_NOT_ALLOWED',
      details: { activeSeatsToday: 2, openRequests: 0, seatsNeeded: 0 },
    });
    expect(
      choice({ seatsNeeded: 0, target: 0, activeSeatsToday: 0, openRequests: 3 }, { choice: 'CANCEL', quantity: null }),
    ).toMatchObject({ problem: 'CANCEL_NOT_ALLOWED', details: { openRequests: 3 } });
  });

  it('refuses a quantity that is not the target, with the numbers to count again, and a renewal when nothing is needed', () => {
    expect(choice({}, { choice: 'REDUCE', quantity: 7 })).toEqual({
      problem: 'QUANTITY_NOT_SEATS_NEEDED',
      details: { seatsNeeded: 8, vendorMinimumSeats: null, target: 8, quantity: 7 },
    });
    expect(choice({ seatsNeeded: 0, target: 0 }, { choice: 'RENEW', quantity: 10 })).toMatchObject({
      problem: 'QUANTITY_NOT_SEATS_NEEDED',
      details: { target: 0, quantity: 10 },
    });
  });

  it('asks for the evidence when the target is the vendor minimum above the need (QĐ-104d(1))', () => {
    const minimum = { seatsNeeded: 3, vendorMinimumSeats: 5, target: 5 };
    expect(choice(minimum, { choice: 'REDUCE', quantity: 5 })).toEqual({
      problem: 'VENDOR_MINIMUM_EVIDENCE_REQUIRED',
      details: { seatsNeeded: 3, vendorMinimumSeats: 5 },
    });
    expect(choice(minimum, { choice: 'REDUCE', quantity: 5, note: 'Contract clause 4.2' })).toBeNull();
  });
});

describe('the case that already stands for the period (SBF-20 §4.4 step 7, R2-1)', () => {
  const stored = (extra: Partial<RenewalRecord>): RenewalRecord =>
    ({
      id: 'case',
      subscriptionId: 'sub',
      state: 'OUTCOME_RECORDED',
      noticeBaseDate: '2026-12-01',
      ...extra,
    }) as RenewalRecord;

  it('finds the live case of the same deadline, whatever its state', () => {
    expect(existingCaseOf([stored({})], '2026-12-01')?.id).toBe('case');
    expect(existingCaseOf([stored({ state: 'PROPOSED' })], '2026-12-01')?.id).toBe('case');
    expect(existingCaseOf([stored({ noticeBaseDate: '2026-11-01' })], '2026-12-01')).toBeNull();
    expect(existingCaseOf([], '2026-12-01')).toBeNull();
  });

  it('finds a case left DECIDED before the one-write renewal, whose base date follows the old rule', () => {
    expect(
      existingCaseOf([stored({ state: 'DECIDED', noticeBaseDate: '2026-11-15', id: 'old' })], '2026-12-01')?.id,
    ).toBe('old');
    // A recorded case of another period does not stand for this one.
    expect(
      existingCaseOf([stored({ state: 'OUTCOME_RECORDED', noticeBaseDate: '2026-01-15' })], '2026-12-01'),
    ).toBeNull();
  });
});

describe('the notice basis written with the case (R2-6)', () => {
  it('follows the kind of the point, and the source of the deadline for a deadline', () => {
    expect(noticeBasisOf('PAYMENT_DATE', 'MISSING')).toBe('BY_PAYMENT_DATE');
    expect(noticeBasisOf('RENEWAL_DATE', 'MISSING')).toBe('BY_RENEWAL_DATE');
    expect(noticeBasisOf('END_DATE', 'BY_END_DATE')).toBe('BY_END_DATE');
    expect(noticeBasisOf('NOTICE_DEADLINE', 'DECLARED')).toBe('DECLARED');
    expect(noticeBasisOf('NOTICE_DEADLINE', 'INFERRED_UNCONFIRMED')).toBe('INFERRED_UNCONFIRMED');
  });
});

describe('a renewal the vendor made that the company did not choose (QĐ-106i(4), SBF-20 §4.4 step 10)', () => {
  const incident = (input: Parameters<typeof unintendedRenewalOf>[0]) => unintendedRenewalOf(input);

  it('is a period of more seats than chosen, whatever the choice, or a cancellation with a new period (A1C-05)', () => {
    expect(incident({ choice: 'RENEW', quantity: 8, outcome: 'DIFFERENT', nextQuantity: 20 })).toBe(true);
    expect(incident({ choice: 'INCREASE', quantity: 12, outcome: 'VENDOR_REFUSED', nextQuantity: 20 })).toBe(true);
    expect(incident({ choice: 'REDUCE', quantity: 8, outcome: 'VENDOR_REFUSED', nextQuantity: 10 })).toBe(true);
    expect(incident({ choice: 'REDUCE', quantity: 8, outcome: 'DIFFERENT', nextQuantity: 9 })).toBe(true);
    expect(incident({ choice: 'CANCEL', quantity: null, outcome: 'VENDOR_REFUSED', nextQuantity: 10 })).toBe(true);
  });

  it('is nothing when the new period has no more seats than chosen, none was recorded, or the outcome is as decided', () => {
    expect(incident({ choice: 'REDUCE', quantity: 8, outcome: 'DIFFERENT', nextQuantity: 8 })).toBe(false);
    expect(incident({ choice: 'REDUCE', quantity: 8, outcome: 'VENDOR_REFUSED', nextQuantity: null })).toBe(false);
    expect(incident({ choice: 'CANCEL', quantity: null, outcome: 'UNCONFIRMED', nextQuantity: null })).toBe(false);
    expect(incident({ choice: 'REDUCE', quantity: 8, outcome: 'AS_DECIDED', nextQuantity: 8 })).toBe(false);
    expect(incident({ choice: 'RENEW', quantity: 10, outcome: 'DIFFERENT', nextQuantity: 10 })).toBe(false);
  });
});

describe('whether a result was recorded after the renewal day (lateRenewal, QĐ-98e)', () => {
  const late = (noticeBasis: RenewalRecord['noticeBasis'], baseDate: string, recordedOn: string, extra = {}) =>
    lateRenewalOf({ noticeBasis, noticeBaseDate: baseDate }, period(extra), recordedOn);

  it('counts a plan by the year to its renewal day, which is the deadline itself when no later day is declared', () => {
    expect(late('DECLARED', '2026-12-01', '2027-01-01')).toBe(false);
    expect(late('DECLARED', '2026-12-01', '2027-01-02')).toBe(true);
    expect(late('BY_END_DATE', '2026-12-31', '2026-12-31', { renewalDate: null, endDate: '2026-12-31' })).toBe(false);
    expect(late('BY_END_DATE', '2026-12-31', '2027-01-01', { renewalDate: null, endDate: '2026-12-31' })).toBe(true);
    expect(late('BY_RENEWAL_DATE', '2027-01-01', '2027-01-02', { renewalDate: '2027-01-01', endDate: null })).toBe(
      true,
    );
  });

  it('counts a plan by the month to its payment day, which the date of the subscription does not say', () => {
    expect(late('BY_PAYMENT_DATE', '2026-12-01', '2026-12-01', { renewalDate: '2026-08-01' })).toBe(false);
    expect(late('BY_PAYMENT_DATE', '2026-12-01', '2026-12-02', { renewalDate: '2026-08-01' })).toBe(true);
  });
});

describe('the point of adjustment read before a result is recorded (SBF-20 §5, S20-T5)', () => {
  it('gives the adjustment of a live term of the shared pool even before its point has come', () => {
    expect(pointOf(period({}), false)).toEqual({ adjustment: adjustment() });
  });

  it('names why a subscription has no point, with the same reasons as the write (K1, K4, K5 and the others)', () => {
    expect(pointOf(period({ provisioningType: 'K1', ownerDepartmentId: 'dep' }), false)).toEqual({
      refusal: { problem: 'NOT_RENEWABLE', details: { reason: 'NOT_POOL_TERM' } },
    });
    expect(pointOf(period({ kind: 'PERPETUAL', provisioningType: 'K4' }), false)).toEqual({
      refusal: { problem: 'NOT_RENEWABLE', details: { reason: 'PERPETUAL' } },
    });
    expect(pointOf(period({ applicationKind: 'INTERNAL', provisioningType: 'K5' }), false)).toEqual({
      refusal: { problem: 'NOT_RENEWABLE', details: { reason: 'INTERNAL' } },
    });
  });

  it('names a subscription recorded as cancelled, which has no point to adjust any more (A1C-02)', () => {
    expect(pointOf(period({}), true)).toEqual({
      refusal: { problem: 'NOT_RENEWABLE', details: { reason: 'CANCELLED' } },
    });
  });

  it('asks for the contract data when no date gives a point', () => {
    expect(pointOf(period({ adjustment: null }), false)).toEqual({ refusal: { problem: 'CONTRACT_DATA_INCOMPLETE' } });
  });
});
