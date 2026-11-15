import { monthlyCostOf } from './subscription-monthly-cost.policy';

describe('monthlyCostOf (the price of a seat for a month, in dong, rounded up)', () => {
  const priced = (amountMinor: bigint, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null) => ({
    billingCycle,
    priceSnapshot: null,
    unitPrice: { amountMinor, currency: 'VND', recordedOn: '2026-01-05' },
  });

  it('is the price of a monthly plan as it is, and a quarter or a year over its months, rounded up', () => {
    expect(monthlyCostOf(priced(200_000n, 'MONTHLY'))).toEqual({ monthlyPriceMinor: 200_000n, cycleMonths: 1 });
    expect(monthlyCostOf(priced(1_000_000n, 'QUARTERLY'))).toEqual({ monthlyPriceMinor: 333_334n, cycleMonths: 3 });
    expect(monthlyCostOf(priced(2_400_001n, 'ANNUAL'))).toEqual({ monthlyPriceMinor: 200_001n, cycleMonths: 12 });
  });

  it('reads the price in the reporting currency when the subscription carries one', () => {
    expect(
      monthlyCostOf({
        billingCycle: 'MONTHLY',
        unitPrice: { amountMinor: 10n, currency: 'USD', recordedOn: '2026-01-05' },
        priceSnapshot: {
          rate: 1n,
          rateDate: '2026-01-05',
          rateSource: 'MANUAL',
          reportingMinor: 250_000n,
          reportingCurrency: 'VND',
          exchangeRateId: null,
        },
      }),
    ).toEqual({ monthlyPriceMinor: 250_000n, cycleMonths: 1 });
  });

  it('knows no price for another cycle, none, or a price that is not in dong and was never converted', () => {
    expect(monthlyCostOf(priced(200_000n, 'OTHER'))).toEqual({ monthlyPriceMinor: null, cycleMonths: null });
    expect(monthlyCostOf(priced(200_000n, null))).toEqual({ monthlyPriceMinor: null, cycleMonths: null });
    expect(
      monthlyCostOf({
        billingCycle: 'MONTHLY',
        priceSnapshot: null,
        unitPrice: { amountMinor: 10n, currency: 'USD', recordedOn: '2026-01-05' },
      }),
    ).toEqual({ monthlyPriceMinor: null, cycleMonths: 1 });
  });
});
