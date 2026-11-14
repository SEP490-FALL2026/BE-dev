import {
  adjustmentPointOf,
  expiryReading,
  increasesObligation,
  type AdjustmentInput,
  type ObligationState,
} from './subscription-obligation.policy';

const price = (amountMinor: bigint, currency = 'VND'): ObligationState['unitPrice'] => ({
  amountMinor,
  currency,
  recordedOn: '2026-10-01',
});
const snapshot = (reportingMinor: bigint): ObligationState['priceSnapshot'] => ({
  rate: 1n,
  rateDate: '2026-10-01',
  rateSource: 'MANUAL',
  reportingMinor,
  reportingCurrency: 'VND',
  exchangeRateId: null,
});
const stored: ObligationState = {
  purchasedQuantity: 10,
  unitPrice: price(1_000n),
  priceSnapshot: snapshot(1_000n),
  endDate: '2026-12-31',
  renewalDate: '2026-12-31',
  autoRenew: false,
};

/** A name, what changes and, when the stored state is not the usual one, how it differs. */
type Row = [name: string, change: Partial<ObligationState>, from?: Partial<ObligationState>];

describe('what a change of a subscription creates, raises or extends (F26, spec L.7, P03-D09 = A)', () => {
  const raises: Row[] = [
    ['more seats bought', { purchasedQuantity: 11 }],
    ['a quantity where there was none', { purchasedQuantity: 3 }, { purchasedQuantity: null }],
    ['the end date later than the stored one', { endDate: '2027-01-01' }],
    ['an end date where there was none', { endDate: '2027-01-01' }, { endDate: null }],
    ['the renewal date later than the stored one', { renewalDate: '2027-01-01' }],
    ['a renewal date where there was none', { renewalDate: '2027-01-01' }, { renewalDate: null }],
    ['auto renewal switched from off to on', { autoRenew: true }],
    ['a higher unit price in the same currency', { unitPrice: price(1_001n), priceSnapshot: snapshot(1_001n) }],
    ['a unit price where there was none', { unitPrice: price(500n) }, { unitPrice: null, priceSnapshot: null }],
    [
      'a price in another currency whose reporting value is higher',
      { unitPrice: price(10n, 'USD'), priceSnapshot: snapshot(2_000n) },
    ],
    [
      'a price in another currency that cannot be shown to be no higher (no conversion)',
      { unitPrice: price(10n, 'USD'), priceSnapshot: null },
    ],
  ];
  const keeps: Row[] = [
    ['nothing changed', {}],
    ['fewer seats bought', { purchasedQuantity: 5 }],
    ['the quantity cleared', { purchasedQuantity: null }],
    ['the end date earlier than the stored one', { endDate: '2026-06-30' }],
    ['the end date cleared', { endDate: null }],
    ['the renewal date earlier than the stored one', { renewalDate: '2026-06-30' }],
    ['auto renewal switched from on to off', { autoRenew: false }, { autoRenew: true }],
    ['the same price again', { unitPrice: price(1_000n) }],
    ['a lower unit price in the same currency', { unitPrice: price(999n), priceSnapshot: snapshot(999n) }],
    [
      'a price in another currency whose reporting value is lower',
      { unitPrice: price(10n, 'USD'), priceSnapshot: snapshot(900n) },
    ],
    ['the price cleared', { unitPrice: null, priceSnapshot: null }],
  ];

  it.each(raises)('says it does: %s', (_name, change, from = {}) => {
    expect(increasesObligation({ ...stored, ...from }, { ...stored, ...from, ...change })).toBe(true);
  });

  it.each(keeps)('says it does not: %s', (_name, change, from = {}) => {
    expect(increasesObligation({ ...stored, ...from }, { ...stored, ...from, ...change })).toBe(false);
  });

  it('counts auto renewal that was already on, with a later date, only for the date', () => {
    const on = { ...stored, autoRenew: true };

    expect(increasesObligation(on, { ...on })).toBe(false);
    expect(increasesObligation(on, { ...on, endDate: '2027-06-30' })).toBe(true);
  });
});

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
  kind: 'TERM',
  commitmentTermMonths: 1,
  billingCycle: 'MONTHLY',
  noticeDeadline: null,
  noticePeriodDays: null,
  renewalDate: '2026-12-15',
  endDate: null,
  autoRenew: true,
  ...extra,
});

describe('adjustmentPointOf: where the IT Admin adjusts a subscription before its next period (`FR-1.4`, `QĐ-111o`)', () => {
  describe('a plan bought by the year', () => {
    it('opens 30 days before the deadline to cancel (a figure the IT Admin declared)', () => {
      expect(adjustmentPointOf(annual({ noticeDeadline: '2026-12-20' }))).toEqual({
        kind: 'NOTICE_DEADLINE',
        deadline: '2026-12-20',
        point: '2026-11-20',
      });
    });

    it('counts the deadline back from the renewal date by the days of notice when none is declared', () => {
      expect(adjustmentPointOf(annual({ noticePeriodDays: 30 }))).toEqual({
        kind: 'NOTICE_DEADLINE',
        deadline: '2026-12-01',
        point: '2026-11-01',
      });
    });

    it('takes the renewal date when there is neither a deadline nor days of notice and the plan renews itself (QĐ-106i)', () => {
      expect(adjustmentPointOf(annual({ autoRenew: true }))).toEqual({
        kind: 'RENEWAL_DATE',
        deadline: '2026-12-31',
        point: '2026-12-01',
      });
    });

    it('takes the end date when there is no way to cancel and the plan does not renew itself', () => {
      expect(adjustmentPointOf(annual({ autoRenew: false, renewalDate: null, endDate: '2026-12-31' }))).toEqual({
        kind: 'END_DATE',
        deadline: '2026-12-31',
        point: '2026-12-01',
      });
    });

    it('has no point when no date to count from is known: nothing is guessed', () => {
      expect(adjustmentPointOf(annual({ renewalDate: null, endDate: null }))).toBeNull();
      expect(adjustmentPointOf(annual({ autoRenew: false, renewalDate: '2026-12-31', endDate: null }))).toBeNull();
    });
  });

  describe('a plan bought by the month', () => {
    it('opens 7 days before the payment day, whatever the deadline to cancel says', () => {
      expect(adjustmentPointOf(monthly({ noticeDeadline: '2026-12-01' }))).toEqual({
        kind: 'PAYMENT_DATE',
        deadline: '2026-12-15',
        point: '2026-12-08',
      });
    });

    it('takes the end date when no renewal date is known, and has no point with neither', () => {
      expect(adjustmentPointOf(monthly({ renewalDate: null, endDate: '2026-12-20' }))?.deadline).toBe('2026-12-20');
      expect(adjustmentPointOf(monthly({ renewalDate: null, endDate: null }))).toBeNull();
    });

    it('is a plan by the month when it names no commitment but is paid by the month (a personal plan, K1)', () => {
      expect(adjustmentPointOf(monthly({ commitmentTermMonths: null }))?.point).toBe('2026-12-08');
      expect(adjustmentPointOf(annual({ commitmentTermMonths: null, noticeDeadline: '2026-12-20' }))?.point).toBe(
        '2026-11-20',
      );
    });
  });

  it('has none for a purchase made once: it has no period, so it never enters a list of what ends (a K4 key)', () => {
    expect(
      adjustmentPointOf(
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

describe('expiryReading: whether a subscription is near or past its point today', () => {
  const point = { kind: 'NOTICE_DEADLINE' as const, deadline: '2026-12-20', point: '2026-11-20' };

  it('says nothing before the point, with the days that are left', () => {
    expect(expiryReading(point, '2026-11-19', true)).toEqual({ state: null, daysLeft: 31 });
  });

  it('is SOON from the day of the point to the day of the deadline, with the days left to it', () => {
    expect(expiryReading(point, '2026-11-20', true)).toEqual({ state: 'SOON', daysLeft: 30 });
    expect(expiryReading(point, '2026-12-20', false)).toEqual({ state: 'SOON', daysLeft: 0 });
  });

  it('is EXPIRED the day after the deadline, as many days past as negative days left, while seats are still held', () => {
    expect(expiryReading(point, '2026-12-21', true)).toEqual({ state: 'EXPIRED', daysLeft: -1 });
    expect(expiryReading(point, '2027-01-05', true)).toEqual({ state: 'EXPIRED', daysLeft: -16 });
  });

  it('is not EXPIRED when nobody holds a seat any more: nothing is left to adjust (QĐ-98e)', () => {
    expect(expiryReading(point, '2026-12-21', false)).toEqual({ state: null, daysLeft: -1 });
  });

  it('says nothing, with no days, when there is no point', () => {
    expect(expiryReading(null, '2026-11-15', true)).toEqual({ state: null, daysLeft: null });
  });
});
