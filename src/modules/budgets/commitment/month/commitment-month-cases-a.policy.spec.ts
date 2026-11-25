import { monthCostBefore, releaseOnLateGrant } from '../../../../core/seat-month-cost';
import { roundHalfAway } from '../../seat-month/seat-month.policy';
import {
  applyToMonth,
  monthRowsOf,
  settlementOf,
  spreadRelease,
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

const sumSlices = (rows: readonly MonthlySliceState[]) => ({
  applied: rows.reduce((s, r) => s + r.appliedMinor, 0n),
  released: rows.reduce((s, r) => s + r.releasedMinor, 0n),
  share: rows.reduce((s, r) => s + r.shareMinor, 0n),
});

describe('commitment-month policy cases A..G (W3-07)', () => {
  it.each([
    [
      'A: Lan 21/11/2026 -> LATE_GRANT 333.333, applied 11 = 166.667, settle 11 = 0, held 12 = 500.000',
      () => {
        const rows = monthRowsOf({
          commitmentId: C_ID,
          year: 2026,
          amountMinor: 1_000_000n,
          seatMonthlyMinor: STANDARD,
          months: monthsRange(2026, 11, 12),
        }).map((r) => ({ ...r, appliedMinor: 0n, releasedMinor: 0n }));
        const late = monthCostBefore(STANDARD, '2026-11-21');
        const rel = spreadRelease(rows, [{ month: '2026-11-01', amountMinor: late }]);
        rows[0].releasedMinor += rel.allocations[0].takeMinor;
        const seat11 = roundHalfAway(STANDARD * 10n, 30n);
        const app11 = applyToMonth({ amountMinor: seat11, ...rows[0] });
        rows[0].appliedMinor += app11.appliedMinor;
        const settle11 = settlementOf(rows[0]);
        const before12 = sumSlices([rows[0], { ...rows[1], releasedMinor: 0n }]);
        const settle12 = settlementOf(rows[1]);
        rows[1].releasedMinor += settle12;
        return {
          late: rel.totalTakenMinor,
          applied11: app11.appliedMinor,
          settle11,
          stateBefore12: stateOf({
            amountMinor: 1_000_000n,
            appliedMinor: before12.applied,
            releasedMinor: before12.released,
          }),
          totalEnd: sumSlices(rows).applied + sumSlices(rows).released,
        };
      },
      { late: 333_333n, applied11: 166_667n, settle11: 0n, stateBefore12: 'HELD', totalEnd: 1_000_000n },
    ],
    [
      'B: Hung YEAR_START 2027 6M, revoked 15/01 -> release 1=274.194, 2..12=500k, total=5.774.194, applied 1=225.806, EXPENSED',
      () => {
        const rows = monthsRange(2027, 1, 12).map((m) => ({
          month: m.month,
          shareMinor: STANDARD,
          appliedMinor: 0n,
          releasedMinor: 0n,
        }));
        const targets = [
          { month: '2027-01-01', amountMinor: STANDARD - monthCostBefore(STANDARD, '2027-01-15') },
          ...monthsRange(2027, 2, 12).map((m) => ({ month: m.month, amountMinor: STANDARD })),
        ];
        const rel = spreadRelease(rows, targets);
        rel.allocations.forEach((a, i) => {
          rows[i].releasedMinor += a.takeMinor;
        });
        const seat1 = roundHalfAway(STANDARD * 14n, 31n);
        const app1 = applyToMonth({ amountMinor: seat1, ...rows[0] });
        rows[0].appliedMinor += app1.appliedMinor;
        const settle1 = settlementOf(rows[0]);
        const sums = sumSlices(rows);
        return {
          revoked1: rel.allocations[0].takeMinor,
          revokedTotal: rel.totalTakenMinor,
          applied1: app1.appliedMinor,
          settle1,
          state: stateOf({ amountMinor: 6_000_000n, appliedMinor: sums.applied, releasedMinor: sums.released }),
          totalEnd: sums.applied + sums.released,
        };
      },
      {
        revoked1: 274_194n,
        revokedTotal: 5_774_194n,
        applied1: 225_806n,
        settle1: 0n,
        state: 'EXPENSED',
        totalEnd: 6_000_000n,
      },
    ],
    [
      'C: approved 15/12/2026 ungranted -> MONTH_END 12 = 500.000, RELEASED',
      () => {
        const rows = [slice(2026, 12)];
        const settle12 = settlementOf(rows[0]);
        rows[0].releasedMinor += settle12;
        return {
          settle12,
          state: stateOf({ amountMinor: 500_000n, appliedMinor: 0n, releasedMinor: settle12 }),
          totalEnd: settle12,
        };
      },
      { settle12: 500_000n, state: 'RELEASED', totalEnd: 500_000n },
    ],
    [
      "C': YEAR_START 2027 granted 10/01 -> LATE_GRANT 1 = 145.161, applied 1 = 354.839, settle 1 = 0",
      () => {
        const rows = monthsRange(2027, 1, 12).map((m) => ({
          month: m.month,
          shareMinor: STANDARD,
          appliedMinor: 0n,
          releasedMinor: 0n,
        }));
        const late1 = releaseOnLateGrant({ monthlyMinor: STANDARD, grantedOn: '2027-01-10', firstMonth: 1 });
        const rel = spreadRelease(rows, [{ month: '2027-01-01', amountMinor: late1 }]);
        rows[0].releasedMinor += rel.allocations[0].takeMinor;
        const seat1 = roundHalfAway(STANDARD * 22n, 31n);
        const app1 = applyToMonth({ amountMinor: seat1, ...rows[0] });
        rows[0].appliedMinor += app1.appliedMinor;
        return { late1: rel.totalTakenMinor, applied1: app1.appliedMinor, settle1: settlementOf(rows[0]) };
      },
      { late1: 145_161n, applied1: 354_839n, settle1: 0n },
    ],
    [
      'D: price drop 500k -> 450k on 15/03 -> month 2 = 500k, month 3 applied = 450k, MONTH_END 3 = 50.000',
      () => {
        const m2 = slice(2027, 2, STANDARD, 500_000n);
        const m3 = slice(2027, 3, STANDARD);
        const app3 = applyToMonth({ amountMinor: 450_000n, ...m3 });
        m3.appliedMinor += app3.appliedMinor;
        const settle3 = settlementOf(m3);
        return { applied2: m2.appliedMinor, applied3: app3.appliedMinor, settle3 };
      },
      { applied2: 500_000n, applied3: 450_000n, settle3: 50_000n },
    ],
    [
      'D2: price drop 500k -> 450k on 02/04 (month 3 already run) -> month 3 MONTH_END = 0, month 4 MONTH_END = 50.000',
      () => {
        const m3 = slice(2027, 3, STANDARD, 500_000n);
        const m4 = slice(2027, 4, STANDARD, 450_000n);
        return { settle3: settlementOf(m3), settle4: settlementOf(m4) };
      },
      { settle3: 0n, settle4: 50_000n },
    ],
    [
      'E: price rise 500k -> 550k on 10/07 -> months 7..12 applied 500k each (50k unallocated), year actual 6.3M, applied 6.0M',
      () => {
        const rows = monthsRange(2027, 1, 12).map((_, idx) => {
          const cost = idx < 6 ? 500_000n : 550_000n;
          const s = slice(2027, idx + 1);
          const app = applyToMonth({ amountMinor: cost, ...s });
          return { ...s, appliedMinor: app.appliedMinor, unallocated: app.unallocatedMinor, cost };
        });
        return {
          m7Applied: rows[6].appliedMinor,
          m7Unallocated: rows[6].unallocated,
          totalActual: rows.reduce((a, r) => a + r.cost, 0n),
          totalApplied: rows.reduce((a, r) => a + r.appliedMinor, 0n),
        };
      },
      { m7Applied: 500_000n, m7Unallocated: 50_000n, totalActual: 6_300_000n, totalApplied: 6_000_000n },
    ],
    [
      'F: legacy commitment 2026 (no month rows) 1.000.000, applied 700.000 -> YEAR_END_SEAT_MONTHS 300.000, EXPENSED',
      () => {
        const release = settlementOf({ shareMinor: 1_000_000n, appliedMinor: 700_000n, releasedMinor: 0n });
        return { release, state: stateOf({ amountMinor: 1_000_000n, appliedMinor: 700_000n, releasedMinor: release }) };
      },
      { release: 300_000n, state: 'EXPENSED' },
    ],
    [
      'G: transfer 26/03/2027 (31d) -> old dept applied 3 = 403.226, TRANSFER_EFFECTIVE 3 = 96.774, 4..12 = 500k, settle 3 = 0',
      () => {
        const rows = monthsRange(2027, 1, 12).map((m) => ({
          month: m.month,
          shareMinor: STANDARD,
          appliedMinor: 0n,
          releasedMinor: 0n,
        }));
        rows[0].appliedMinor = STANDARD;
        rows[1].appliedMinor = STANDARD;
        const targets = [
          { month: '2027-03-01', amountMinor: STANDARD - monthCostBefore(STANDARD, '2027-03-26') },
          ...monthsRange(2027, 4, 12).map((m) => ({ month: m.month, amountMinor: STANDARD })),
        ];
        const rel = spreadRelease(rows, targets);
        rel.allocations.forEach((a, i) => {
          rows[i + 2].releasedMinor += a.takeMinor;
        });
        const seat3 = roundHalfAway(STANDARD * 25n, 31n);
        const app3 = applyToMonth({ amountMinor: seat3, ...rows[2] });
        rows[2].appliedMinor += app3.appliedMinor;
        const sums = sumSlices(rows);
        return {
          applied3: app3.appliedMinor,
          transfer3: rel.allocations[0].takeMinor,
          settle3: settlementOf(rows[2]),
          totalEnd: sums.applied + sums.released,
        };
      },
      { applied3: 403_226n, transfer3: 96_774n, settle3: 0n, totalEnd: 6_000_000n },
    ],
  ])('%s', (_name, run, expected) => {
    expect(run()).toEqual(expected);
  });
});
