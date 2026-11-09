import type { SeatCommitment } from '../../budgets/public/budgets.types';
import {
  firstMonthOf,
  lastMonthOf,
  lateGrantShare,
  releasesBeforeGrant,
  revocationEndsOn,
  revocationShare,
  type SeatCoverage,
} from './seat-release.policy';

const commitment = (over: Partial<SeatCommitment> = {}): SeatCommitment => ({
  requestId: 'r1',
  year: 2026,
  origin: 'APPROVAL',
  seatMonthlyMinor: 1500n,
  heldMinor: 4500n,
  ...over,
});

/** A request whose amount was worked out in 2026 for October to December, with no end. */
const coverage = (over: Partial<SeatCoverage> = {}): SeatCoverage => ({
  endDate: null,
  budgetYear: 2026,
  amountMonths: 3,
  ...over,
});

describe('seat-release policy (RV-07, M-06, M-10)', () => {
  describe('revocationShare', () => {
    it('uses the days before the day it ends in that month: 16/11 of a month of 30 days at 15.00 a month has used 7.50', () => {
      // October and November and December held (45.00): October used, 15 days of November used (7.50), the rest goes back.
      expect(
        revocationShare({ commitment: commitment(), coverage: coverage(), endsOn: '2026-11-16', currentYear: 2026 }),
      ).toBe(1500n * 2n - 750n);
    });

    it('a right that ends on day 1 has used nothing of that month', () => {
      expect(
        revocationShare({ commitment: commitment(), coverage: coverage(), endsOn: '2026-11-01', currentYear: 2026 }),
      ).toBe(3000n);
    });

    it('rounds the share of the month half up to the smallest unit', () => {
      // 1 unit a month: 15 of 30 days is 0.5, which is 1 used; November and December are 2, so 1 goes back.
      expect(
        revocationShare({
          commitment: commitment({ seatMonthlyMinor: 1n, heldMinor: 3n }),
          coverage: coverage(),
          endsOn: '2026-11-16',
          currentYear: 2026,
        }),
      ).toBe(1n);
      // 10.00 a month: 1 of 31 days of October is 32.26, rounded to 32 used.
      expect(
        revocationShare({
          commitment: commitment({ seatMonthlyMinor: 1000n, heldMinor: 3000n }),
          coverage: coverage(),
          endsOn: '2026-10-02',
          currentYear: 2026,
        }),
      ).toBe(3000n - 32n);
    });

    it('never gives back more than the commitment still holds (part became an expense)', () => {
      expect(
        revocationShare({
          commitment: commitment({ heldMinor: 100n }),
          coverage: coverage(),
          endsOn: '2026-11-01',
          currentYear: 2026,
        }),
      ).toBe(100n);
    });

    it('leaves a commitment of a closed year as it is', () => {
      expect(
        revocationShare({
          commitment: commitment({ year: 2025 }),
          coverage: coverage({ budgetYear: 2025 }),
          endsOn: '2026-01-10',
          currentYear: 2026,
        }),
      ).toBe(0n);
    });

    it('gives nothing back without a price a month kept on the commitment or with nothing held', () => {
      const facts = { coverage: coverage(), endsOn: '2026-11-01', currentYear: 2026 };
      expect(revocationShare({ ...facts, commitment: commitment({ seatMonthlyMinor: null }) })).toBe(0n);
      expect(revocationShare({ ...facts, commitment: commitment({ heldMinor: 0n }) })).toBe(0n);
    });

    it('a time-limited right gives back only the months it covers: to 30/09, ended 15/08', () => {
      // Held July to September (3 × 15.00); 14 of 31 days of August used.
      const limited = coverage({ endDate: '2026-09-30', amountMonths: 3 });
      expect(
        revocationShare({ commitment: commitment(), coverage: limited, endsOn: '2026-08-15', currentYear: 2026 }),
      ).toBe(1500n * 2n - (1500n * 14n * 2n + 31n) / 62n);
      // Ended on the day after its end: nothing is left to give back.
      expect(
        revocationShare({ commitment: commitment(), coverage: limited, endsOn: '2026-10-01', currentYear: 2026 }),
      ).toBe(0n);
    });

    it('a request to go on using whose months begin after the end gives back all of them, the one before only its own months', () => {
      // R6 covers March to June, R7 (going on using) July to December; the right ends on 01/05.
      const r6 = coverage({ endDate: '2026-06-30', amountMonths: 4 });
      const r7 = coverage({ endDate: '2026-12-31', amountMonths: 6 });
      expect(
        revocationShare({
          commitment: commitment({ heldMinor: 6000n }),
          coverage: r6,
          endsOn: '2026-05-01',
          currentYear: 2026,
        }),
      ).toBe(3000n);
      expect(
        revocationShare({
          commitment: commitment({ requestId: 'r7', heldMinor: 9000n }),
          coverage: r7,
          endsOn: '2026-05-01',
          currentYear: 2026,
        }),
      ).toBe(9000n);
    });

    it('a commitment of a year after the end gives back every month it covers; one of a year before the end gives nothing', () => {
      const yearStart = commitment({ year: 2027, origin: 'YEAR_START', heldMinor: 18_000n });
      expect(
        revocationShare({ commitment: yearStart, coverage: coverage(), endsOn: '2026-12-20', currentYear: 2026 }),
      ).toBe(18_000n);
      expect(
        revocationShare({ commitment: commitment(), coverage: coverage(), endsOn: '2027-01-05', currentYear: 2026 }),
      ).toBe(0n);
    });
  });

  describe('revocationEndsOn', () => {
    it('K2 ends on the day the right ends; K1 on the day after the last day paid for', () => {
      expect(revocationEndsOn({ provisioningType: 'K2', endedOn: '2026-11-16', paidThroughOn: null })).toBe(
        '2026-11-16',
      );
      expect(revocationEndsOn({ provisioningType: 'K1', endedOn: '2026-09-10', paidThroughOn: '2026-09-30' })).toBe(
        '2026-10-01',
      );
      expect(revocationEndsOn({ provisioningType: 'K1', endedOn: '2026-09-10', paidThroughOn: null })).toBe(
        '2026-09-10',
      );
    });

    it('a one-time price (K4) and the other kinds never go back by day', () => {
      expect(revocationEndsOn({ provisioningType: 'K4', endedOn: '2026-11-16', paidThroughOn: null })).toBeNull();
      expect(revocationEndsOn({ provisioningType: 'K5', endedOn: '2026-11-16', paidThroughOn: null })).toBeNull();
      expect(revocationEndsOn({ provisioningType: 'K3', endedOn: '2026-11-16', paidThroughOn: null })).toBeNull();
    });
  });

  describe('lateGrantShare', () => {
    // Approved for March to December (10 months) at 1 000 000 a month.
    const approved = coverage({ amountMonths: 10 });
    const held = commitment({ seatMonthlyMinor: 1_000_000n, heldMinor: 10_000_000n });

    it('gives back the months before the month of the grant and the days of that month before it (granted 20/05)', () => {
      // March and April, and 19 of 31 days of May (612 903.2 → 612 903).
      expect(lateGrantShare({ commitment: held, coverage: approved, grantedOn: '2026-05-20', currentYear: 2026 })).toBe(
        2_000_000n + 612_903n,
      );
    });

    it('a grant on day 1 of the first month gives nothing back', () => {
      expect(lateGrantShare({ commitment: held, coverage: approved, grantedOn: '2026-03-01', currentYear: 2026 })).toBe(
        0n,
      );
    });

    it('the commitment of 01/01 counts from January', () => {
      const yearStart = commitment({ year: 2027, origin: 'YEAR_START', seatMonthlyMinor: 3100n, heldMinor: 37_200n });
      expect(
        lateGrantShare({ commitment: yearStart, coverage: approved, grantedOn: '2027-01-15', currentYear: 2027 }),
      ).toBe(1400n);
    });

    it('a commitment of another year than the grant, or of a closed year, is left as it is', () => {
      expect(lateGrantShare({ commitment: held, coverage: approved, grantedOn: '2027-01-15', currentYear: 2027 })).toBe(
        0n,
      );
      expect(lateGrantShare({ commitment: held, coverage: approved, grantedOn: '2026-05-20', currentYear: 2027 })).toBe(
        0n,
      );
    });

    it('only a K2 grant gives back the days before it', () => {
      expect(releasesBeforeGrant('K2')).toBe(true);
      expect(releasesBeforeGrant('K1')).toBe(false);
      expect(releasesBeforeGrant('K4')).toBe(false);
    });
  });

  describe('months covered', () => {
    it('the last month is the month of the end in the year, none before the year, December without an end', () => {
      expect(lastMonthOf(2026, '2026-09-30')).toBe(9);
      expect(lastMonthOf(2026, '2025-12-31')).toBe(0);
      expect(lastMonthOf(2026, '2027-03-31')).toBe(12);
      expect(lastMonthOf(2026, null)).toBe(12);
    });

    it('the first month counts the months of the amount back from the last; 01/01 and another year start in January', () => {
      expect(firstMonthOf({ year: 2026, origin: 'APPROVAL' }, coverage({ amountMonths: 10 }))).toBe(3);
      expect(
        firstMonthOf({ year: 2026, origin: 'APPROVAL' }, coverage({ endDate: '2026-06-30', amountMonths: 4 })),
      ).toBe(3);
      expect(firstMonthOf({ year: 2027, origin: 'YEAR_START' }, coverage())).toBe(1);
      expect(firstMonthOf({ year: 2027, origin: 'APPROVAL' }, coverage())).toBe(1);
    });
  });
});
