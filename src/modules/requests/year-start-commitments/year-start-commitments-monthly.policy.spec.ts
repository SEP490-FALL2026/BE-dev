import { yearStartAmountOf, yearStartMonthsOf } from './year-start-commitments.policy';

describe('W3-07: monthlyPriceMinor pass-through & yearStartMonthsOf', () => {
  it('uses monthlyPriceMinor directly instead of re-dividing annual unitPrice', () => {
    const res = yearStartAmountOf({
      year: 2027,
      seats: [
        {
          expectedEndDate: null,
          validUntil: null,
          departmentId: null,
          termLimited: false,
          savedMinor: null,
          approvalPrice: null,
        },
      ],
      price: {
        kind: 'RECURRING',
        unitPrice: { amountMinor: 5_999_999n, currency: 'VND' },
        monthlyPriceMinor: 500_000n,
        billingCycle: 'ANNUAL',
      },
    });
    expect(res).toEqual({
      status: 'PRICED',
      amountMinor: 6_000_000n,
      seatMonthlyMinor: 500_000n,
      currency: 'VND',
    });
  });

  it('computes monthly seat counts from 01/01 through each counted seat end month', () => {
    const months = yearStartMonthsOf({
      year: 2027,
      seats: [
        {
          expectedEndDate: '2026-12-31',
          validUntil: null,
          departmentId: null,
          termLimited: true,
          savedMinor: null,
          approvalPrice: null,
        },
        {
          expectedEndDate: '2027-03-15',
          validUntil: null,
          departmentId: null,
          termLimited: true,
          savedMinor: null,
          approvalPrice: null,
        },
        {
          expectedEndDate: null,
          validUntil: '2027-06-01',
          departmentId: null,
          termLimited: false,
          savedMinor: null,
          approvalPrice: null,
        },
      ],
    });
    expect(months).toEqual([
      { month: '2027-01-01', seatCount: 2 },
      { month: '2027-02-01', seatCount: 2 },
      { month: '2027-03-01', seatCount: 2 },
      { month: '2027-04-01', seatCount: 1 },
      { month: '2027-05-01', seatCount: 1 },
    ]);
  });
});
