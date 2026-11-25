import type { SeatCommitment } from '../../budgets/public/budgets.types';
import {
  k1PaidThroughLockLabel,
  k1RevocationOutcome,
  k1TransferReleaseBreakdown,
  paidThroughOnOfK1Annual,
  revocationShare,
  type SeatCoverage,
} from './seat-release.policy';

const commitment = (over: Partial<SeatCommitment> = {}): SeatCommitment => ({
  requestId: 'r1',
  year: 2027,
  origin: 'APPROVAL',
  seatMonthlyMinor: 450_000n,
  heldMinor: 4_500_000n,
  transferReleases: [],
  ...over,
});

const coverage = (over: Partial<SeatCoverage> = {}): SeatCoverage => ({
  endDate: '2027-11-04',
  lastMonthBeginsOn: '2027-10-05',
  budgetYear: 2026,
  amountMonths: 2,
  ...over,
});

describe('W3-17 Case 6 & 7: K1 annual paidThroughOn, MF-5 lock label, and transfer replacement release', () => {
  it('computes paidThroughOn = billing_anchor_on + 12k months - 1 day and lock label', () => {
    expect(paidThroughOnOfK1Annual('2026-11-05', '2027-03-20')).toBe('2027-11-04');
    expect(k1PaidThroughLockLabel('2027-11-04')).toBe('bị khóa tới 04/11/2027');

    expect(
      k1RevocationOutcome({
        provisioningType: 'K1',
        endedOn: '2027-03-20',
        paidThroughOn: null,
        personalCommitmentMonths: 12,
        billingAnchorOn: '2026-11-05',
      }),
    ).toEqual({
      endsOn: '2027-11-05',
      paidThroughOn: '2027-11-04',
      lockLabel: 'bị khóa tới 04/11/2027',
    });
  });

  it('QĐ-116ad: normal/MF-5 revocation releases 0 from K1 annual paid commitment', () => {
    const outcome = k1RevocationOutcome({
      provisioningType: 'K1',
      endedOn: '2027-03-20',
      paidThroughOn: '2027-11-04',
      personalCommitmentMonths: 12,
      billingAnchorOn: '2026-11-05',
    });
    const shared = revocationShare({
      commitment: commitment(),
      coverage: coverage(),
      endsOn: outcome.endsOn ?? '2027-11-05',
      currentYear: 2027,
    });

    expect(shared).toBe(0n);
  });

  it('QĐ-117c Case 6: transfer replacement releases exact 7 months (3.150.000) from 2027 commitment and keeps running cycle 05/03-04/04', () => {
    const released = k1TransferReleaseBreakdown({
      commitment: commitment(),
      billingAnchorOn: '2026-11-05',
      endedOn: '2027-03-20',
      currentYear: 2027,
    });

    expect(released).toEqual({ amountMinor: 3_150_000n, months: [] });
  });
});
