import { monthlyPriceOf, requestAmountOf } from '../access-request/pricing.policy';

describe('W3-17 K1 annual rolling pricing (Case 1 & Case 6)', () => {
  it('prices full 12m K1 annual across rolling months (900k in 2026, 4.5M in 2027)', () => {
    const fullYear = requestAmountOf({
      kind: 'RECURRING',
      provisioningType: 'K1',
      unitPrice: { amountMinor: 450_000n, currency: 'VND' },
      monthlyPriceMinor: 450_000n,
      billingCycle: 'MONTHLY',
      beneficiaries: 1,
      checkDate: '2026-11-05',
      endDate: '2027-11-04',
    });
    expect(fullYear).toMatchObject({
      status: 'PRICED',
      months: 2,
      amount: { amountMinor: 900_000n, currency: 'VND' },
      nextYearAmount: { amountMinor: 4_500_000n, currency: 'VND' },
    });
  });

  it('prices K1 annual transfer replacement on 20/03/2027 from 05/04/2027 to 04/11/2027 (7m = 3.15M)', () => {
    const transfer = requestAmountOf({
      kind: 'RECURRING',
      provisioningType: 'K1',
      unitPrice: { amountMinor: 450_000n, currency: 'VND' },
      monthlyPriceMinor: 450_000n,
      billingCycle: 'MONTHLY',
      beneficiaries: 1,
      checkDate: '2027-03-20',
      from: '2027-04-05',
      endDate: '2027-11-04',
    });
    expect(transfer).toMatchObject({
      status: 'PRICED',
      months: 7,
      amount: { amountMinor: 3_150_000n, currency: 'VND' },
      nextYearAmount: null,
    });
  });

  it('B-5: converts ANNUAL 10.000.000 via roundHalfAway to 833.333/month (no ceilDiv) for K1/K2', () => {
    expect(
      monthlyPriceOf({ unitPrice: { amountMinor: 10_000_000n, currency: 'VND' }, billingCycle: 'ANNUAL' }),
    ).toEqual({
      amountMinor: 833_333n,
      currency: 'VND',
    });

    const priced = requestAmountOf({
      kind: 'RECURRING',
      provisioningType: 'K2',
      unitPrice: { amountMinor: 10_000_000n, currency: 'VND' },
      billingCycle: 'ANNUAL',
      beneficiaries: 1,
      checkDate: '2026-12-01',
      endDate: null,
    });
    expect(priced).toMatchObject({
      status: 'PRICED',
      monthlyPriceMinor: 833_333n,
      amount: { amountMinor: 833_333n, currency: 'VND' },
      nextYearAmount: { amountMinor: 833_333n * 12n, currency: 'VND' },
    });
  });
});
