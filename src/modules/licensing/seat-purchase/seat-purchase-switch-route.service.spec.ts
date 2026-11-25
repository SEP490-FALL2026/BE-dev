import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SeatLedgerBelowOccupancyError, type SeatLedgerApi } from '../../catalog/public/seat-ledger.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import type { ProvisioningTaskRepo } from '../provisioning/provisioning-task.repo';
import type { GrantRequestGateHook } from '../public/licensing.extension-points';
import type { SharedPoolService } from '../shared-pool/shared-pool.service';
import { SeatPurchaseRouteService } from './seat-purchase-route.service';

const OLD_LINE = '11111111-1111-4111-8111-111111111111';
const NEW_LINE = '22222222-2222-4222-8222-222222222222';
const REQ_1 = '33333333-3333-4333-8333-333333333333';
const EMP_1 = '55555555-5555-4555-8555-555555555555';
const PUR_ID = '66666666-6666-4666-8666-666666666666';

const actor: AuthenticatedPrincipal = {
  subject: 'u-it',
  appUserId: 'u-it',
  employeeId: 'emp-it',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
};

function makeContext(id: string, subId: string, planId: string, price: bigint) {
  return {
    line: {
      id,
      organizationId: 'org-1',
      subscriptionId: subId,
      workspaceId: 'ws-1',
      planId,
      monthlyUnitPriceMinor: price,
      minimumSeats: null,
      ledgerOpenedOn: '2026-07-01',
      renewedFromLineId: null,
      closedOn: null,
      closedReason: null,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    },
    plan: { id: planId, name: planId, provisioningType: 'K2' as const },
    period: {
      id: subId,
      organizationId: 'org-1',
      workspaceId: 'ws-1',
      kind: 'TERM' as const,
      status: 'ACTIVE' as const,
      seatCounting: 'FIXED' as const,
      allowsMidTermReduction: false,
      commitmentTermMonths: 12,
      billingCycle: 'ANNUAL' as const,
      invoicedLater: false,
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      renewalDate: '2027-07-01',
      responsibleItAdminEmployeeId: 'emp-resp',
    },
  };
}

describe('SeatPurchaseRouteService line switch (replacesFromLineId, W3-19 Ca 5)', () => {
  function build(oldFree = 1) {
    const tx = {} as DbTx;
    const oldCtx = makeContext(OLD_LINE, 'sub-1', 'plan-std', 500_000n);
    const newCtx = makeContext(NEW_LINE, 'sub-2', 'plan-pro', 2_500_000n);
    const lockPeriodsAndLines = jest.fn().mockResolvedValue([oldCtx.line, newCtx.line]);
    const recordVendor = jest.fn().mockResolvedValue({
      purchase: null,
      change: {
        id: 'chg-red',
        effectiveOn: '2026-11-21',
        delta: -1,
        reason: 'REDUCE',
        source: 'VENDOR_RECORD',
        basis: 'NONE',
        requestId: null,
        beneficiaryEmployeeId: null,
        seatPurchaseId: null,
      },
    });
    const buyForItems = jest.fn().mockResolvedValue({
      purchase: {
        id: PUR_ID,
        organizationId: 'org-1',
        subscriptionLineId: NEW_LINE,
        code: 'MUA-000003',
        kind: 'TOP_UP',
        purchasedOn: '2026-11-21',
        quantity: 1,
        invoiceObligation: 'WORKING_DAYS',
        invoiceDueOn: '2026-11-27',
        recordedByEmployeeId: 'emp-it',
        recordedAt: new Date('2026-11-21T08:00:00.000Z'),
      },
      changes: [
        {
          id: 'chg-add',
          effectiveOn: '2026-11-21',
          delta: 1,
          reason: 'TOP_UP',
          source: 'GRANT',
          basis: 'REQUEST_ITEM',
          requestId: REQ_1,
          beneficiaryEmployeeId: EMP_1,
          seatPurchaseId: PUR_ID,
        },
      ],
    });
    const seatLedger = {
      findWithPurchaseContext: jest.fn((id: string) =>
        Promise.resolve(id === NEW_LINE ? newCtx : id === OLD_LINE ? oldCtx : null),
      ),
      lockPeriodsAndLines,
      existingTopUpItems: jest.fn().mockResolvedValue(new Set()),
      recordVendor,
      buyForItems,
      notifySeatsBought: jest.fn().mockResolvedValue(1),
    } as unknown as SeatLedgerApi;

    const sharedPool = {
      stockOf: jest.fn((_tx, planId: string) =>
        Promise.resolve({
          free: planId === 'plan-pro' ? 0 : oldFree,
          inRevocation: 0,
          freeSubscriptionIds: [],
          freeBySubscription: new Map([
            ['sub-1', oldFree],
            ['sub-2', 0],
          ]),
        }),
      ),
    } as unknown as SharedPoolService;

    const service = new SeatPurchaseRouteService(
      { run: jest.fn((fn: (t: DbTx) => Promise<unknown>) => fn(tx)) } as unknown as TransactionRunner,
      seatLedger,
      {
        requireActingItAdmin: jest.fn().mockResolvedValue({ bySubstitute: false }),
      } as unknown as ProvisioningTaskFrame,
      {
        findOpenGrantTasksForItems: jest
          .fn()
          .mockResolvedValue([{ taskId: 't-1', requestId: REQ_1, employeeId: EMP_1 }]),
        countPendingGrantTasksOfPlan: jest.fn().mockResolvedValue(1),
      } as unknown as ProvisioningTaskRepo,
      {
        get: () => ({ checkSeatPurchaseItems: jest.fn().mockResolvedValue(new Set([`${REQ_1}:${EMP_1}`])) }),
      } as unknown as GrantRequestGateHook,
      sharedPool,
      { businessToday: jest.fn().mockResolvedValue('2026-11-21') } as unknown as OrganizationReadApi,
    );

    return { tx, service, lockPeriodsAndLines, recordVendor, buyForItems };
  }

  it('Ca 5: locks both periods & lines in one tx, writes REDUCE -1 + TOP_UP +1, returns 14,666,667', async () => {
    const { tx, service, lockPeriodsAndLines, recordVendor, buyForItems } = build(1);

    const res = await service.purchase(actor, NEW_LINE, {
      purchasedOn: '2026-11-21',
      items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
      replacesFromLineId: OLD_LINE,
    });

    expect(lockPeriodsAndLines).toHaveBeenCalledWith(tx, ['sub-2', 'sub-1'], [NEW_LINE, OLD_LINE]);
    expect(recordVendor).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: OLD_LINE }),
      expect.objectContaining({ delta: -1 }),
    );
    expect(buyForItems).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: NEW_LINE }),
      [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
      '2026-11-21',
      expect.objectContaining({ alreadyLocked: true }),
    );
    expect(res.expectedAmount).toEqual({ amount: '14666667', currency: 'VND' });
    expect(res.changes.map((c) => c.delta)).toEqual([-1, 1]);
  });

  it('refuses with SeatLedgerBelowOccupancyError when old line has no free seat', async () => {
    const { service } = build(0);
    await expect(
      service.purchase(actor, NEW_LINE, {
        purchasedOn: '2026-11-21',
        items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
        replacesFromLineId: OLD_LINE,
      }),
    ).rejects.toBeInstanceOf(SeatLedgerBelowOccupancyError);
  });
});
