import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { paymentScheduleJson } from './access-request.json';
import { priceRequest, type PaymentPeriod, type PricingInput } from './pricing.policy';

const FIGMA = { amountMinor: 1500n, currency: 'USD' }; // 15.00 per seat per month

const input = (patch: Partial<PricingInput> = {}): PricingInput => ({
  unitPrice: FIGMA,
  billingCycle: 'MONTHLY',
  termMonths: 6,
  beneficiaries: 1,
  expectedSpendOn: '2026-10-23',
  ...patch,
});

describe('the amount of a request for paid software (US-05-02 AC-1, FR-3.2)', () => {
  it('is the unit price for every billing period of the term and every person it is for', () => {
    const priced = priceRequest(input());

    expect(priced).toMatchObject({
      status: 'PRICED',
      amount: { amountMinor: 9000n, currency: 'USD' },
      budgetYear: 2026,
    });
  });

  it('multiplies by the people: three people for twelve months', () => {
    expect(priceRequest(input({ termMonths: 12, beneficiaries: 3, expectedSpendOn: '2026-01-15' }))).toMatchObject({
      status: 'PRICED',
      amount: { amountMinor: 1500n * 12n * 3n },
    });
  });

  it('is paid by the billing period, so a quarterly price counts in quarters and a part of a period is paid whole', () => {
    expect(
      priceRequest(
        input({
          billingCycle: 'QUARTERLY',
          unitPrice: { amountMinor: 4000n, currency: 'USD' },
          termMonths: 6,
          expectedSpendOn: '2026-01-23',
        }),
      ),
    ).toMatchObject({
      amount: { amountMinor: 8000n },
      periods: [{ dueOn: '2026-01-23' }, { dueOn: '2026-04-23' }],
    });
    expect(
      priceRequest(
        input({ billingCycle: 'ANNUAL', unitPrice: { amountMinor: 12000n, currency: 'USD' }, termMonths: 6 }),
      ),
    ).toMatchObject({
      amount: { amountMinor: 12000n },
      periods: [{ dueOn: '2026-10-23' }],
    });
  });

  it('lays the payments out from the day the money is expected to go out, one for each period', () => {
    const priced = priceRequest(input({ termMonths: 3, expectedSpendOn: '2026-01-31' }));

    expect(priced.status === 'PRICED' && priced.periods).toEqual([
      { dueOn: '2026-01-31', amountMinor: 1500n, budgetYear: 2026, binding: true },
      { dueOn: '2026-02-28', amountMinor: 1500n, budgetYear: 2026, binding: true },
      { dueOn: '2026-03-31', amountMinor: 1500n, budgetYear: 2026, binding: true },
    ]);
  });
});

describe('the budget year of a request (US-05-02 AC-11, QĐ-82e)', () => {
  it('is the year of the day the money is expected to go out, not the day the request is sent', () => {
    const priced = priceRequest(input({ termMonths: 1, expectedSpendOn: '2027-01-05' }));

    expect(priced).toMatchObject({ status: 'PRICED', budgetYear: 2027 });
  });

  it('is the calendar year: the 31st of March and the 1st of January fall in their own years (R-I01)', () => {
    expect(priceRequest(input({ termMonths: 1, expectedSpendOn: '2027-03-31' }))).toMatchObject({ budgetYear: 2027 });
    expect(priceRequest(input({ termMonths: 1, expectedSpendOn: '2026-12-31' }))).toMatchObject({ budgetYear: 2026 });
  });
});

describe('what is not priced (US-05-02 AC-4, QĐ-84e)', () => {
  it('has no price when the plan has no priced subscription, and keeps the year of its date', () => {
    expect(priceRequest(input({ unitPrice: null, billingCycle: null }))).toEqual({
      status: 'MISSING',
      reason: 'NO_PRICED_SUBSCRIPTION',
      budgetYear: 2026,
    });
  });

  it('has no price when the plan has a subscription priced at nothing: a paid request never costs 0 (F34, FR-3.2)', () => {
    expect(priceRequest(input({ unitPrice: { amountMinor: 0n, currency: 'USD' } }))).toEqual({
      status: 'MISSING',
      reason: 'NO_PRICED_SUBSCRIPTION',
      budgetYear: 2026,
    });
  });

  it('has no price when the billing cycle is not one that has periods', () => {
    expect(priceRequest(input({ billingCycle: 'OTHER' }))).toMatchObject({
      status: 'MISSING',
      reason: 'CYCLE_UNKNOWN',
    });
  });

  it('is priced, with the year of every payment, when the payments cross a fiscal year: which of them bind is for the budget check', () => {
    const priced = priceRequest(input({ termMonths: 6, expectedSpendOn: '2026-11-15' }));

    expect(priced).toMatchObject({ status: 'PRICED', amount: { amountMinor: 9000n }, budgetYear: 2026 });
    expect(priced.status === 'PRICED' && priced.periods.map((period) => period.budgetYear)).toEqual([
      2026, 2026, 2027, 2027, 2027, 2027,
    ]);
  });

  it('is priced when a long term pays inside one fiscal year', () => {
    expect(
      priceRequest(
        input({ termMonths: 12, billingCycle: 'ANNUAL', unitPrice: { amountMinor: 12000n, currency: 'USD' } }),
      ),
    ).toMatchObject({
      status: 'PRICED',
      amount: { amountMinor: 12000n },
    });
  });
});

describe('paymentScheduleJson (the codec of access_requests.payment_schedule)', () => {
  const stored = [
    { dueOn: '2026-11-30', amountMinor: '1200000', budgetYear: 2026, binding: true },
    { dueOn: '2027-11-30', amountMinor: '1200000', budgetYear: 2027, binding: false },
  ];

  it('reads each payment with its amount as a big integer', () => {
    const schedule: PaymentPeriod[] | null = paymentScheduleJson.decode(stored);

    expect(schedule).toEqual([
      { dueOn: '2026-11-30', amountMinor: 1_200_000n, budgetYear: 2026, binding: true },
      { dueOn: '2027-11-30', amountMinor: 1_200_000n, budgetYear: 2027, binding: false },
    ]);
  });

  it('lets a payment of a schedule written before quotes existed bind: the default is `true`, here and nowhere else', () => {
    const [legacy] = paymentScheduleJson.decode([{ dueOn: '2025-03-31', amountMinor: '500', budgetYear: 2025 }]) ?? [];

    expect(legacy.binding).toBe(true);
  });

  it('reads NULL as no schedule and an empty schedule as an empty one', () => {
    expect(paymentScheduleJson.decode(null)).toBeNull();
    expect(paymentScheduleJson.decode([])).toEqual([]);
  });

  it.each([
    ['a missing field', [{ amountMinor: '1', budgetYear: 2026, binding: true }]],
    ['an amount that is a number', [{ dueOn: '2026-11-30', amountMinor: 1200000, budgetYear: 2026 }]],
    [
      'an amount that is not a whole number of minor units',
      [{ dueOn: '2026-11-30', amountMinor: '12.5', budgetYear: 2026 }],
    ],
    ['a date that is not a date', [{ dueOn: '2026-13-45', amountMinor: '1', budgetYear: 2026 }]],
    ['a year that is text', [{ dueOn: '2026-11-30', amountMinor: '1', budgetYear: '2026' }]],
    ['a schedule that is an object', { dueOn: '2026-11-30' }],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => paymentScheduleJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => paymentScheduleJson.decode(value)).toThrow('access_requests.payment_schedule');
    expect(() => paymentScheduleJson.decode(value)).not.toThrow(/12\.5|2026-13-45/);
  });

  // JSON has no big integers: the amounts go out as text, key for key as they were written before the codec.
  it('writes the amounts as text and the same keys as the schedule has always been written with', () => {
    const schedule: PaymentPeriod[] = [
      { dueOn: '2026-11-30', amountMinor: 1_200_000n, budgetYear: 2026, binding: true },
      { dueOn: '2027-11-30', amountMinor: 9_007_199_254_740_993n, budgetYear: 2027, binding: false },
    ];

    expect(paymentScheduleJson.encode(schedule)).toEqual([
      { dueOn: '2026-11-30', amountMinor: '1200000', budgetYear: 2026, binding: true },
      { dueOn: '2027-11-30', amountMinor: '9007199254740993', budgetYear: 2027, binding: false },
    ]);
    expect(paymentScheduleJson.decode(JSON.parse(JSON.stringify(paymentScheduleJson.encode(schedule))))).toEqual(
      schedule,
    );
  });
});
