import { monthCostBefore, releaseOnRevocation } from '../../../../core/seat-month-cost';
import { roundHalfAway } from '../../seat-month/seat-month.policy';
import {
  applyToMonth,
  settlementOf,
  spreadRelease,
  spreadRemainder,
  stateOf,
  type MonthlySliceState,
} from './commitment-month.policy';

const STANDARD = 500_000n;

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

const sumSlices = (rows: readonly MonthlySliceState[]) => ({
  applied: rows.reduce((s, r) => s + r.appliedMinor, 0n),
  released: rows.reduce((s, r) => s + r.releasedMinor, 0n),
  share: rows.reduce((s, r) => s + r.shareMinor, 0n),
});

describe('commitment-month policy cases J..F15 (W3-07)', () => {
  it.each([
    [
      'J: granted 31/01/2027 -> end 15/03/2027 -> LATE_GRANT 1 = 483.871, applied 1/2/3 = 16.129/500k/241.935, MONTH_END 3 = 258.065',
      () => {
        const rows = [slice(2027, 1), slice(2027, 2), slice(2027, 3)];
        const late1 = monthCostBefore(STANDARD, '2027-01-31');
        rows[0].releasedMinor += spreadRelease(rows, [{ month: '2027-01-01', amountMinor: late1 }]).totalTakenMinor;
        const app1 = applyToMonth({ amountMinor: roundHalfAway(STANDARD * 1n, 31n), ...rows[0] }).appliedMinor;
        rows[0].appliedMinor += app1;
        const app2 = applyToMonth({ amountMinor: STANDARD, ...rows[1] }).appliedMinor;
        rows[1].appliedMinor += app2;
        const app3 = applyToMonth({ amountMinor: roundHalfAway(STANDARD * 15n, 31n), ...rows[2] }).appliedMinor;
        rows[2].appliedMinor += app3;
        const settle1 = settlementOf(rows[0]);
        const settle2 = settlementOf(rows[1]);
        const settle3 = settlementOf(rows[2]);
        rows[2].releasedMinor += settle3;
        const sums = sumSlices(rows);
        return {
          late1,
          app1,
          app2,
          app3,
          settle1,
          settle2,
          settle3,
          totalEnd: sums.applied + sums.released,
        };
      },
      {
        late1: 483_871n,
        app1: 16_129n,
        app2: 500_000n,
        app3: 241_935n,
        settle1: 0n,
        settle2: 0n,
        settle3: 258_065n,
        totalEnd: 1_500_000n,
      },
    ],
    [
      'K & F3: settle 3 (50.000), reverse 100.000 -> settle 3 again = 100.000, third pass = 0 -> Σ MONTH_END = 150.000',
      () => {
        const m3 = slice(2027, 3, STANDARD, 450_000n);
        const first = settlementOf(m3);
        m3.releasedMinor += first;
        m3.appliedMinor -= 100_000n;
        const second = settlementOf(m3);
        m3.releasedMinor += second;
        const third = settlementOf(m3);
        return { first, second, third, totalMonthEnd: first + second };
      },
      { first: 50_000n, second: 100_000n, third: 0n, totalMonthEnd: 150_000n },
    ],
    [
      'L: months 11, 12 hold 1.000.000 -> spreadRemainder takes 12: 500k, 11: 500k -> EXPENSED',
      () => {
        const rows = [
          ...monthsRange(2027, 1, 10).map((m) => ({
            month: m.month,
            shareMinor: STANDARD,
            appliedMinor: STANDARD,
            releasedMinor: 0n,
          })),
          slice(2027, 11),
          slice(2027, 12),
        ];
        const rem = spreadRemainder(rows, 1_000_000n);
        rows[11].releasedMinor += rem.allocations[0].takeMinor;
        rows[10].releasedMinor += rem.allocations[1].takeMinor;
        const sums = sumSlices(rows);
        return {
          allocations: rem.allocations,
          state: stateOf({ amountMinor: 6_000_000n, appliedMinor: sums.applied, releasedMinor: sums.released }),
          totalEnd: sums.applied + sums.released,
        };
      },
      {
        allocations: [
          { month: '2027-12-01', takeMinor: 500_000n },
          { month: '2027-11-01', takeMinor: 500_000n },
        ],
        state: 'EXPENSED',
        totalEnd: 6_000_000n,
      },
    ],
    [
      'F1: settle 1, 2 (500k each), grant 10/03 -> LATE_GRANT receives ONLY 145.161 on month 3 (not 1.145.161)',
      () => {
        const rows = monthsRange(2027, 1, 12).map((m) => ({
          month: m.month,
          shareMinor: STANDARD,
          appliedMinor: 0n,
          releasedMinor: 0n,
        }));
        rows[0].releasedMinor = settlementOf(rows[0]);
        rows[1].releasedMinor = settlementOf(rows[1]);
        const targets = [
          { month: '2027-01-01', amountMinor: STANDARD },
          { month: '2027-02-01', amountMinor: STANDARD },
          { month: '2027-03-01', amountMinor: monthCostBefore(STANDARD, '2027-03-10') },
        ];
        const rel = spreadRelease(rows, targets);
        rows[2].releasedMinor += rel.allocations[0].takeMinor;
        const app3 = applyToMonth({ amountMinor: roundHalfAway(STANDARD * 22n, 31n), ...rows[2] }).appliedMinor;
        rows[2].appliedMinor += app3;
        const settle3 = settlementOf(rows[2]);
        const released1to3 = rows[0].releasedMinor + rows[1].releasedMinor + rows[2].releasedMinor;
        return { lateGrantRecorded: rel.totalTakenMinor, applied3: app3, settle3, released1to3 };
      },
      { lateGrantRecorded: 145_161n, applied3: 354_839n, settle3: 0n, released1to3: 1_145_161n },
    ],
    [
      'F2: K2 15/03..14/06/2027 (rows 3..6 = 2M), revoked 10/04 -> REVOKED 4=350k, 5=500k, 6=500k, applied 4=150k',
      () => {
        const rows = [slice(2027, 3), slice(2027, 4), slice(2027, 5), slice(2027, 6)];
        rows[0].appliedMinor = STANDARD;
        const rev = releaseOnRevocation({ monthlyMinor: STANDARD, endsOn: '2027-04-10', lastMonth: 6 });
        expect(rev).toBe(1_350_000n);
        const targets = [
          { month: '2027-04-01', amountMinor: STANDARD - monthCostBefore(STANDARD, '2027-04-10') },
          { month: '2027-05-01', amountMinor: STANDARD },
          { month: '2027-06-01', amountMinor: STANDARD },
        ];
        const rel = spreadRelease(rows, targets);
        rel.allocations.forEach((a, i) => {
          rows[i + 1].releasedMinor += a.takeMinor;
        });
        const app4 = applyToMonth({ amountMinor: roundHalfAway(STANDARD * 9n, 30n), ...rows[1] }).appliedMinor;
        rows[1].appliedMinor += app4;
        const sums = sumSlices(rows);
        return {
          allocations: rel.allocations,
          applied4: app4,
          state: stateOf({ amountMinor: 2_000_000n, appliedMinor: sums.applied, releasedMinor: sums.released }),
          totalEnd: sums.applied + sums.released,
        };
      },
      {
        allocations: [
          { month: '2027-04-01', takeMinor: 350_000n },
          { month: '2027-05-01', takeMinor: 500_000n },
          { month: '2027-06-01', takeMinor: 500_000n },
        ],
        applied4: 150_000n,
        state: 'EXPENSED',
        totalEnd: 2_000_000n,
      },
    ],
    [
      "F3': Ca B (EXPENSED with 225.806) reversed -> HELD -> next settle MONTH_END 1 = 225.806 -> RELEASED",
      () => {
        const rows = monthsRange(2027, 1, 12).map((m, i) => ({
          month: m.month,
          shareMinor: STANDARD,
          appliedMinor: i === 0 ? 225_806n : 0n,
          releasedMinor: i === 0 ? 274_194n : STANDARD,
        }));
        expect(stateOf({ amountMinor: 6_000_000n, appliedMinor: 225_806n, releasedMinor: 5_774_194n })).toBe(
          'EXPENSED',
        );
        rows[0].appliedMinor -= 225_806n;
        const sumsAfterRev = sumSlices(rows);
        const stateAfterRev = stateOf({
          amountMinor: 6_000_000n,
          appliedMinor: sumsAfterRev.applied,
          releasedMinor: sumsAfterRev.released,
        });
        const settle1 = settlementOf(rows[0]);
        rows[0].releasedMinor += settle1;
        const sumsEnd = sumSlices(rows);
        return {
          stateAfterRev,
          settle1,
          stateEnd: stateOf({
            amountMinor: 6_000_000n,
            appliedMinor: sumsEnd.applied,
            releasedMinor: sumsEnd.released,
          }),
          totalEnd: sumsEnd.applied + sumsEnd.released,
        };
      },
      { stateAfterRev: 'HELD', settle1: 225_806n, stateEnd: 'RELEASED', totalEnd: 6_000_000n },
    ],
    [
      'F15: granted 05/02/2027, revoked 09/02/2027 (28d) -> LATE_GRANT 71.429 + REVOKED 357.143 -> applied 71.428 (1d unallocated)',
      () => {
        const m2 = slice(2027, 2);
        const late = monthCostBefore(STANDARD, '2027-02-05');
        const relLate = spreadRelease([m2], [{ month: '2027-02-01', amountMinor: late }]);
        m2.releasedMinor += relLate.totalTakenMinor;
        const rev = STANDARD - monthCostBefore(STANDARD, '2027-02-09');
        const relRev = spreadRelease([m2], [{ month: '2027-02-01', amountMinor: rev }]);
        m2.releasedMinor += relRev.totalTakenMinor;
        const seat2 = roundHalfAway(STANDARD * 4n, 28n);
        const app2 = applyToMonth({ amountMinor: seat2, ...m2 });
        m2.appliedMinor += app2.appliedMinor;
        return {
          late: relLate.totalTakenMinor,
          rev: relRev.totalTakenMinor,
          applied2: app2.appliedMinor,
          unallocated: app2.unallocatedMinor,
          totalEnd: m2.appliedMinor + m2.releasedMinor,
        };
      },
      { late: 71_429n, rev: 357_143n, applied2: 71_428n, unallocated: 1n, totalEnd: 500_000n },
    ],
  ])('%s', (_name, run, expected) => {
    expect(run()).toEqual(expected);
  });
});
