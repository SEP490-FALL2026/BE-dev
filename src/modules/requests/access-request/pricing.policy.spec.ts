import { termRunOf } from '../../../core/term-limit';
import { pricingRecordFor, requestAmountOf, seatMonthlyOf, type PricingInput } from './pricing.policy';

const SEAT = { amountMinor: 2000n, currency: 'USD' }; // 20.00 per seat per month

const input = (patch: Partial<PricingInput> = {}): PricingInput => ({
  kind: 'RECURRING',
  unitPrice: SEAT,
  billingCycle: 'MONTHLY',
  beneficiaries: 1,
  checkDate: '2026-11-10',
  endDate: null,
  ...patch,
});

describe('BR-MF1-06 shared intake and worker pricing record', () => {
  const request = { planId: 'plan', free: false, beneficiaries: 2, checkDate: '2026-11-10', endDate: null };

  it('keeps the same current-year amount and metadata for both callers', () => {
    expect(pricingRecordFor(request, { kind: 'RECURRING', unitPrice: SEAT, billingCycle: 'MONTHLY' })).toMatchObject({
      status: 'PRICED',
      amount: { amountMinor: 8000n, currency: 'USD' },
      amountMonths: 2,
      budgetYear: 2026,
      expectedEndDate: null,
      // A right with no end holds twelve months of the next year (R-46).
      nextYearAmount: { amountMinor: 48000n },
    });
  });

  it('preserves missing-price and internal-free records without guessing an amount', () => {
    expect(pricingRecordFor(request, null)).toMatchObject({
      status: 'MISSING',
      missingReason: 'NO_PRICED_SUBSCRIPTION',
      amount: null,
    });
    expect(pricingRecordFor({ ...request, free: true }, null)).toMatchObject({
      status: 'NOT_APPLICABLE',
      budgetYear: null,
      amount: null,
    });
  });

  it('keeps a full next-year renewal at zero this year and shows next year to the approver', () => {
    expect(
      pricingRecordFor(
        { ...request, from: '2027-01-01', endDate: '2027-12-31' },
        {
          kind: 'RECURRING',
          unitPrice: SEAT,
          billingCycle: 'MONTHLY',
        },
      ),
    ).toMatchObject({
      status: 'PRICED',
      amount: { amountMinor: 0n },
      budgetYear: 2026,
      nextYearAmount: { amountMinor: 48000n },
    });
  });
});

describe('BR-MF1-06: the amount of a request is the price of the months left of the year', () => {
  it('BR-MF1-06a: with no end date it runs to the end of the year, the month it starts counted whole (sent 10/11 ⟹ 2 months)', () => {
    expect(requestAmountOf(input())).toMatchObject({
      status: 'PRICED',
      kind: 'RECURRING',
      months: 2,
      amount: { amountMinor: 4000n, currency: 'USD' },
      budgetYear: 2026,
      nextYearAmount: { amountMinor: 24000n, currency: 'USD' },
    });
  });

  it('BR-MF1-06b: the ten people of the example of FR-3.20 for seven months (June to December) cost 14 000', () => {
    expect(
      requestAmountOf(
        input({ unitPrice: { amountMinor: 200n, currency: 'USD' }, beneficiaries: 10, checkDate: '2026-06-15' }),
      ),
    ).toMatchObject({ months: 7, amount: { amountMinor: 14_000n } });
  });

  it('BR-MF1-06c: an end date inside the year stops the count in its month (sent 10/07, ends 19/10 ⟹ 4 months)', () => {
    expect(requestAmountOf(input({ checkDate: '2026-07-10', endDate: '2026-10-19' }))).toMatchObject({
      months: 4,
      amount: { amountMinor: 8000n },
    });
  });

  it('BR-MF1-06c: an end date after the year does not count past 31/12 (starts 01/10, ends 31/03 next year ⟹ 3 months)', () => {
    expect(requestAmountOf(input({ checkDate: '2026-10-01', endDate: '2027-03-31' }))).toMatchObject({ months: 3 });
  });

  it('BR-MF1-06c: an end date before the day it starts still costs the month it starts', () => {
    expect(requestAmountOf(input({ checkDate: '2026-10-15', endDate: '2026-10-01' }))).toMatchObject({ months: 1 });
  });

  it('BR-MF1-06d: an annual price is a twelfth of the year a month, rounded up once', () => {
    expect(
      requestAmountOf(
        input({
          billingCycle: 'ANNUAL',
          unitPrice: { amountMinor: 240_000n, currency: 'USD' },
          beneficiaries: 10,
          checkDate: '2026-06-15',
        }),
      ),
    ).toMatchObject({ months: 7, amount: { amountMinor: 1_400_000n } });
    expect(
      requestAmountOf(
        input({ billingCycle: 'ANNUAL', unitPrice: { amountMinor: 1000n, currency: 'USD' }, checkDate: '2026-12-01' }),
      ),
    ).toMatchObject({ months: 1, amount: { amountMinor: 84n } });
  });

  it('BR-MF1-06d: a quarterly price is a third of the price a month', () => {
    expect(
      requestAmountOf(
        input({
          billingCycle: 'QUARTERLY',
          unitPrice: { amountMinor: 300n, currency: 'USD' },
          checkDate: '2026-10-01',
        }),
      ),
    ).toMatchObject({ months: 3, amount: { amountMinor: 300n } });
  });

  it('is counted in the year of the check date: the day of 31/12 and the day of 01/01 fall in two years (R-I01)', () => {
    expect(requestAmountOf(input({ checkDate: '2026-12-31' }))).toMatchObject({ budgetYear: 2026, months: 1 });
    expect(requestAmountOf(input({ checkDate: '2027-01-01' }))).toMatchObject({ budgetYear: 2027, months: 12 });
  });
});

describe('QĐ-109b: a request to go on using, whose new period begins in the year after the check date', () => {
  it('costs nothing this year and shows what the next year would cost', () => {
    const priced = requestAmountOf(input({ checkDate: '2026-12-10', from: '2027-01-01', endDate: '2027-03-31' }));

    expect(priced).toMatchObject({
      status: 'PRICED',
      months: 0,
      amount: { amountMinor: 0n },
      budgetYear: 2026,
      nextYearAmount: { amountMinor: 6000n },
    });
  });

  it('is priced for the months of the new year when it is checked there (approved 05/01 ⟹ 3 months of 2027)', () => {
    expect(
      requestAmountOf(input({ checkDate: '2027-01-05', from: '2027-01-01', endDate: '2027-03-31' })),
    ).toMatchObject({
      months: 3,
      amount: { amountMinor: 6000n },
      budgetYear: 2027,
      nextYearAmount: null,
    });
  });

  it('US-05-23 AC-6: a period 01/07 to 30/09 sent on 05/06 is three months', () => {
    expect(
      requestAmountOf(
        input({
          unitPrice: { amountMinor: 200n, currency: 'USD' },
          checkDate: '2026-06-05',
          from: '2026-07-01',
          endDate: '2026-09-30',
        }),
      ),
    ).toMatchObject({ months: 3, amount: { amountMinor: 600n } });
  });
});

describe('BR-MF1-07: a one-time price (a key, a perpetual license) is the price of the purchase (QĐ-106d)', () => {
  it('is the unit price times the people, whatever the term', () => {
    const priced = requestAmountOf(
      input({
        kind: 'ONE_TIME',
        beneficiaries: 2,
        unitPrice: { amountMinor: 500n, currency: 'USD' },
        endDate: '2026-12-01',
      }),
    );

    expect(priced).toMatchObject({
      status: 'PRICED',
      kind: 'ONE_TIME',
      months: null,
      amount: { amountMinor: 1000n },
      billingCycle: 'OTHER',
    });
  });

  it('does not depend on the day it is bought', () => {
    expect(requestAmountOf(input({ kind: 'ONE_TIME', checkDate: '2026-01-02' }))).toMatchObject({
      amount: { amountMinor: 2000n },
    });
    expect(requestAmountOf(input({ kind: 'ONE_TIME', checkDate: '2026-12-30' }))).toMatchObject({
      amount: { amountMinor: 2000n },
    });
  });
});

describe('what is not priced (US-05-02 AC-4, QĐ-84e)', () => {
  it('has no price when the plan has no priced subscription, and keeps the year of its date', () => {
    expect(requestAmountOf(input({ unitPrice: null, billingCycle: null }))).toEqual({
      status: 'MISSING',
      reason: 'NO_PRICED_SUBSCRIPTION',
      budgetYear: 2026,
    });
  });

  it('has no price when the plan has a subscription priced at nothing: a paid request never costs 0 (F34, FR-3.2)', () => {
    expect(requestAmountOf(input({ unitPrice: { amountMinor: 0n, currency: 'USD' } }))).toEqual({
      status: 'MISSING',
      reason: 'NO_PRICED_SUBSCRIPTION',
      budgetYear: 2026,
    });
  });

  it('has no price when the billing cycle is not one that can be counted in months', () => {
    expect(requestAmountOf(input({ billingCycle: 'OTHER' }))).toMatchObject({
      status: 'MISSING',
      reason: 'CYCLE_UNKNOWN',
    });
  });

  it('is refused when the amount is beyond what a request holds', () => {
    expect(
      requestAmountOf(input({ unitPrice: { amountMinor: 10n ** 18n, currency: 'USD' }, beneficiaries: 1000 })),
    ).toMatchObject({ status: 'MISSING', reason: 'AMOUNT_TOO_LARGE' });
  });
});

describe('T-RQ2: the commitment is the price of a month times the months that begin, split by the year each begins in (QĐ-111j, R-39, R-46)', () => {
  const dong = (amountMinor: bigint) => ({ amountMinor, currency: 'VND' });
  const k1 = { kind: 'RECURRING' as const, unitPrice: dong(600_000n), billingCycle: 'MONTHLY' as const };

  it('K1 600.000 for 9 months, approved 15/11/2026: 2026 is 1.200.000 and the part of next year is 4.200.000', () => {
    const run = termRunOf({ start: '2026-11-15', months: 9, contractEndDate: null });

    expect(requestAmountOf({ ...k1, beneficiaries: 1, checkDate: '2026-11-15', endDate: run.end })).toMatchObject({
      status: 'PRICED',
      months: 2,
      amount: { amountMinor: 1_200_000n },
      budgetYear: 2026,
      nextYearAmount: { amountMinor: 4_200_000n },
    });
  });

  it('K2 Dùng lâu dài 375.000, approved 20/11/2026: 2026 is 750.000 and the part of next year is 12 months, 4.500.000', () => {
    expect(
      requestAmountOf({
        kind: 'RECURRING',
        unitPrice: dong(375_000n),
        billingCycle: 'MONTHLY',
        beneficiaries: 1,
        checkDate: '2026-11-20',
        endDate: null,
      }),
    ).toMatchObject({
      months: 2,
      amount: { amountMinor: 750_000n },
      nextYearAmount: { amountMinor: 4_500_000n },
    });
  });

  it('a term that ends inside the year has no part of next year', () => {
    const run = termRunOf({ start: '2026-03-10', months: 6, contractEndDate: null });

    expect(requestAmountOf({ ...k1, beneficiaries: 1, checkDate: '2026-03-10', endDate: run.end })).toMatchObject({
      months: 6,
      amount: { amountMinor: 3_600_000n },
      nextYearAmount: null,
    });
  });

  it('the price of a month of an annual price is a twelfth, rounded up once, and the twelve months of next year keep it', () => {
    expect(
      requestAmountOf({
        kind: 'RECURRING',
        unitPrice: dong(1_000n),
        billingCycle: 'ANNUAL',
        beneficiaries: 1,
        checkDate: '2026-12-01',
        endDate: null,
      }),
    ).toMatchObject({ months: 1, amount: { amountMinor: 84n }, nextYearAmount: { amountMinor: 1_000n } });
  });
});

describe('T-R38: a person with a term is cut at the end of the contract and each month that begins counts (R-38, R-39)', () => {
  const k1 = { planId: 'plan', free: false, checkDate: '2026-11-10' };
  const price = {
    kind: 'RECURRING' as const,
    unitPrice: { amountMinor: 600_000n, currency: 'VND' },
    billingCycle: 'MONTHLY' as const,
  };
  const endOf = (contractEndDate: string | null) => termRunOf({ start: '2026-11-10', months: 9, contractEndDate }).end;

  it('an intern whose contract ends 31/01/2027, K1 for 9 months sent 10/11/2026: 3 months begin, 1.800.000 in all (2026: 1.200.000, next year 600.000)', () => {
    expect(pricingRecordFor({ ...k1, beneficiaries: 1, endDate: endOf('2027-01-31') }, price)).toMatchObject({
      status: 'PRICED',
      amountMonths: 2,
      amount: { amountMinor: 1_200_000n },
      nextYearAmount: { amountMinor: 600_000n },
    });
  });

  it('a group prices each person for their own end: only the line of the intern is cut', () => {
    const record = pricingRecordFor(
      { ...k1, beneficiaries: 3, endDate: null, endsByPerson: [endOf(null), endOf('2027-01-31'), endOf(null)] },
      price,
    );

    // staff: 2 months in 2026 (1.200.000) and 7 in 2027 (4.200.000) each; the intern: 1.200.000 and 600.000.
    expect(record).toMatchObject({
      status: 'PRICED',
      amountMonths: 2,
      amount: { amountMinor: 3_600_000n },
      nextYearAmount: { amountMinor: 9_000_000n },
    });
  });

  it('a group of people who all end on the same day is the same as the amount of one person times them', () => {
    const one = pricingRecordFor({ ...k1, beneficiaries: 1, endDate: endOf(null) }, price);
    const three = pricingRecordFor(
      { ...k1, beneficiaries: 3, endDate: null, endsByPerson: [endOf(null), endOf(null), endOf(null)] },
      price,
    );

    expect(three).toMatchObject({
      amount: { amountMinor: (one.amount?.amountMinor ?? 0n) * 3n },
      nextYearAmount: { amountMinor: (one.nextYearAmount?.amountMinor ?? 0n) * 3n },
    });
  });
});

describe('seatMonthlyOf (RV-07, M-10: what one seat of a commitment costs a month)', () => {
  it('is the cost held over its months and seats, rounded up', () => {
    expect(seatMonthlyOf({ costMinor: 2_000_000n, kind: 'RECURRING', months: 10, seats: 1 })).toBe(200_000n);
    expect(seatMonthlyOf({ costMinor: 2_100n, kind: 'RECURRING', months: 7, seats: 3 })).toBe(100n);
    expect(seatMonthlyOf({ costMinor: 1_001n, kind: 'RECURRING', months: 10, seats: 1 })).toBe(101n);
  });

  it('is null for a one-time price, no months, no seats or a cost of nothing', () => {
    expect(seatMonthlyOf({ costMinor: 5_000n, kind: 'ONE_TIME', months: null, seats: 1 })).toBeNull();
    expect(seatMonthlyOf({ costMinor: 5_000n, kind: 'RECURRING', months: 0, seats: 1 })).toBeNull();
    expect(seatMonthlyOf({ costMinor: 5_000n, kind: 'RECURRING', months: 3, seats: 0 })).toBeNull();
    expect(seatMonthlyOf({ costMinor: 0n, kind: 'RECURRING', months: 3, seats: 1 })).toBeNull();
  });
});
