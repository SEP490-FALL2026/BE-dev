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

  it('BR-MF1-09e: an amount too large is left out with that reason', () => {
    expect(judge({ price: { ...MONTHLY, unitPrice: { amountMinor: 10n ** 15n, currency: 'VND' } } })).toEqual({
      status: 'LEFT_OUT',
      reason: 'AMOUNT_TOO_LARGE',
    });
  });
});
