import {
  forecastOfYear,
  knownPriceIncrease,
  lightOf,
  paceOf,
  reviewFiguresOf,
  reviewKindOf,
  reviewReminderFor,
  sharedPoolOverReserve,
  reviewedMonthHasEnded,
  variancePpm,
} from './budget-review.policy';
import type { ReviewInput } from './budget-review.types';

const TR = 1_000_000n;

const base: ReviewInput = {
  month: 6,
  baseMinor: 300n * TR,
  reserveMinor: 30n * TR,
  spentMinor: 168n * TR,
  committedMinor: 135n * TR,
  pendingMinor: 0n,
  invoiceBasisMinor: 160n * TR,
  invoiceActualMinor: 168n * TR,
  priceIncreaseMinor: 0n,
};

describe('the review of the budget of a Cost Center at the close of a month (RV-1.1; T-RV1)', () => {
  describe('the forecast of the end of the year (R-37, QĐ-111ai)', () => {
    it('T-RV1: base 300 tr, reserve 30 tr, spent 168 tr (160 tr price + 8 tr tax), held 135 tr, June gives k = 0,05, forecast 309,75 tr, pace 112 %, Vàng', () => {
      const figures = reviewFiguresOf(base);

      expect(figures.variancePpm).toBe(50_000n);
      expect(figures.forecastMinor).toBe(309_750_000n);
      expect(figures.paceBasisPoints).toBe(11_200n);
      expect(figures.light).toBe('YELLOW');
    });

    it('is not what the old formula said: the tax is counted on the part still open, never again on what was spent (318,15 tr before)', () => {
      const oldFormula = ((base.spentMinor + base.committedMinor) * base.invoiceActualMinor) / base.invoiceBasisMinor;

      expect(oldFormula).toBe(318_150_000n);
      expect(reviewFiguresOf(base).forecastMinor).toBe(309_750_000n);
    });

    it('T-RV1 distinguishing case: spent 200 tr (180 + 20), held 100 tr gives 311,1 tr, Vàng; the old formula gave 333,3 tr, Đỏ', () => {
      const input: ReviewInput = {
        ...base,
        spentMinor: 200n * TR,
        committedMinor: 100n * TR,
        invoiceBasisMinor: 180n * TR,
        invoiceActualMinor: 200n * TR,
      };
      const oldFormula =
        ((input.spentMinor + input.committedMinor) * input.invoiceActualMinor) / input.invoiceBasisMinor;
      const figures = reviewFiguresOf(input);

      expect(oldFormula).toBe(333_333_333n);
      expect(figures.forecastMinor).toBe(311_111_111n);
      expect(figures.light).toBe('YELLOW');
      expect(lightOf({ ...input, forecastMinor: oldFormula, paceBasisPoints: figures.paceBasisPoints })).toBe('RED');
    });

    it('US-12-21 AC-2: spent 67 tr (64 + 3), held 54 tr, 5 tr waiting for spend approval give 128.765.625 đ, pace 111,7 %, Vàng and not Đỏ', () => {
      const figures = reviewFiguresOf({
        month: 6,
        baseMinor: 120n * TR,
        reserveMinor: 12n * TR,
        spentMinor: 67n * TR,
        committedMinor: 54n * TR,
        pendingMinor: 5n * TR,
        invoiceBasisMinor: 64n * TR,
        invoiceActualMinor: 67n * TR,
        priceIncreaseMinor: 0n,
      });

      expect(figures.forecastMinor).toBe(128_765_625n);
      expect(figures.paceBasisPoints).toBe(11_167n);
      expect(figures.light).toBe('YELLOW');
      expect(figures.remainingMinor).toBe(132n * TR - 67n * TR - 54n * TR - 5n * TR);
    });

    it('with no invoice since the start of the year k is 0: the forecast is what was spent, what is held and what waits', () => {
      const figures = reviewFiguresOf({
        ...base,
        spentMinor: 10n * TR,
        committedMinor: 20n * TR,
        pendingMinor: 5n * TR,
        invoiceBasisMinor: 0n,
        invoiceActualMinor: 0n,
      });

      expect(figures.variancePpm).toBe(0n);
      expect(figures.forecastMinor).toBe(35n * TR);
    });

    it('adds the price increase already known to the forecast', () => {
      expect(forecastOfYear({ ...base, priceIncreaseMinor: 2_400_000n })).toBe(309_750_000n + 2_400_000n);
    });

    it('with nothing held and nothing waiting the forecast is what was spent, whatever k is: the tax is never multiplied into what was spent', () => {
      expect(forecastOfYear({ ...base, committedMinor: 0n })).toBe(168n * TR);
    });
  });

  describe('variancePpm (the difference of the invoices since the start of the year, in millionths)', () => {
    it('is the tax and fees over the price: 8 over 160 is 50.000 millionths, 20 over 180 rounded half away', () => {
      expect(variancePpm({ invoiceBasisMinor: 160n * TR, invoiceActualMinor: 168n * TR })).toBe(50_000n);
      expect(variancePpm({ invoiceBasisMinor: 180n * TR, invoiceActualMinor: 200n * TR })).toBe(111_111n);
    });

    it('is 0 when there is no invoice', () => {
      expect(variancePpm({ invoiceBasisMinor: 0n, invoiceActualMinor: 0n })).toBe(0n);
    });
  });

  describe('the price increase already known (R-52, US-12-21 AC-7)', () => {
    it('T-RV1: (1.650.000 - 1.500.000) x 4 seats x 4 months (September to December) = 2.400.000 đ', () => {
      expect(
        knownPriceIncrease([
          { currentMonthlyMinor: 1_650_000n, committedMonthlyMinor: 1_500_000n, seats: 4, monthsLeft: 4 },
        ]),
      ).toBe(2_400_000n);
    });

    it('T-RV1: a price that went down adds nothing, it is never taken off (R-52)', () => {
      expect(
        knownPriceIncrease([
          { currentMonthlyMinor: 1_400_000n, committedMonthlyMinor: 1_500_000n, seats: 4, monthsLeft: 4 },
        ]),
      ).toBe(0n);
    });

    it('adds the commitments that rose and skips the ones that fell, one by one', () => {
      expect(
        knownPriceIncrease([
          { currentMonthlyMinor: 1_650_000n, committedMonthlyMinor: 1_500_000n, seats: 4, monthsLeft: 4 },
          { currentMonthlyMinor: 100_000n, committedMonthlyMinor: 300_000n, seats: 10, monthsLeft: 6 },
          { currentMonthlyMinor: 320_000n, committedMonthlyMinor: 300_000n, seats: 10, monthsLeft: 6 },
        ]),
      ).toBe(2_400_000n + 1_200_000n);
    });

    it('is nothing when no month is left or no seat', () => {
      expect(
        knownPriceIncrease([
          { currentMonthlyMinor: 2n, committedMonthlyMinor: 1n, seats: 3, monthsLeft: 0 },
          { currentMonthlyMinor: 2n, committedMonthlyMinor: 1n, seats: 0, monthsLeft: 3 },
        ]),
      ).toBe(0n);
    });
  });

  describe('the pace of spending', () => {
    it('is the spent over the base of the months gone: 168 over (300 x 6 over 12) = 112 %', () => {
      expect(paceOf({ spentMinor: 168n * TR, baseMinor: 300n * TR, month: 6 })).toBe(11_200n);
    });

    it('is nothing when there is no base', () => {
      expect(paceOf({ spentMinor: 1n, baseMinor: 0n, month: 6 })).toBeNull();
    });
  });

  describe('the light (QĐ-111af)', () => {
    const at = (forecastMinor: bigint, paceBasisPoints: bigint | null, month = 6) =>
      lightOf({ month, baseMinor: 300n * TR, reserveMinor: 30n * TR, forecastMinor, paceBasisPoints });

    it('Đỏ only above the base plus the reserve', () => {
      expect(at(330n * TR + 1n, 10_000n)).toBe('RED');
      expect(at(330n * TR, 10_000n)).toBe('YELLOW');
    });

    it('Vàng above the base, or when the pace is above 110 % of the schedule, not at 110 %', () => {
      expect(at(300n * TR + 1n, 10_000n)).toBe('YELLOW');
      expect(at(300n * TR, 11_000n)).toBe('GREEN');
      expect(at(300n * TR, 11_001n)).toBe('YELLOW');
    });

    it('Dưới mức from June when the forecast is under 70 % of the base, not before, not at 70 %', () => {
      expect(at(210n * TR - 1n, 5_000n, 6)).toBe('UNDER');
      expect(at(210n * TR, 5_000n, 6)).toBe('GREEN');
      expect(at(210n * TR - 1n, 5_000n, 5)).toBe('GREEN');
    });

    it('Vàng and Đỏ come before Dưới mức, and everything else is Xanh', () => {
      expect(at(200n * TR, 12_000n, 6)).toBe('YELLOW');
      expect(at(280n * TR, 9_500n, 6)).toBe('GREEN');
    });
  });

  describe('the kind of period and the day (QĐ-111ae, R-47)', () => {
    it('March, June and September are the quarterly reviews; the other months only close the month', () => {
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(reviewKindOf)).toEqual([
        'MONTH',
        'MONTH',
        'QUARTER',
        'MONTH',
        'MONTH',
        'QUARTER',
        'MONTH',
        'MONTH',
        'QUARTER',
        'MONTH',
        'MONTH',
        'MONTH',
      ]);
    });

    it('a month can be closed from the day after its last day, not before', () => {
      expect(reviewedMonthHasEnded(2026, 10, '2026-11-01')).toBe(true);
      expect(reviewedMonthHasEnded(2026, 10, '2026-10-31')).toBe(false);
      expect(reviewedMonthHasEnded(2026, 12, '2027-01-01')).toBe(true);
    });

    it('asks Finance on the fifth working day of the month for the month before, and on no other day', () => {
      const none = new Set<string>();
      // 01/10/2026 is a Thursday: working days 01, 02, 05, 06, 07, so the fifth is Wednesday 07/10.
      expect(reviewReminderFor('2026-10-07', none)).toEqual({ year: 2026, month: 9 });
      expect(reviewReminderFor('2026-10-06', none)).toBeNull();
      expect(reviewReminderFor('2026-10-08', none)).toBeNull();
    });

    it('counts a public holiday as no working day, and January asks for December of the year before', () => {
      // 01/01/2027 is a Friday and a holiday: working days 04, 05, 06, 07, 08, so the fifth is Friday 08/01.
      expect(reviewReminderFor('2027-01-08', new Set(['2027-01-01']))).toEqual({ year: 2026, month: 12 });
      expect(reviewReminderFor('2027-01-07', new Set(['2027-01-01']))).toBeNull();
    });
  });
  describe('the line of the shared pool against its reserve (QĐ-104i, MG-03)', () => {
    it('is over only when the line is above the reserve of the cycle, and says nothing when the cycle has no reserve', () => {
      expect(sharedPoolOverReserve(5_000_001n, 5_000_000n)).toBe(true);
      expect(sharedPoolOverReserve(5_000_000n, 5_000_000n)).toBe(false);
      expect(sharedPoolOverReserve(-200_000n, 5_000_000n)).toBe(false);
      expect(sharedPoolOverReserve(9_000_000n, null)).toBeNull();
    });
  });
});
