import { maxEndDateOf, monthsBetween, pricingRecordFor, requestAmountOf, type PricingInput } from './pricing.policy';

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
      nextYearAmount: null,
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
      nextYearAmount: null,
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

describe('the months and the last day a right may end', () => {
  it('counts both months whole', () => {
    expect(monthsBetween('2026-07-31', '2026-07-31')).toBe(1);
    expect(monthsBetween('2026-07-31', '2026-10-01')).toBe(4);
    expect(monthsBetween('2026-11-10', '2026-12-31')).toBe(2);
  });

  it('is the day before the same day twelve months later (US-05-23 AC-9)', () => {
    expect(maxEndDateOf('2026-11-10')).toBe('2027-11-09');
    expect(maxEndDateOf('2028-02-29')).toBe('2029-02-27');
  });
});
