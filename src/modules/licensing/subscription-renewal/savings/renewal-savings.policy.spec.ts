import {
  computeRealisedSaving,
  isFirstInvoiceMonthOfPeriod,
  type RealisedSavingPeriod,
} from './renewal-savings.policy';

describe('W3-09: computeRealisedSaving & first-month invoice check', () => {
  const period = (over: Partial<RealisedSavingPeriod> = {}): RealisedSavingPeriod => ({
    commitmentTermMonths: 12,
    purchasedQuantity: 12,
    monthlyPriceMinor: 500_000n,
    currency: 'VND',
    ...over,
  });

  it.each<{
    name: string;
    prior: RealisedSavingPeriod;
    next: RealisedSavingPeriod;
    expected: ReturnType<typeof computeRealisedSaving>;
  }>([
    {
      name: 'Standard 12-month upfront 12 -> 11 seats at 500k -> 6.000.000 đ',
      prior: period({ commitmentTermMonths: 12, purchasedQuantity: 12, monthlyPriceMinor: 500_000n }),
      next: period({ commitmentTermMonths: 12, purchasedQuantity: 11, monthlyPriceMinor: 500_000n }),
      expected: { amountMinor: 6_000_000n, currency: 'VND' },
    },
    {
      name: 'Claude 12-month commitment billed monthly 12 -> 11 at 500k -> still x12 = 6.000.000 đ on first invoice',
      prior: period({ commitmentTermMonths: 12, purchasedQuantity: 12, monthlyPriceMinor: 500_000n }),
      next: period({ commitmentTermMonths: 12, purchasedQuantity: 11, monthlyPriceMinor: 500_000n }),
      expected: { amountMinor: 6_000_000n, currency: 'VND' },
    },
    {
      name: 'Figma 1-month commitment 12 -> 11 at 500k -> 500.000 đ',
      prior: period({ commitmentTermMonths: 1, purchasedQuantity: 12, monthlyPriceMinor: 500_000n }),
      next: period({ commitmentTermMonths: 1, purchasedQuantity: 11, monthlyPriceMinor: 500_000n }),
      expected: { amountMinor: 500_000n, currency: 'VND' },
    },
    {
      name: 'Upgrade 2 -> 3 seats at 2.5M (60M -> 90M) -> clamped to 0 via max(0, baseline - compared)',
      prior: period({ commitmentTermMonths: 12, purchasedQuantity: 2, monthlyPriceMinor: 2_500_000n }),
      next: period({ commitmentTermMonths: 12, purchasedQuantity: 3, monthlyPriceMinor: 2_500_000n }),
      expected: { amountMinor: 0n, currency: 'VND' },
    },
    {
      name: 'Mutant killer: fewer seats at higher price (100 x 150k -> 88 x 180k) -> 0 via max(0, ...)',
      prior: period({ commitmentTermMonths: 12, purchasedQuantity: 100, monthlyPriceMinor: 150_000n }),
      next: period({ commitmentTermMonths: 12, purchasedQuantity: 88, monthlyPriceMinor: 180_000n }),
      expected: { amountMinor: 0n, currency: 'VND' },
    },
    {
      name: 'Same quantity and price -> 0n',
      prior: period({ commitmentTermMonths: 12, purchasedQuantity: 10, monthlyPriceMinor: 500_000n }),
      next: period({ commitmentTermMonths: 12, purchasedQuantity: 10, monthlyPriceMinor: 500_000n }),
      expected: { amountMinor: 0n, currency: 'VND' },
    },
    {
      name: 'Returns null when commitmentTermMonths is missing',
      prior: period({ commitmentTermMonths: null }),
      next: period({ purchasedQuantity: 11 }),
      expected: null,
    },
    {
      name: 'Returns null when purchasedQuantity or monthlyPriceMinor is missing or currencies differ',
      prior: period({ purchasedQuantity: null }),
      next: period({ purchasedQuantity: 11 }),
      expected: null,
    },
    {
      name: 'Returns null when currencies differ',
      prior: period({ currency: 'USD' }),
      next: period({ currency: 'VND', purchasedQuantity: 11 }),
      expected: null,
    },
  ])('$name', ({ prior, next, expected }) => {
    expect(computeRealisedSaving(prior, next)).toEqual(expected);
  });

  it('matches only the month of the new period startDate as first invoice month', () => {
    expect(isFirstInvoiceMonthOfPeriod('2027-07-01', '2027-07-01')).toBe(true);
    expect(isFirstInvoiceMonthOfPeriod('2027-07-15', '2027-07-01')).toBe(true);
    expect(isFirstInvoiceMonthOfPeriod('2027-07-01', '2027-08-01')).toBe(false);
    expect(isFirstInvoiceMonthOfPeriod(null, '2027-07-01')).toBe(false);
  });
});
