import {
  applyToMonth,
  monthRowsOf,
  spreadBySeatMonthly,
  spreadRemainder,
  stateOf,
  type MonthlySliceState,
} from './commitment-month.policy';

const STANDARD = 500_000n;
const C_ID = 'c-1';

const monthsRange = (year: number, from: number, to: number, seatCount = 1) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    month: `${year}-${String(from + i).padStart(2, '0')}-01`,
    seatCount,
  }));

const slice = (
  year: number,
  monthNum: number,
  shareMinor = STANDARD,
  appliedMinor = 0n,
  releasedMinor = 0n,
): MonthlySliceState => ({
  month: `${year}-${String(monthNum).padStart(2, '0')}-01`,
  shareMinor,
  appliedMinor,
  releasedMinor,
});

describe('commitment-month policy (W3-07)', () => {
  describe('monthRowsOf', () => {
    it('creates one row per calendar month with share = s * seatCount and puts rounding remainder on the last month', () => {
      const rows = monthRowsOf({
        commitmentId: C_ID,
        year: 2026,
        amountMinor: 1_000_005n,
        seatMonthlyMinor: STANDARD,
        months: monthsRange(2026, 11, 12),
      });

      expect(rows).toEqual([
        { commitmentId: C_ID, month: '2026-11-01', seatCount: 1, shareMinor: 500_000n },
        { commitmentId: C_ID, month: '2026-12-01', seatCount: 1, shareMinor: 500_005n },
      ]);
      expect(rows.reduce((s, r) => s + r.shareMinor, 0n)).toBe(1_000_005n);
    });

    it('aggregates multiple seats with different end months and preserves Σ share = amountMinor', () => {
      const rows = monthRowsOf({
        commitmentId: C_ID,
        year: 2027,
        amountMinor: 4_500_000n,
        seatMonthlyMinor: STANDARD,
        months: [...monthsRange(2027, 1, 3, 2), ...monthsRange(2027, 4, 6, 1)],
      });

      expect(rows).toHaveLength(6);
      expect(rows[0]).toMatchObject({ month: '2027-01-01', seatCount: 2, shareMinor: 1_000_000n });
      expect(rows[5]).toMatchObject({ month: '2027-06-01', seatCount: 1, shareMinor: 500_000n });
      expect(rows.reduce((s, r) => s + r.shareMinor, 0n)).toBe(4_500_000n);
    });

    it('returns empty when seatMonthlyMinor is null or non-positive (K1/K4 without monthly tracking)', () => {
      expect(
        monthRowsOf({
          commitmentId: C_ID,
          year: 2027,
          amountMinor: 1_000_000n,
          seatMonthlyMinor: null,
          months: monthsRange(2027, 1, 2),
        }),
      ).toEqual([]);
    });
  });

  describe('applyToMonth (including Ca E mutation killer against dropping min)', () => {
    it('caps applied at remaining share of the month and puts excess in unallocatedMinor (Ca E: 550k vs 500k)', () => {
      expect(
        applyToMonth({ amountMinor: 550_000n, shareMinor: 500_000n, appliedMinor: 0n, releasedMinor: 0n }),
      ).toEqual({ appliedMinor: 500_000n, unallocatedMinor: 50_000n });
    });

    it('applies full amount when remaining share covers it and never crosses negative when already exhausted', () => {
      expect(
        applyToMonth({ amountMinor: 450_000n, shareMinor: 500_000n, appliedMinor: 0n, releasedMinor: 0n }),
      ).toEqual({ appliedMinor: 450_000n, unallocatedMinor: 0n });
      expect(
        applyToMonth({ amountMinor: 100_000n, shareMinor: 500_000n, appliedMinor: 300_000n, releasedMinor: 200_000n }),
      ).toEqual({ appliedMinor: 0n, unallocatedMinor: 100_000n });
    });
  });

  describe('spreadRelease, spreadBySeatMonthly, spreadRemainder, settlementOf, stateOf', () => {
    it('spreadRemainder takes from the last month backwards (Ca L: months 11, 12 = 500k each)', () => {
      const slices = [slice(2027, 11), slice(2027, 12)];
      expect(spreadRemainder(slices, 700_000n)).toEqual({
        allocations: [
          { month: '2027-12-01', takeMinor: 500_000n },
          { month: '2027-11-01', takeMinor: 200_000n },
        ],
        totalTakenMinor: 700_000n,
      });
    });

    it('spreadBySeatMonthly releases s per month for one withdrawn seat in a group', () => {
      const slices = [slice(2026, 11, 1_500_000n), slice(2026, 12, 1_500_000n)];
      expect(spreadBySeatMonthly(slices, 1_000_000n, STANDARD)).toEqual({
        allocations: [
          { month: '2026-11-01', takeMinor: 500_000n },
          { month: '2026-12-01', takeMinor: 500_000n },
        ],
        totalTakenMinor: 1_000_000n,
      });
    });

    it('stateOf transitions HELD -> EXPENSED (when Σ applied > 0) or RELEASED (when Σ applied = 0)', () => {
      expect(stateOf({ amountMinor: 1_000n, appliedMinor: 500n, releasedMinor: 0n })).toBe('HELD');
      expect(stateOf({ amountMinor: 1_000n, appliedMinor: 500n, releasedMinor: 500n })).toBe('EXPENSED');
      expect(stateOf({ amountMinor: 1_000n, appliedMinor: 0n, releasedMinor: 1_000n })).toBe('RELEASED');
    });
  });
});
