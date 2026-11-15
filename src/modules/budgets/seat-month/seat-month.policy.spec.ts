import {
  commitmentApplication,
  endedMonthsOf,
  roundHalfAway,
  splitSeatMonth,
  stockLineMinor,
} from './seat-month.policy';
import type { PlacementPeriod } from './seat-month.types';

const A = 'dept-a';
const B = 'dept-b';
const C = 'dept-c';
const OPEN = null;

const placed = (...periods: [string, string, string | null][]): PlacementPeriod[] =>
  periods.map(([departmentId, from, to]) => ({ departmentId, from, to }));

describe('the cost of a K2 seat in a month, split by the day (SM-1.1; T-SM1)', () => {
  describe('roundHalfAway', () => {
    it('rounds the half of a unit away from zero, whatever the sign', () => {
      expect(roundHalfAway(1n, 2n)).toBe(1n);
      expect(roundHalfAway(-1n, 2n)).toBe(-1n);
      expect(roundHalfAway(7n, 3n)).toBe(2n);
      expect(roundHalfAway(5n, 3n)).toBe(2n);
      expect(roundHalfAway(4n, 3n)).toBe(1n);
      expect(roundHalfAway(0n, 31n)).toBe(0n);
    });
  });

  describe('splitSeatMonth', () => {
    it('charges the department that held the seat for the whole month its whole price', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 400_000n,
        month: '2026-10-01',
        held: { from: '2026-01-05', until: OPEN },
        placements: placed([A, '2026-01-01', OPEN]),
      });

      expect(segments).toEqual([{ departmentId: A, days: 31, amountMinor: 400_000n }]);
    });

    it('T-SM1: a seat of 400.000 đ moved on Monday 26/10/2026 costs the old department 25/31 and the new one 6/31, the two adding up to the price', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 400_000n,
        month: '2026-10-01',
        held: { from: '2026-03-01', until: OPEN },
        placements: placed([A, '2026-01-01', '2026-10-26'], [B, '2026-10-26', OPEN]),
      });

      expect(segments).toEqual([
        { departmentId: A, days: 25, amountMinor: 322_581n },
        { departmentId: B, days: 6, amountMinor: 77_419n },
      ]);
      expect(segments.reduce((sum, segment) => sum + segment.amountMinor, 0n)).toBe(400_000n);
    });

    it('puts what rounding leaves over on the last stretch, so the stretches always add up to the price of the days held', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 100n,
        month: '2026-09-01',
        held: { from: '2026-01-01', until: OPEN },
        placements: placed([A, '2026-01-01', '2026-09-11'], [B, '2026-09-11', '2026-09-21'], [C, '2026-09-21', OPEN]),
      });

      expect(segments.map((segment) => segment.days)).toEqual([10, 10, 10]);
      expect(segments.map((segment) => segment.amountMinor)).toEqual([33n, 33n, 34n]);
    });

    it('charges only the days from the day the right begins, a share of the month of the price rounded half away from zero', () => {
      // 15 over 30 days, 1 day: 0,5 is rounded up to 1.
      const segments = splitSeatMonth({
        monthlyPriceMinor: 15n,
        month: '2026-09-01',
        held: { from: '2026-09-30', until: OPEN },
        placements: placed([A, '2026-01-01', OPEN]),
      });

      expect(segments).toEqual([{ departmentId: A, days: 1, amountMinor: 1n }]);
    });

    it('stops at the day the seat is taken back: the days after it are not the department (they fall to the pool line)', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 300_000n,
        month: '2026-11-01',
        held: { from: '2026-01-01', until: '2026-11-16' },
        placements: placed([A, '2026-01-01', OPEN]),
      });

      expect(segments).toEqual([{ departmentId: A, days: 15, amountMinor: 150_000n }]);
    });

    it('gives nothing for a seat not held in the month, before it began or after it ended', () => {
      const month = '2026-11-01';
      const placements = placed([A, '2026-01-01', OPEN]);

      expect(
        splitSeatMonth({ monthlyPriceMinor: 300_000n, month, held: { from: '2026-12-01', until: OPEN }, placements }),
      ).toEqual([]);
      expect(
        splitSeatMonth({
          monthlyPriceMinor: 300_000n,
          month,
          held: { from: '2026-01-01', until: '2026-11-01' },
          placements,
        }),
      ).toEqual([]);
    });

    it('leaves out the days nobody was placed (the person was in no department): they are not charged to a department', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 300_000n,
        month: '2026-11-01',
        held: { from: '2026-01-01', until: OPEN },
        placements: placed([A, '2026-01-01', '2026-11-11']),
      });

      expect(segments).toEqual([{ departmentId: A, days: 10, amountMinor: 100_000n }]);
    });

    it('adds the days of a department that held the person twice in the month into one stretch, and the last day decides which stretch is last', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 300_000n,
        month: '2026-11-01',
        held: { from: '2026-01-01', until: OPEN },
        placements: placed([A, '2026-01-01', '2026-11-11'], [B, '2026-11-11', '2026-11-21'], [A, '2026-11-21', OPEN]),
      });

      expect(segments).toEqual([
        { departmentId: B, days: 10, amountMinor: 100_000n },
        { departmentId: A, days: 20, amountMinor: 200_000n },
      ]);
    });

    it('charges a fixed department for every day (a service account answers to the department that owns it), whoever holds it', () => {
      const segments = splitSeatMonth({
        monthlyPriceMinor: 300_000n,
        month: '2026-11-01',
        held: { from: '2026-01-01', until: OPEN },
        placements: placed([A, '2026-01-01', '2026-11-11'], [B, '2026-11-11', OPEN]),
        fixedDepartmentId: C,
      });

      expect(segments).toEqual([{ departmentId: C, days: 30, amountMinor: 300_000n }]);
    });
  });

  describe('commitmentApplication', () => {
    it('takes the commitment of the same Cost Center down by the amount, no more than it still holds', () => {
      expect(commitmentApplication({ amountMinor: 400_000n, heldMinor: 1_000_000n, sameCostCenter: true })).toBe(
        400_000n,
      );
      expect(commitmentApplication({ amountMinor: 400_000n, heldMinor: 150_000n, sameCostCenter: true })).toBe(
        150_000n,
      );
      expect(commitmentApplication({ amountMinor: 400_000n, heldMinor: 0n, sameCostCenter: true })).toBe(0n);
    });

    it('leaves a commitment of another Cost Center, or no commitment, alone: the department bears the cost without one', () => {
      expect(commitmentApplication({ amountMinor: 400_000n, heldMinor: 1_000_000n, sameCostCenter: false })).toBe(0n);
    });
  });

  describe('stockLineMinor', () => {
    it('is what the invoices of the pool cost less what the seats took', () => {
      // MG-03: 10 seats bought, 6 + 2 held, 2 idle.
      expect(stockLineMinor({ invoicedMinor: 4_000_000n, allocatedMinor: 3_200_000n })).toBe(800_000n);
      expect(stockLineMinor({ invoicedMinor: 0n, allocatedMinor: 0n })).toBe(0n);
    });
  });

  describe('endedMonthsOf', () => {
    it('lists the months of the year before the month of today, and December of the year before in January', () => {
      expect(endedMonthsOf('2026-11-15')).toEqual([
        '2026-01-01',
        '2026-02-01',
        '2026-03-01',
        '2026-04-01',
        '2026-05-01',
        '2026-06-01',
        '2026-07-01',
        '2026-08-01',
        '2026-09-01',
        '2026-10-01',
      ]);
      expect(endedMonthsOf('2027-01-01')).toEqual(['2026-12-01']);
      expect(endedMonthsOf('2027-02-01')).toEqual(['2027-01-01']);
    });
  });
});
