import { vendorChargeUntilRenewalOf } from './vendor-charge.policy';

describe('vendor-charge.policy (W3-20)', () => {
  it.each([
    {
      name: 'Claude commitment 12 MONTHLY pay day 01 opened 2026-11-21 free 0 -> 166,667 until 2026-12-01 MONTHLY',
      input: {
        today: '2026-11-21',
        free: 0,
        commitmentTermMonths: 12 as const,
        billingCycle: 'MONTHLY' as const,
        renewalDate: '2026-12-01',
        endDate: '2027-06-30',
        monthlyUnitPriceMinor: 500_000n,
        minimumSeats: null,
        seatsToday: 5,
      },
      expected: { until: '2026-12-01', amountMinor: 166_667n, mode: 'MONTHLY' },
    },
    {
      name: 'Lan Standard ANNUAL ending 2027-06-30 opened 2026-11-21 free 0 -> 3,666,667 until 2027-07-01 ONE_OFF',
      input: {
        today: '2026-11-21',
        free: 0,
        commitmentTermMonths: 12 as const,
        billingCycle: 'ANNUAL' as const,
        renewalDate: '2027-07-01',
        endDate: '2027-06-30',
        monthlyUnitPriceMinor: 500_000n,
        minimumSeats: null,
        seatsToday: 10,
      },
      expected: { until: '2027-07-01', amountMinor: 3_666_667n, mode: 'ONE_OFF' },
    },
    {
      name: 'Lan Standard ANNUAL reopened 2026-12-01 free 0 -> 3,500,000 until 2027-07-01 ONE_OFF',
      input: {
        today: '2026-12-01',
        free: 0,
        commitmentTermMonths: 12 as const,
        billingCycle: 'ANNUAL' as const,
        renewalDate: null,
        endDate: '2027-06-30',
        monthlyUnitPriceMinor: 500_000n,
        minimumSeats: null,
        seatsToday: 10,
      },
      expected: { until: '2027-07-01', amountMinor: 3_500_000n, mode: 'ONE_OFF' },
    },
    {
      name: 'Zoom minimumSeats 50 with 50 seats opened 2026-11-21 free 0 -> 55,000,000 tierStepSeats 50 ONE_OFF',
      input: {
        today: '2026-11-21',
        free: 0,
        commitmentTermMonths: 12 as const,
        billingCycle: 'ANNUAL' as const,
        renewalDate: '2027-07-01',
        endDate: '2027-06-30',
        monthlyUnitPriceMinor: 150_000n,
        minimumSeats: 50,
        seatsToday: 50,
      },
      expected: { until: '2027-07-01', amountMinor: 55_000_000n, mode: 'ONE_OFF', tierStepSeats: 50 },
    },
    {
      name: 'Line with minimumSeats 50 when seatsToday < minimumSeats (10 < 50) uses 1 seat without tierStepSeats',
      input: {
        today: '2026-12-01',
        free: 0,
        commitmentTermMonths: 12 as const,
        billingCycle: 'ANNUAL' as const,
        renewalDate: '2027-07-01',
        endDate: '2027-06-30',
        monthlyUnitPriceMinor: 150_000n,
        minimumSeats: 50,
        seatsToday: 10,
      },
      expected: { until: '2027-07-01', amountMinor: 1_050_000n, mode: 'ONE_OFF' },
    },
  ])('$name', ({ input, expected }) => {
    expect(vendorChargeUntilRenewalOf(input)).toEqual(expected);
  });

  it('returns undefined when free > 0, commitment is not 12, or cycle has no boundary', () => {
    const base = {
      today: '2026-11-21',
      free: 0,
      commitmentTermMonths: 12 as const,
      billingCycle: 'ANNUAL' as const,
      renewalDate: '2027-07-01',
      endDate: '2027-06-30',
      monthlyUnitPriceMinor: 500_000n,
      minimumSeats: null,
      seatsToday: 10,
    };
    expect(vendorChargeUntilRenewalOf({ ...base, free: 1 })).toBeUndefined();
    expect(vendorChargeUntilRenewalOf({ ...base, commitmentTermMonths: 1 })).toBeUndefined();
    expect(vendorChargeUntilRenewalOf({ ...base, commitmentTermMonths: null })).toBeUndefined();
    expect(vendorChargeUntilRenewalOf({ ...base, billingCycle: 'OTHER' })).toBeUndefined();
  });
});
