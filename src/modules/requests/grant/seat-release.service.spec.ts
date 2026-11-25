import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatReleaseService } from './seat-release.service';

const TX = {} as DbTx;
const NOW = new Date('2027-03-10T03:00:00.000Z');

describe('SeatReleaseService (W3-07 monthly breakdown)', () => {
  it('passes monthly breakdown from commitment.months on LATE_GRANT so budgets spread per month (F1)', async () => {
    const releaseForRequest = jest
      .fn()
      .mockResolvedValue([{ id: 'c1', year: 2027, releasedMinor: 145_161n, heldMinor: 4_854_839n, released: false }]);
    const budgets = {
      lockSeatCommitments: jest.fn().mockResolvedValue([
        {
          requestId: 'r1',
          year: 2027,
          origin: 'YEAR_START',
          seatMonthlyMinor: 500_000n,
          heldMinor: 5_000_000n,
          months: Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}-01`),
          transferReleases: [],
        },
      ]),
      releaseForRequest,
      committedByRequests: jest.fn(),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2027-03-10'),
    };
    const repo = {
      coverageOf: jest.fn().mockResolvedValue(
        new Map([
          [
            'r1',
            {
              endDate: null,
              lastMonthBeginsOn: null,
              budgetYear: 2027,
              amountMonths: null,
            },
          ],
        ]),
      ),
    };
    const licensing = { listRightChainsOf: jest.fn() };

    const service = new SeatReleaseService(budgets as never, organizationReads as never, repo, licensing as never);

    await service.afterGrant(
      TX,
      'r1',
      {
        assignmentId: 'a1',
        provisioningType: 'K2',
        fromPool: true,
        grantedOn: '2027-03-10',
        effectiveFrom: '2027-03-10',
        expectedEndDate: null,
      },
      NOW,
    );

    expect(releaseForRequest).toHaveBeenCalledWith(TX, {
      requestId: 'r1',
      reason: 'LATE_GRANT',
      reference: 'grantAssignment:a1',
      amounts: [
        {
          year: 2027,
          amountMinor: 1_145_161n,
          months: [
            { month: '2027-01-01', amountMinor: 500_000n },
            { month: '2027-02-01', amountMinor: 500_000n },
            { month: '2027-03-01', amountMinor: 145_161n },
          ],
        },
      ],
      now: NOW,
    });
  });

  it('passes monthly breakdown using commitment.months min/max instead of SeatCoverage on REVOKED (F2)', async () => {
    const releaseForRequest = jest
      .fn()
      .mockResolvedValue([{ id: 'c1', year: 2027, releasedMinor: 1_350_000n, heldMinor: 150_000n, released: false }]);
    const budgets = {
      lockSeatCommitments: jest.fn().mockResolvedValue([
        {
          requestId: 'r1',
          year: 2027,
          origin: 'APPROVAL',
          seatMonthlyMinor: 500_000n,
          heldMinor: 1_500_000n,
          months: ['2027-03-01', '2027-04-01', '2027-05-01', '2027-06-01'],
          transferReleases: [],
        },
      ]),
      releaseForRequest,
      committedByRequests: jest.fn(),
    };
    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue('2027-04-10'),
    };
    const repo = {
      coverageOf: jest.fn().mockResolvedValue(
        new Map([
          [
            'r1',
            {
              endDate: '2027-06-14',
              lastMonthBeginsOn: '2027-05-15',
              budgetYear: 2027,
              amountMonths: 3,
            },
          ],
        ]),
      ),
    };
    const licensing = { listRightChainsOf: jest.fn() };

    const service = new SeatReleaseService(budgets as never, organizationReads as never, repo, licensing as never);

    await service.afterRevocation(
      TX,
      {
        id: 'rev-1',
        status: 'COMPLETED',
        completed: {
          grantRequestId: 'r1',
          chainAssignmentIds: ['a1'],
          grantedStartDate: '2027-03-15',
          grantedEndDate: '2027-06-14',
          provisioningType: 'K2',
          endedOn: '2027-04-10',
          paidThroughOn: null,
        },
      } as never,
      NOW,
    );

    expect(releaseForRequest).toHaveBeenCalledWith(TX, {
      requestId: 'r1',
      reason: 'REVOKED',
      reference: 'revocationTask:rev-1',
      amounts: [
        {
          year: 2027,
          amountMinor: 1_350_000n,
          months: [
            { month: '2027-04-01', amountMinor: 350_000n },
            { month: '2027-05-01', amountMinor: 500_000n },
            { month: '2027-06-01', amountMinor: 500_000n },
          ],
        },
      ],
      now: NOW,
    });
  });
});
