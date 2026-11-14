import { MAX_AMOUNT_MINOR } from '../../../core/money/money';
import {
  bearingDepartmentOf,
  judgeYearStart,
  lastDayOfSeat,
  seatCountsOn,
  yearStartAmountOf,
  type YearStartPrice,
  type YearStartSeat,
} from './year-start-commitments.policy';

const MONTHLY: YearStartPrice = {
  kind: 'RECURRING',
  unitPrice: { amountMinor: 20000n, currency: 'VND' },
  billingCycle: 'MONTHLY',
};
const seat = (patch: Partial<YearStartSeat> = {}): YearStartSeat => ({
  expectedEndDate: null,
  validUntil: null,
  departmentId: null,
  termLimited: false,
  savedMinor: null,
  ...patch,
});
const amount = (seats: readonly YearStartSeat[], price: YearStartPrice | null = MONTHLY) =>
  yearStartAmountOf({ year: 2027, seats, price });

describe('BR-MF1-09: the commitment made on 01/01 for a right that goes on', () => {
  describe('the day a seat is last counted', () => {
    it.each([
      ['no end at all', seat(), null],
      ['an expected end date', seat({ expectedEndDate: '2027-03-31' }), '2027-03-31'],
      ['a period that ends the day before `validUntil` (half-open)', seat({ validUntil: '2027-04-01' }), '2027-03-31'],
      ['the earlier of the two', seat({ expectedEndDate: '2027-06-30', validUntil: '2027-04-01' }), '2027-03-31'],
    ])('BR-MF1-09e: %s', (_name, term, last) => {
      expect(lastDayOfSeat(term)).toBe(last);
    });

    it('BR-MF1-09e: a seat that ended before 01/01 is not counted, one that ends on 01/01 is', () => {
      expect(seatCountsOn(seat({ expectedEndDate: '2026-12-31' }), '2027-01-01')).toBe(false);
      expect(seatCountsOn(seat({ validUntil: '2027-01-01' }), '2027-01-01')).toBe(false);
      expect(seatCountsOn(seat({ expectedEndDate: '2027-01-01' }), '2027-01-01')).toBe(true);
      expect(seatCountsOn(seat(), '2027-01-01')).toBe(true);
    });
  });

  describe('the amount: the price of a month on 01/01 times the months of the year, for every seat', () => {
    it('BR-MF1-09e: ten seats with no end cost twelve months of each (FR-5.8: 10 × 12 × 200)', () => {
      expect(amount(Array.from({ length: 10 }, () => seat()))).toEqual({
        status: 'PRICED',
        amountMinor: 2_400_000n,
        seatMonthlyMinor: 20000n,
        currency: 'VND',
      });
    });

    it.each([
      ['31/03', '2027-03-31', 3n],
      ['15/03 (the month of the end counts whole)', '2027-03-15', 3n],
      ['01/01 (one month)', '2027-01-01', 1n],
      ['31/12', '2027-12-31', 12n],
      ['a later year', '2028-05-10', 12n],
    ])('BR-MF1-09e: a right that ends on %s costs the months up to that month', (_name, end, months) => {
      expect(amount([seat({ expectedEndDate: end })])).toMatchObject({
        status: 'PRICED',
        amountMinor: 20000n * months,
      });
    });

    it('BR-MF1-09e: seats that end on different days are added up one by one', () => {
      expect(amount([seat(), seat({ expectedEndDate: '2027-03-31' })])).toMatchObject({
        status: 'PRICED',
        amountMinor: 20000n * 12n + 20000n * 3n,
      });
    });

    it('BR-MF1-09e: a quarterly price is a third of it a month; a fraction of a minor unit is paid in full', () => {
      expect(
        amount([seat()], {
          ...MONTHLY,
          billingCycle: 'QUARTERLY',
          unitPrice: { amountMinor: 60000n, currency: 'VND' },
        }),
      ).toMatchObject({ amountMinor: 240000n, seatMonthlyMinor: 20000n });
      expect(
        amount([seat()], { ...MONTHLY, billingCycle: 'ANNUAL', unitPrice: { amountMinor: 100n, currency: 'VND' } }),
      ).toMatchObject({ seatMonthlyMinor: 9n });
    });

    it('BR-MF1-09e: a seat already over before 01/01 is left out of the amount', () => {
      expect(amount([seat({ expectedEndDate: '2026-12-31' }), seat()])).toMatchObject({ amountMinor: 240000n });
    });
  });

  describe('QĐ-111ak: a right with a time of use holds what the approval kept, a right with no end the price of 01/01', () => {
    const at = (monthly: bigint): YearStartPrice => ({
      ...MONTHLY,
      unitPrice: { amountMinor: monthly, currency: 'VND' },
    });
    /** A seat of a request for months of use, which kept `saved` of the year after at its approval. */
    const limited = (saved: bigint | null, patch: Partial<YearStartSeat> = {}) =>
      seat({ termLimited: true, expectedEndDate: '2027-08-14', savedMinor: saved, ...patch });

    it('T-RQ2 (K1): 600.000 a month for 9 months approved on 15/11/2026 kept 4.200.000; on 01/01 the price is 650.000 and the commitment stays 4.200.000', () => {
      expect(amount([limited(4_200_000n)], at(650_000n))).toEqual({
        status: 'PRICED',
        amountMinor: 4_200_000n,
        seatMonthlyMinor: 650_000n,
        currency: 'VND',
      });
    });

    it('T-RQ2 (K2 with no end): kept 4.500.000 at 375.000 a month, and the commitment is twelve months of the price on 01/01, 400.000: 4.800.000, the kept number is for the warning only (R-46)', () => {
      expect(amount([seat({ savedMinor: 4_500_000n })], at(400_000n))).toMatchObject({
        status: 'PRICED',
        amountMinor: 4_800_000n,
      });
    });

    it('QĐ-111ak: a price that falls changes nothing either: the commitment is what the approval kept', () => {
      expect(amount([limited(4_200_000n)], at(500_000n))).toMatchObject({ amountMinor: 4_200_000n });
    });

    it('T-XY1: three people of a group each kept 7 months at 600.000 (4.200.000) hold 12.600.000; one who leaves on 20/12 holds nothing, so 8.400.000 (M-13)', () => {
      const group = [limited(4_200_000n), limited(4_200_000n), limited(4_200_000n)];
      expect(amount(group, at(650_000n))).toMatchObject({ amountMinor: 12_600_000n });

      const oneLeft = [group[0], group[1], limited(4_200_000n, { expectedEndDate: '2026-12-20' })];
      expect(amount(oneLeft, at(650_000n))).toMatchObject({ amountMinor: 8_400_000n });
      expect(judgeYearStart({ year: 2027, seats: oneLeft, price: at(650_000n), costCenterId: 'cc-1' })).toMatchObject({
        status: 'COMMIT',
        amountMinor: 8_400_000n,
      });
    });

    it('QĐ-111ak: a person whose seat was closed on 20/12 (the period ends the day after) is no more counted than one who left', () => {
      const closed = limited(4_200_000n, { expectedEndDate: null, validUntil: '2026-12-21' });
      expect(amount([limited(4_200_000n), closed], at(650_000n))).toMatchObject({ amountMinor: 4_200_000n });
    });

    it('QĐ-111ak: a seat that closes in the new year before the term the approval counted holds the months to that day at the price of 01/01, not the kept number', () => {
      const closing = limited(4_200_000n, { validUntil: '2027-03-01' });
      expect(amount([closing], at(650_000n))).toMatchObject({ amountMinor: 2n * 650_000n });
    });

    it('a request of an older release kept nothing: its seat is counted by the months to its end at the price of 01/01, as before', () => {
      expect(amount([limited(null, { expectedEndDate: '2027-03-31' })], at(650_000n))).toMatchObject({
        amountMinor: 3n * 650_000n,
      });
    });

    it('seats with and without a kept number are added up one by one', () => {
      expect(
        amount([limited(4_200_000n), seat(), limited(null, { expectedEndDate: '2027-02-28' })], at(650_000n)),
      ).toMatchObject({ amountMinor: 4_200_000n + 12n * 650_000n + 2n * 650_000n });
    });

    it('QĐ-111an: a price in another currency than dong holds nothing even when the approval kept a number', () => {
      expect(amount([limited(4_200_000n)], { ...MONTHLY, unitPrice: { amountMinor: 2000n, currency: 'USD' } })).toEqual(
        { status: 'SKIPPED', reason: 'NO_PRICE' },
      );
    });

    it('a kept number added up with others past what a money value may hold is told as such', () => {
      const huge = limited(MAX_AMOUNT_MINOR);
      expect(amount([huge, limited(1n)], at(650_000n))).toEqual({ status: 'SKIPPED', reason: 'AMOUNT_TOO_LARGE' });
    });
  });

  describe('what makes no commitment', () => {
    it('BR-MF1-09e: no seat left on 01/01 ⟹ nothing to commit', () => {
      expect(amount([])).toEqual({ status: 'SKIPPED', reason: 'NO_SEAT' });
      expect(amount([seat({ expectedEndDate: '2026-06-30' })])).toEqual({ status: 'SKIPPED', reason: 'NO_SEAT' });
    });

    it('BR-MF1-09e: no priced subscription, a price of nothing or a one-time price ⟹ no price to commit', () => {
      expect(amount([seat()], null)).toEqual({ status: 'SKIPPED', reason: 'NO_PRICE' });
      expect(amount([seat()], { ...MONTHLY, unitPrice: { amountMinor: 0n, currency: 'VND' } })).toEqual({
        status: 'SKIPPED',
        reason: 'NO_PRICE',
      });
      expect(amount([seat()], { ...MONTHLY, kind: 'ONE_TIME', billingCycle: 'OTHER' })).toEqual({
        status: 'SKIPPED',
        reason: 'NO_PRICE',
      });
      expect(amount([seat()], { ...MONTHLY, billingCycle: 'OTHER' })).toEqual({
        status: 'SKIPPED',
        reason: 'NO_PRICE',
      });
    });

    it('QĐ-111an: a price left in another currency is no price to commit: nothing converts it and nothing is held in its own currency', () => {
      expect(amount([seat()], { ...MONTHLY, unitPrice: { amountMinor: 2000n, currency: 'USD' } })).toEqual({
        status: 'SKIPPED',
        reason: 'NO_PRICE',
      });
    });

    it('BR-MF1-09e: an amount larger than a money value may hold is told as such, not as a missing price', () => {
      const huge: YearStartPrice = { ...MONTHLY, unitPrice: { amountMinor: 10n ** 15n, currency: 'VND' } };
      expect(amount([seat()], huge)).toEqual({ status: 'SKIPPED', reason: 'AMOUNT_TOO_LARGE' });
      // Each end date is within the range, the two together are not.
      const large: YearStartPrice = { ...MONTHLY, unitPrice: { amountMinor: 5n * 10n ** 13n, currency: 'VND' } };
      expect(amount([seat(), seat({ expectedEndDate: '2027-11-30' })], large)).toEqual({
        status: 'SKIPPED',
        reason: 'AMOUNT_TOO_LARGE',
      });
    });
  });
});

describe('BR-MF1-09e: the department that bears the cost of a request on 01/01', () => {
  const bearing = (seats: readonly YearStartSeat[]) =>
    bearingDepartmentOf({ year: 2027, seats, requestDepartmentId: 'dep-request' });

  it('BR-MF1-09e: a seat handed over to another department is borne by that department, not by the one of the request', () => {
    expect(bearing([seat({ departmentId: 'dep-new' })])).toBe('dep-new');
  });

  it('BR-MF1-09e: a seat not granted yet, or one whose record names no department, is borne by the department of the request', () => {
    expect(bearing([seat()])).toBe('dep-request');
    expect(bearing([])).toBe('dep-request');
  });

  it('BR-MF1-09e: seats borne by more than one department leave the commitment, which is one, with the department of the request', () => {
    expect(bearing([seat({ departmentId: 'dep-a' }), seat({ departmentId: 'dep-b' })])).toBe('dep-request');
  });

  it('BR-MF1-09e: a seat that is over on 01/01 bears nothing', () => {
    expect(
      bearing([seat({ departmentId: 'dep-old', expectedEndDate: '2026-12-31' }), seat({ departmentId: 'dep-new' })]),
    ).toBe('dep-new');
  });
});

describe('BR-MF1-09e: what the pass does with one request', () => {
  const judge = (patch: Partial<Parameters<typeof judgeYearStart>[0]> = {}) =>
    judgeYearStart({ year: 2027, seats: [seat()], price: MONTHLY, costCenterId: 'cc-1', ...patch });

  it('BR-MF1-09e: commits the amount in the Cost Center of the department', () => {
    expect(judge()).toEqual({
      status: 'COMMIT',
      amountMinor: 240000n,
      seatMonthlyMinor: 20000n,
      currency: 'VND',
      costCenterId: 'cc-1',
    });
  });

  it('BR-MF1-09e: a department with no Cost Center in use is left out with its reason', () => {
    expect(judge({ costCenterId: null })).toEqual({ status: 'LEFT_OUT', reason: 'NO_COST_CENTER' });
  });

  it('BR-MF1-09e: a plan with no price is left out with its reason, a request with no seat left has nothing to commit', () => {
    expect(judge({ price: null })).toEqual({ status: 'LEFT_OUT', reason: 'NO_PRICE' });
    expect(judge({ seats: [seat({ expectedEndDate: '2026-12-31' })] })).toEqual({ status: 'NOTHING' });
    // No seat is judged before the Cost Center: a request that is over is never reported as missing one.
    expect(judge({ seats: [], costCenterId: null })).toEqual({ status: 'NOTHING' });
  });

  it('QĐ-111an: a plan priced in another currency is left out as a plan with no price', () => {
    expect(judge({ price: { ...MONTHLY, unitPrice: { amountMinor: 2000n, currency: 'USD' } } })).toEqual({
      status: 'LEFT_OUT',
      reason: 'NO_PRICE',
    });
  });

  it('BR-MF1-09e: an amount too large is left out with that reason', () => {
    expect(judge({ price: { ...MONTHLY, unitPrice: { amountMinor: 10n ** 15n, currency: 'VND' } } })).toEqual({
      status: 'LEFT_OUT',
      reason: 'AMOUNT_TOO_LARGE',
    });
  });
});
