import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { SeatReleaseRepo } from './seat-release.repo';
import { SeatReleaseService } from './seat-release.service';

const NOW = new Date('2027-03-20T03:00:00.000Z');

describe('SeatReleaseService K1 annual transfer allocations (W3-23 F8)', () => {
  it('calls budgets.transferK1AnnualAllocations in afterRightReplaced when K1 annual already has confirmed invoices', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([
      {
        id: 'req-old',
        request_type: 'GRANT',
        budget_year: 2026,
        amount_months: 2,
        term_months: 12,
        end_date: new Date('2027-11-04T00:00:00.000Z'),
        previous_end: null,
        by_hand: false,
      },
    ]);
    const tx = {
      $queryRaw: queryRaw,
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([{ requestId: 'req-old', invoiceId: 'inv-1' }]),
      },
      accessRequest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'req-old', costCenterId: 'cc-a' },
          { id: 'req-new', costCenterId: 'cc-b' },
        ]),
      },
    } as unknown as DbTx;
    const transferK1AnnualAllocations = jest.fn().mockResolvedValue({ transferredMinor: 3_465_000n });
    const budgets = {
      lockSeatCommitments: jest.fn(),
      releaseForRequest: jest.fn(),
      committedByRequests: jest.fn().mockResolvedValue([]),
      transferK1AnnualAllocations,
    };
    const licensing = {
      listRightChainsOf: jest.fn().mockResolvedValue([
        {
          assignmentId: 'asg-old',
          grantRequestId: 'req-old',
          chainAssignmentIds: ['asg-old'],
          grantedStartDate: '2026-11-05',
          grantedEndDate: '2027-11-04',
          personalCommitmentMonths: 12,
          billingAnchorOn: '2026-11-05',
        },
      ]),
    };
    const service = new SeatReleaseService(
      budgets as never,
      { businessToday: jest.fn().mockResolvedValue('2027-03-20') } as never,
      new SeatReleaseRepo(),
      licensing as never,
    );

    await service.afterRightReplaced(tx, {
      assignmentId: 'asg-old',
      provisioningType: 'K1',
      endedOn: '2027-03-20',
      newRequestId: 'req-new',
      now: NOW,
    });

    expect(transferK1AnnualAllocations).toHaveBeenCalledWith(tx, {
      lockSubjectKey: 'asg-old',
      invoiceIds: ['inv-1'],
      billingAnchorOn: '2026-11-05',
      endedOn: '2027-03-20',
      oldCostCenterId: 'cc-a',
      newCostCenterId: 'cc-b',
      oldRequestIds: ['req-old'],
      newRequestId: 'req-new',
      reference: 'transfer:regrant:assignment:asg-old',
      now: NOW,
    });
    expect(budgets.releaseForRequest).not.toHaveBeenCalled();
  });
});
