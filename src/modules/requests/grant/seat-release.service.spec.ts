import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatReleaseRepo } from './seat-release.repo';
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

    const service = new SeatReleaseService(
      budgets as never,
      organizationReads as never,
      repo as never,
      licensing as never,
    );

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

    const service = new SeatReleaseService(
      budgets as never,
      organizationReads as never,
      repo as never,
      licensing as never,
    );

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

  it('FIX-B1 F2 (A-I2): group 2 seats (A ends 31/03, B ends 31/12) only releases Feb-Mar for A on revocation, transfer, and replacement', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'req-group',
        request_type: 'GROUP_GRANT',
        budget_year: 2027,
        amount_months: 12,
        term_months: null,
        end_date: null,
        previous_end: null,
        by_hand: false,
      },
    ]);
    const tx = { $queryRaw: queryRaw } as unknown as DbTx;
    const realRepo = new SeatReleaseRepo();
    const releaseForRequest = jest
      .fn()
      .mockResolvedValue([
        { id: 'c-grp', year: 2027, releasedMinor: 750_000n, heldMinor: 6_750_000n, released: false },
      ]);
    const groupCommitment = {
      requestId: 'req-group',
      year: 2027,
      origin: 'APPROVAL',
      seatMonthlyMinor: 500_000n,
      heldMinor: 7_500_000n,
      months: Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, '0')}-01`),
      transferReleases: [],
    };
    const budgets = {
      lockSeatCommitments: jest.fn().mockResolvedValue([groupCommitment]),
      releaseForRequest,
      committedByRequests: jest.fn().mockResolvedValue([{ requestId: 'req-group', currency: 'VND' }]),
    };
    const organizationReads = { businessToday: jest.fn().mockResolvedValue('2027-02-15') };
    const licensing = {
      listRightChainsOf: jest.fn().mockResolvedValue([
        {
          assignmentId: 'assign-A',
          grantRequestId: 'req-group',
          chainAssignmentIds: ['assign-A'],
          grantedStartDate: '2027-01-01',
          grantedEndDate: '2027-03-31',
        },
      ]),
    };
    const service = new SeatReleaseService(budgets as never, organizationReads as never, realRepo, licensing as never);
    const expectedAmounts = [
      {
        year: 2027,
        amountMinor: 750_000n,
        months: [
          { month: '2027-02-01', amountMinor: 250_000n },
          { month: '2027-03-01', amountMinor: 500_000n },
        ],
      },
    ];

    await service.afterRevocation(
      tx,
      {
        id: 'rev-A',
        status: 'COMPLETED',
        completed: {
          grantRequestId: 'req-group',
          chainAssignmentIds: ['assign-A'],
          grantedStartDate: '2027-01-01',
          grantedEndDate: '2027-03-31',
          provisioningType: 'K2',
          endedOn: '2027-02-15',
          paidThroughOn: null,
        },
      } as never,
      NOW,
    );
    expect(releaseForRequest).toHaveBeenLastCalledWith(tx, {
      requestId: 'req-group',
      reason: 'REVOKED',
      reference: 'revocationTask:rev-A',
      amounts: expectedAmounts,
      now: NOW,
    });

    await service.afterTransferEffective(
      tx,
      {
        transferId: 'tr-1',
        effectiveOn: '2027-02-15',
        rights: [{ assignmentId: 'assign-A', provisioningType: 'K2' }],
      },
      NOW,
    );
    expect(releaseForRequest).toHaveBeenLastCalledWith(tx, {
      requestId: 'req-group',
      reason: 'TRANSFER_EFFECTIVE',
      reference: 'transfer:tr-1:assignment:assign-A',
      amounts: expectedAmounts,
      now: NOW,
    });

    await service.afterRightReplaced(tx, {
      assignmentId: 'assign-A',
      provisioningType: 'K2',
      endedOn: '2027-02-15',
      now: NOW,
    });
    expect(releaseForRequest).toHaveBeenLastCalledWith(tx, {
      requestId: 'req-group',
      reason: 'TRANSFER_EFFECTIVE',
      reference: 'transfer:regrant:assignment:assign-A',
      amounts: expectedAmounts,
      now: NOW,
    });
  });

  it('P13a W3-17 Case 6 & 7: K1 annual releases 0 on transfer/normal revocation and releases exact 3.150.000 on replacement', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: 'req-k1-annual',
        request_type: 'ACCESS_REQUEST',
        budget_year: 2026,
        amount_months: 2,
        term_months: 12,
        end_date: new Date('2027-11-04T00:00:00.000Z'),
        previous_end: null,
        by_hand: false,
      },
    ]);
    const tx = { $queryRaw: queryRaw } as unknown as DbTx;
    const realRepo = new SeatReleaseRepo();
    const releaseForRequest = jest
      .fn()
      .mockResolvedValue([
        { id: 'c-2027', year: 2027, releasedMinor: 3_150_000n, heldMinor: 1_350_000n, released: false },
      ]);
    const budgets = {
      lockSeatCommitments: jest.fn().mockResolvedValue([
        {
          requestId: 'req-k1-annual',
          year: 2027,
          origin: 'APPROVAL',
          seatMonthlyMinor: 450_000n,
          heldMinor: 4_500_000n,
          transferReleases: [],
        },
      ]),
      releaseForRequest,
      committedByRequests: jest.fn().mockResolvedValue([]),
    };
    const organizationReads = { businessToday: jest.fn().mockResolvedValue('2027-03-20') };
    const licensing = {
      listRightChainsOf: jest.fn().mockResolvedValue([
        {
          assignmentId: 'asg-k1',
          grantRequestId: 'req-k1-annual',
          chainAssignmentIds: ['asg-k1'],
          grantedStartDate: '2026-11-05',
          grantedEndDate: '2027-11-04',
          personalCommitmentMonths: 12,
          billingAnchorOn: '2026-11-05',
        },
      ]),
    };
    const service = new SeatReleaseService(budgets as never, organizationReads as never, realRepo, licensing as never);

    // Normal/MF-5 revocation (Case 7): releases nothing from paid commitment
    await service.afterRevocation(
      tx,
      {
        id: 'rev-k1',
        status: 'COMPLETED',
        completed: {
          grantRequestId: 'req-k1-annual',
          chainAssignmentIds: ['asg-k1'],
          grantedStartDate: '2026-11-05',
          grantedEndDate: '2027-11-04',
          provisioningType: 'K1',
          endedOn: '2027-03-20',
          paidThroughOn: null,
          personalCommitmentMonths: 12,
          billingAnchorOn: '2026-11-05',
        },
      } as never,
      NOW,
    );
    expect(releaseForRequest).not.toHaveBeenCalled();

    // Transfer effective alone: does not release paid K1 annual commitment before replacement
    const transferResult = await service.afterTransferEffective(
      tx,
      {
        transferId: 'tr-k1',
        effectiveOn: '2027-03-20',
        rights: [{ assignmentId: 'asg-k1', provisioningType: 'K1' }],
      },
      NOW,
    );
    expect(transferResult).toEqual({ released: [] });
    expect(releaseForRequest).not.toHaveBeenCalled();

    // Replacement in transfer grace (Case 6): releases exact 7 months (3.150.000) from 2027 commitment
    await service.afterRightReplaced(tx, {
      assignmentId: 'asg-k1',
      provisioningType: 'K1',
      endedOn: '2027-03-20',
      now: NOW,
    });
    expect(releaseForRequest).toHaveBeenCalledTimes(1);
    expect(releaseForRequest).toHaveBeenCalledWith(tx, {
      requestId: 'req-k1-annual',
      reason: 'TRANSFER_EFFECTIVE',
      reference: 'transfer:regrant:assignment:asg-k1',
      amounts: [{ year: 2027, amountMinor: 3_150_000n }],
      now: NOW,
    });
  });
});
