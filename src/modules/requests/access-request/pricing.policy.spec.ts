import { termRunOf } from '../../../core/term-limit';
import {
  annualVendorAmountOf,
  pricingRecordFor,
  requestAmountOf,
  seatMonthlyOf,
  type PricingInput,
} from './pricing.policy';

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

  it('says where the price comes from, in the record of a priced request only (QĐ-113a)', () => {
    const base = { kind: 'RECURRING', unitPrice: SEAT, billingCycle: 'MONTHLY' } as const;

    expect(pricingRecordFor(request, { ...base, source: 'SUBSCRIPTION' }).priceSource).toBe('SUBSCRIPTION');
    expect(pricingRecordFor(request, { ...base, source: 'PLAN_REFERENCE' }).priceSource).toBe('PLAN_REFERENCE');
    expect(pricingRecordFor(request, null).priceSource).toBeUndefined();
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

  it('W3-02: recurring price uses monthlyPriceMinor directly without division or ceil', () => {
    expect(
      requestAmountOf(
        input({
          billingCycle: 'ANNUAL',
          unitPrice: { amountMinor: 1_000_001n, currency: 'VND' },
          monthlyPriceMinor: 83_333n,
          beneficiaries: 1,
          checkDate: '2026-12-01',
        }),
      ),
    ).toMatchObject({ months: 1, amount: { amountMinor: 83_333n } });
    expect(
      requestAmountOf(
        input({
          billingCycle: 'QUARTERLY',
          unitPrice: { amountMinor: 300n, currency: 'USD' },
          monthlyPriceMinor: 100n,
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

  it('uses monthlyPriceMinor directly for annual plans and preserves 12 months next year', () => {
    expect(
      requestAmountOf({
        kind: 'RECURRING',
        unitPrice: dong(999_996n),
        monthlyPriceMinor: 83_333n,
        billingCycle: 'ANNUAL',
        beneficiaries: 1,
        checkDate: '2026-12-01',
        endDate: null,
      }),
    ).toMatchObject({ months: 1, amount: { amountMinor: 83_333n }, nextYearAmount: { amountMinor: 999_996n } });
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

describe('W3-02: calendar months for K2, rolling months for K1, seatMonthlyOf, and K2 first-purchase annual amount', () => {
  it.each([
    ['K2 21/11/2026 no end -> 2m (1.000.000)', 'K2', '2026-11-21', null, 500_000n, 1, 2, 1_000_000n],
    ['K2 31/01->15/03 calendar 3m (1.5M vs rolling 1M)', 'K2', '2027-01-31', '2027-03-15', 500_000n, 1, 3, 1_500_000n],
    ['K2 01/03->31/03 = 1m (500.000)', 'K2', '2027-03-01', '2027-03-31', 500_000n, 1, 1, 500_000n],
    ['K1 15/01 3m rolling = 3m (1.35M vs calendar 1.8M)', 'K1', '2027-01-15', '2027-04-14', 450_000n, 1, 3, 1_350_000n],
  ] as const)('%s', (_label, provisioningType, checkDate, endDate, monthly, beneficiaries, months, expectedAmount) => {
    const priced = requestAmountOf({
      kind: 'RECURRING',
      provisioningType,
      unitPrice: { amountMinor: monthly, currency: 'VND' },
      monthlyPriceMinor: monthly,
      billingCycle: 'MONTHLY',
      beneficiaries,
      checkDate,
      endDate,
    });
    expect(priced).toMatchObject({ status: 'PRICED', months, amount: { amountMinor: expectedAmount } });
  });

  it('seatMonthlyOf returns monthlyPriceMinor directly without reverse division', () => {
    const base = { monthlyPriceMinor: 500_000n, kind: 'RECURRING' as const, months: 2 };
    expect(seatMonthlyOf({ ...base, costMinor: 1_000_000n, seats: 1 })).toBe(500_000n);
    expect(seatMonthlyOf({ ...base, costMinor: 1_500_000n, seats: 2 })).toBe(500_000n);
    expect(seatMonthlyOf({ ...base, kind: 'ONE_TIME', months: null, costMinor: 5_000n, seats: 1 })).toBeNull();
    expect(seatMonthlyOf({ ...base, months: 0, costMinor: 5_000n, seats: 1 })).toBeNull();
    expect(seatMonthlyOf({ ...base, months: 3, costMinor: 0n, seats: 1 })).toBeNull();
  });

  it.each([
    ['K2 referenceCommitmentMonths null -> 12 -> 6.000.000', 'K2', null, 6_000_000n],
    ['K2 referenceCommitmentMonths 12 -> 6.000.000', 'K2', 12, 6_000_000n],
    ['K2 referenceCommitmentMonths 1 -> null', 'K2', 1, null],
    ['K1 referenceCommitmentMonths 1 -> null', 'K1', 1, null],
  ] as const)('annualVendorAmountOf firstPurchaseOnly: %s', (_label, provisioningType, refCommitment, expected) => {
    const result = annualVendorAmountOf({
      kind: 'RECURRING',
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      provisioningType,
      referenceCommitmentMonths: refCommitment,
      firstPurchaseOnly: true,
    });
    expect(result?.amountMinor ?? null).toBe(expected);
  });
});
