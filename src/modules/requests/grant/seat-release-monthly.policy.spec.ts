import type { SeatCommitment } from '../../budgets/public/budgets.types';
import { lateGrantBreakdown, revocationBreakdown, revocationShare, type SeatCoverage } from './seat-release.policy';

const commitment = (over: Partial<SeatCommitment> = {}): SeatCommitment => ({
  requestId: 'r1',
  year: 2026,
  origin: 'APPROVAL',
  seatMonthlyMinor: 1500n,
  heldMinor: 4500n,
  transferReleases: [],
  ...over,
});

const coverage = (over: Partial<SeatCoverage> = {}): SeatCoverage => ({
  endDate: null,
  lastMonthBeginsOn: null,
  budgetYear: 2026,
  amountMonths: 3,
  ...over,
});

describe('seat-release policy W3-07 F1 / F2 / F15 monthly-sliced K2 breakdowns', () => {
  it('F2: uses min/max month from commitment.months instead of SeatCoverage lastMonthBeginsOn (15/03..14/06 -> rows 3..6, revoked 10/04)', () => {
    const k2Commitment = commitment({
      year: 2027,
      seatMonthlyMinor: 500_000n,
      heldMinor: 1_500_000n,
      months: ['2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01'],
    });
    const k2Coverage = coverage({
      endDate: '2027-06-14',
      lastMonthBeginsOn: '2027-05-15',
      budgetYear: 2027,
      amountMonths: 3,
    });

    const breakdown = revocationBreakdown({
      commitment: k2Commitment,
      coverage: k2Coverage,
      endsOn: '2027-04-10',
      currentYear: 2027,
    });

    expect(breakdown).toEqual({
      amountMinor: 1_350_000n,
      months: [
        { month: '2027-04-01', amountMinor: 350_000n },
        { month: '2027-05-01', amountMinor: 500_000n },
        { month: '2027-06-01', amountMinor: 500_000n },
      ],
    });
    expect(
      revocationShare({ commitment: k2Commitment, coverage: k2Coverage, endsOn: '2027-04-10', currentYear: 2027 }),
    ).toBe(1_350_000n);
  });

  it('F1: lateGrantBreakdown emits per-month targets from first commitment slice to grant month', () => {
    const yrCommitment = commitment({
      year: 2027,
      origin: 'YEAR_START',
      seatMonthlyMinor: 500_000n,
      heldMinor: 5_000_000n,
      months: Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}-01`),
    });

    expect(
      lateGrantBreakdown({
        commitment: yrCommitment,
        coverage: coverage({ budgetYear: 2027 }),
        grantedOn: '2027-03-10',
        currentYear: 2027,
      }),
    ).toEqual({
      amountMinor: 1_145_161n,
      months: [
        { month: '2027-01-01', amountMinor: 500_000n },
        { month: '2027-02-01', amountMinor: 500_000n },
        { month: '2027-03-01', amountMinor: 145_161n },
      ],
    });
  });

  it('F15: granted 05/02 and revoked 09/02 on 28-day February emits exact monthly breakdowns', () => {
    const febCommitment = commitment({
      year: 2027,
      seatMonthlyMinor: 500_000n,
      heldMinor: 500_000n,
      months: ['2027-02-01'],
    });
    const cov = coverage({ budgetYear: 2027, endDate: '2027-02-28', amountMonths: 1 });

    expect(
      lateGrantBreakdown({ commitment: febCommitment, coverage: cov, grantedOn: '2027-02-05', currentYear: 2027 }),
    ).toEqual({
      amountMinor: 71_429n,
      months: [{ month: '2027-02-01', amountMinor: 71_429n }],
    });
    expect(
      revocationBreakdown({
        commitment: { ...febCommitment, heldMinor: 428_571n },
        coverage: cov,
        endsOn: '2027-02-09',
        currentYear: 2027,
      }),
    ).toEqual({
      amountMinor: 357_143n,
      months: [{ month: '2027-02-01', amountMinor: 357_143n }],
    });
  });
});
