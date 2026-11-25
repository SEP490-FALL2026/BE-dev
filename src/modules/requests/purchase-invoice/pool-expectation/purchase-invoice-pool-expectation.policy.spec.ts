import type { BusinessDate } from '../../../../core/business-date';
import {
  coverFraction,
  evaluatePoolInvoiceExpectation,
  expectedPoolAmountOf,
  type PoolInvoiceExpectationSource,
} from './purchase-invoice-pool-expectation.policy';

const STANDARD_MONTHLY = 500_000n;
const PREMIUM_MONTHLY = 2_500_000n;

describe('purchase-invoice pool expectation policy (W3-05)', () => {
  describe('coverFraction', () => {
    it('computes exact rational month coverage across partial and full months without intermediate rounding', () => {
      expect(coverFraction('2026-11-21', '2027-06-30')).toEqual({ num: 22n, den: 3n });
      expect(coverFraction('2026-12-01', '2027-06-30')).toEqual({ num: 7n, den: 1n });
      expect(coverFraction('2026-11-21', '2026-11-30')).toEqual({ num: 1n, den: 3n });
      expect(coverFraction('2026-11-21', '2026-11-20')).toEqual({ num: 0n, den: 1n });
    });

    it('uses actual calendar days for leap February (29) vs non-leap February (28)', () => {
      expect(coverFraction('2027-02-15', '2027-02-28')).toEqual({ num: 1n, den: 2n });
      expect(coverFraction('2028-02-15', '2028-02-29')).toEqual({ num: 15n, den: 29n });
    });
  });

  describe('W3-05 acceptance matrix (14+ scenarios, boundaries, and mutant killers)', () => {
    interface MatrixCase {
      name: string;
      source: PoolInvoiceExpectationSource;
      netMinor: bigint;
      nonDeductibleTaxMinor: bigint;
      thresholdPercent: number;
      varianceMonth: BusinessDate;
      expectedMinor: bigint | null;
      varianceMinor: bigint;
      inReview: boolean;
      exceedsThreshold: boolean;
      noExpectedAmount: boolean;
    }

    const sub = (
      billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null,
      purchasedQuantity: number | null,
      monthlyPriceMinor: bigint | null,
    ): PoolInvoiceExpectationSource => ({
      kind: 'SUBSCRIPTION',
      billingCycle,
      purchasedQuantity,
      monthlyPriceMinor,
    });

    const topUp = (
      billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null,
      monthlyPriceMinor: bigint | null,
      renewalDate: BusinessDate | null,
      endDate: BusinessDate | null,
      purchaseDates: readonly BusinessDate[] | null,
    ): PoolInvoiceExpectationSource => ({
      kind: 'REQUEST_TOP_UP',
      billingCycle,
      monthlyPriceMinor,
      renewalDate,
      endDate,
      purchaseDates,
    });

    const cases: MatrixCase[] = [
      {
        name: '1. Standard annual period invoice 11 seats (+3.03% <= 5% -> invoiceVariance +2,000,000)',
        source: sub('ANNUAL', 11, STANDARD_MONTHLY),
        netMinor: 68_000_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 66_000_000n,
        varianceMinor: 2_000_000n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '2. Standard annual period invoice net 69,500,000 (+5.30% > 5% -> inReview +3,500,000)',
        source: sub('ANNUAL', 11, STANDARD_MONTHLY),
        netMinor: 69_500_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 66_000_000n,
        varianceMinor: 3_500_000n,
        inReview: true,
        exceedsThreshold: true,
        noExpectedAmount: false,
      },
      {
        name: '3. Boundary killer (>=): Standard annual net 69,300,000 is exact 5.00% -> does NOT open',
        source: sub('ANNUAL', 11, STANDARD_MONTHLY),
        netMinor: 69_300_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 66_000_000n,
        varianceMinor: 3_300_000n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '4. Q-E: Premium 2 seats net 60,000,000 + non-deductible VAT 6,000,000 -> 0% on net, variance +6,000,000',
        source: sub('ANNUAL', 2, PREMIUM_MONTHLY),
        netMinor: 60_000_000n,
        nonDeductibleTaxMinor: 6_000_000n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 60_000_000n,
        varianceMinor: 6_000_000n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '5. Q-E: Premium net 63,600,000 (+6.00%) + VAT 6,360,000 -> opens case, +9,960,000 inReview',
        source: sub('ANNUAL', 2, PREMIUM_MONTHLY),
        netMinor: 63_600_000n,
        nonDeductibleTaxMinor: 6_360_000n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 60_000_000n,
        varianceMinor: 9_960_000n,
        inReview: true,
        exceedsThreshold: true,
        noExpectedAmount: false,
      },
      {
        name: '6. Finance threshold 3%: Standard net 68,000,000 (+3.03% > 3%) -> opens case',
        source: sub('ANNUAL', 11, STANDARD_MONTHLY),
        netMinor: 68_000_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 3,
        varianceMonth: '2027-07-01',
        expectedMinor: 66_000_000n,
        varianceMinor: 2_000_000n,
        inReview: true,
        exceedsThreshold: true,
        noExpectedAmount: false,
      },
      {
        name: '7. Monthly billing cycle (12m commit, monthly pay) 11 seats, net 5,775,000 = exact 5.00% -> does NOT open',
        source: sub('MONTHLY', 11, STANDARD_MONTHLY),
        netMinor: 5_775_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 5_500_000n,
        varianceMinor: 275_000n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '8. Boundary +1 dong: Monthly 11 seats net 5,775,001 (5.00002%) -> opens case',
        source: sub('MONTHLY', 11, STANDARD_MONTHLY),
        netMinor: 5_775_001n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: 5_500_000n,
        varianceMinor: 275_001n,
        inReview: true,
        exceedsThreshold: true,
        noExpectedAmount: false,
      },
      {
        name: '9. Top-up 2 tasks same day 21/11/2026 (renewal 01/07/2027) -> rounded ONCE 7,333,333, variance -34,703',
        source: topUp('ANNUAL', STANDARD_MONTHLY, '2027-07-01', '2027-06-30', ['2026-11-21', '2026-11-21']),
        netMinor: 7_298_630n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2026-12-01',
        expectedMinor: 7_333_333n,
        varianceMinor: -34_703n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '10. Top-up 2 tasks different days 21/11/2026 & 01/12/2026 -> 3,666,667 + 3,500,000 = 7,166,667',
        source: topUp('ANNUAL', STANDARD_MONTHLY, '2027-07-01', '2027-06-30', ['2026-11-21', '2026-12-01']),
        netMinor: 7_166_667n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2026-12-01',
        expectedMinor: 7_166_667n,
        varianceMinor: 0n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '11. N4: Top-up 1 seat 21/11/2026 on MONTHLY billing cycle (pay day 01) -> R=01/12/2026 -> 166,667',
        source: topUp('MONTHLY', STANDARD_MONTHLY, '2026-12-01', null, ['2026-11-21']),
        netMinor: 166_667n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2026-11-01',
        expectedMinor: 166_667n,
        varianceMinor: 0n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '12. N8: Quarterly period invoice 4 seats x 300,000 -> 3,600,000',
        source: sub('QUARTERLY', 4, 300_000n),
        netMinor: 3_600_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-01-01',
        expectedMinor: 3_600_000n,
        varianceMinor: 0n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '13. Annual top-up without renewalDate, endDate 30/06/2027 -> R = 01/07/2027 -> 3,666,667',
        source: topUp('ANNUAL', STANDARD_MONTHLY, null, '2027-06-30', ['2026-11-21']),
        netMinor: 3_666_667n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2026-12-01',
        expectedMinor: 3_666_667n,
        varianceMinor: 0n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: false,
      },
      {
        name: '14. Missing monthly unit price -> expected null, variance = actual, inReview = false, NO_EXPECTED_AMOUNT',
        source: sub('ANNUAL', 11, null),
        netMinor: 10_000_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
        expectedMinor: null,
        varianceMinor: 10_000_000n,
        inReview: false,
        exceedsThreshold: false,
        noExpectedAmount: true,
      },
    ];

    it.each(cases)(
      '$name',
      ({
        source,
        netMinor,
        nonDeductibleTaxMinor,
        thresholdPercent,
        varianceMonth,
        expectedMinor,
        varianceMinor,
        inReview,
        exceedsThreshold,
        noExpectedAmount,
      }) => {
        const result = evaluatePoolInvoiceExpectation({
          source,
          netMinor,
          nonDeductibleTaxMinor,
          thresholdPercent,
          varianceMonth,
        });

        expect(result).toEqual({
          poolFigures: {
            expectedMinor,
            varianceMinor,
            varianceMonth,
            inReview,
          },
          exceedsThreshold,
          noExpectedAmount,
        });
      },
    );

    it('kills ceil mutant: 1/3 rounds half away to 333,333 not 333,334, and 0.5 rounds away from zero', () => {
      expect(expectedPoolAmountOf(topUp('MONTHLY', 1_000_000n, '2026-12-01', null, ['2026-11-21']))).toBe(333_333n);
      expect(expectedPoolAmountOf(topUp('MONTHLY', 3n, '2026-12-01', null, ['2026-11-16']))).toBe(2n);
    });

    it('triggers threshold on negative net variance strictly exceeding threshold, and not at exact -5%', () => {
      const exactNeg5 = evaluatePoolInvoiceExpectation({
        source: sub('ANNUAL', 11, STANDARD_MONTHLY),
        netMinor: 62_700_000n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
      });
      expect(exactNeg5.exceedsThreshold).toBe(false);
      expect(exactNeg5.poolFigures.inReview).toBe(false);

      const overNeg5 = evaluatePoolInvoiceExpectation({
        source: sub('ANNUAL', 11, STANDARD_MONTHLY),
        netMinor: 62_699_999n,
        nonDeductibleTaxMinor: 0n,
        thresholdPercent: 5,
        varianceMonth: '2027-07-01',
      });
      expect(overNeg5.exceedsThreshold).toBe(true);
      expect(overNeg5.poolFigures.inReview).toBe(true);
    });

    it('supports QUARTERLY top-up R grid and returns null for missing quantity, OTHER cycle, or missing top-up dates', () => {
      expect(expectedPoolAmountOf(topUp('QUARTERLY', STANDARD_MONTHLY, '2027-01-01', null, ['2026-11-21']))).toBe(
        666_667n,
      );
      expect(expectedPoolAmountOf(sub('OTHER', 11, STANDARD_MONTHLY))).toBeNull();
      expect(expectedPoolAmountOf(sub('ANNUAL', null, STANDARD_MONTHLY))).toBeNull();
      expect(expectedPoolAmountOf(topUp('ANNUAL', STANDARD_MONTHLY, '2027-07-01', '2027-06-30', null))).toBeNull();
      expect(expectedPoolAmountOf(topUp('ANNUAL', STANDARD_MONTHLY, '2027-07-01', '2027-06-30', []))).toBeNull();
      expect(expectedPoolAmountOf(topUp('ANNUAL', STANDARD_MONTHLY, null, null, ['2026-11-21']))).toBeNull();
    });

    it('computes expectation for SEAT_PURCHASE link (N9) with single rounding', () => {
      expect(
        expectedPoolAmountOf({
          kind: 'SEAT_PURCHASE',
          billingCycle: 'ANNUAL',
          monthlyPriceMinor: STANDARD_MONTHLY,
          quantity: 2,
          purchasedOn: '2026-11-21',
          renewalDate: '2027-07-01',
          endDate: '2027-06-30',
        }),
      ).toBe(7_333_333n);
    });

    it('sums selected subscription lines (N7) and folds prior-month NONE purchases into MONTHLY invoice', () => {
      expect(
        expectedPoolAmountOf({
          kind: 'SUBSCRIPTION_LINES',
          billingCycle: 'ANNUAL',
          lines: [
            { seats: 10, monthlyPriceMinor: STANDARD_MONTHLY },
            { seats: 2, monthlyPriceMinor: PREMIUM_MONTHLY },
          ],
        }),
      ).toBe(120_000_000n);

      expect(
        expectedPoolAmountOf({
          kind: 'SUBSCRIPTION_LINES',
          billingCycle: 'MONTHLY',
          lines: [{ seats: 11, monthlyPriceMinor: STANDARD_MONTHLY }],
          foldedPurchases: [
            {
              quantity: 1,
              monthlyPriceMinor: STANDARD_MONTHLY,
              purchasedOn: '2026-11-21',
              renewalDate: '2026-12-01',
              endDate: '2027-06-30',
            },
          ],
        }),
      ).toBe(5_666_667n);
    });
  });
});
