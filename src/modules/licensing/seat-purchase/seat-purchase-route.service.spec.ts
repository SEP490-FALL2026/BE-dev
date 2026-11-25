import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  SeatLedgerEffectiveInClosedMonthError,
  SeatPurchaseItemNotPendingError,
  SeatPurchaseLineNotFoundError,
  SeatPurchaseLineNotPurchasableError,
  SeatPurchaseNotInChargeError,
  SeatPurchaseStockAvailableError,
  type SeatLedgerApi,
} from '../../catalog/public/seat-ledger.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ProvisioningNotInChargeError } from '../provisioning/provisioning.errors';
import type { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import type { ProvisioningTaskRepo } from '../provisioning/provisioning-task.repo';
import type { GrantRequestGateHook } from '../public/licensing.extension-points';
import type { SharedPoolService } from '../shared-pool/shared-pool.service';
import { SeatPurchaseRouteService } from './seat-purchase-route.service';

const ID_1 = '11111111-1111-4111-8111-111111111111';
const ID_2 = '22222222-2222-4222-8222-222222222222';
const REQ_1 = '33333333-3333-4333-8333-333333333333';
const REQ_2 = '44444444-4444-4444-8444-444444444444';
const EMP_1 = '55555555-5555-4555-8555-555555555555';
const EMP_2 = '66666666-6666-4666-8666-666666666666';
const TASK_1 = '77777777-7777-4777-8777-777777777777';

const actor: AuthenticatedPrincipal = {
  subject: 'user-it',
  appUserId: 'user-it',
  employeeId: 'emp-it',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
};

const baseLineContext = {
  line: {
    id: ID_1,
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    workspaceId: 'ws-1',
    planId: 'plan-k2',
    monthlyUnitPriceMinor: 500_000n,
    minimumSeats: null,
    ledgerOpenedOn: '2026-07-01',
    renewedFromLineId: null,
    closedOn: null,
    closedReason: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  },
  plan: { id: 'plan-k2', provisioningType: 'K2' as const },
  period: {
    id: 'sub-1',
    organizationId: 'org-1',
    workspaceId: 'ws-1',
    kind: 'TERM' as const,
    status: 'ACTIVE' as const,
    seatCounting: 'FIXED' as const,
    billingCycle: 'ANNUAL' as const,
    invoicedLater: false,
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    renewalDate: '2027-07-01',
    responsibleItAdminEmployeeId: 'emp-resp',
  },
};

describe('SeatPurchaseRouteService (W3-18)', () => {
  function build(
    over: {
      context?: typeof baseLineContext | null;
      today?: string;
      notInChargeEmployees?: string[];
      notStartedEmployees?: string[];
      spendApprovedKeys?: string[];
      openTasks?: Array<{ taskId: string; requestId: string; employeeId: string; status: 'QUEUED' | 'IN_PROGRESS' }>;
      existingTopUp?: string[];
      pendingCount?: number;
      free?: number;
    } = {},
  ) {
    const tx = {} as DbTx;
    const runner = {
      run: jest.fn((fn: (dbTx: DbTx) => Promise<unknown>) => fn(tx)),
    } as unknown as TransactionRunner;
    const lockPeriodAndLine = jest.fn().mockResolvedValue((over.context ?? baseLineContext).line);
    const buyForItems = jest.fn().mockResolvedValue({
      purchase: {
        id: ID_2,
        organizationId: 'org-1',
        subscriptionLineId: ID_1,
        code: 'MUA-000001',
        kind: 'TOP_UP',
        purchasedOn: '2026-11-21',
        quantity: 2,
        invoiceObligation: 'WORKING_DAYS',
        invoiceDueOn: '2026-11-27',
        recordedByEmployeeId: 'emp-it',
        recordedAt: new Date('2026-11-21T08:00:00.000Z'),
      },
      changes: [
        {
          id: 'chg-1',
          effectiveOn: '2026-11-21',
          delta: 1,
          reason: 'TOP_UP',
          source: 'GRANT',
          basis: 'REQUEST_ITEM',
          requestId: REQ_1,
          beneficiaryEmployeeId: EMP_1,
          seatPurchaseId: ID_2,
        },
        {
          id: 'chg-2',
          effectiveOn: '2026-11-21',
          delta: 1,
          reason: 'TOP_UP',
          source: 'GRANT',
          basis: 'REQUEST_ITEM',
          requestId: REQ_2,
          beneficiaryEmployeeId: EMP_2,
          seatPurchaseId: ID_2,
        },
      ],
    });
    const notifySeatsBought = jest.fn().mockResolvedValue(1);
    const seatLedger = {
      findWithPurchaseContext: jest.fn().mockResolvedValue(over.context === undefined ? baseLineContext : over.context),
      lockPeriodAndLine,
      existingTopUpItems: jest.fn().mockResolvedValue(new Set(over.existingTopUp ?? [])),
      buyForItems,
      notifySeatsBought,
    } as unknown as SeatLedgerApi;

    const requireActingItAdmin = jest.fn((_tx, _actor, target: { beneficiaryEmployeeId: string }) => {
      if (over.notStartedEmployees?.includes(target.beneficiaryEmployeeId)) {
        return Promise.reject(new EmployeeNotStartedError(target.beneficiaryEmployeeId));
      }
      if (over.notInChargeEmployees?.includes(target.beneficiaryEmployeeId)) {
        return Promise.reject(new ProvisioningNotInChargeError());
      }
      return Promise.resolve({ bySubstitute: false });
    });
    const frame = { requireActingItAdmin } as unknown as ProvisioningTaskFrame;

    const tasks = {
      findOpenGrantTasksForItems: jest.fn().mockResolvedValue(
        over.openTasks ?? [
          { taskId: TASK_1, requestId: REQ_1, employeeId: EMP_1, status: 'QUEUED' },
          { taskId: 'task-2', requestId: REQ_2, employeeId: EMP_2, status: 'IN_PROGRESS' },
        ],
      ),
      countPendingGrantTasksOfPlan: jest.fn().mockResolvedValue(over.pendingCount ?? 2),
    } as unknown as ProvisioningTaskRepo;

    const gate = {
      get: () => ({
        checkSeatPurchaseItems: jest
          .fn()
          .mockResolvedValue(new Set(over.spendApprovedKeys ?? [`${REQ_1}:${EMP_1}`, `${REQ_2}:${EMP_2}`])),
      }),
    } as unknown as GrantRequestGateHook;

    const sharedPool = {
      stockOf: jest.fn().mockResolvedValue({
        free: over.free ?? 0,
        inRevocation: 0,
        freeSubscriptionIds: [],
        freeBySubscription: new Map(),
      }),
    } as unknown as SharedPoolService;

    const organizationReads = {
      businessToday: jest.fn().mockResolvedValue(over.today ?? '2026-11-21'),
    } as unknown as OrganizationReadApi;

    return {
      tx,
      seatLedger,
      lockPeriodAndLine,
      buyForItems,
      notifySeatsBought,
      requireActingItAdmin,
      frame,
      tasks,
      sharedPool,
      service: new SeatPurchaseRouteService(runner, seatLedger, frame, tasks, gate, sharedPool, organizationReads),
    };
  }

  it('creates one MUA purchase + n GRANT changes, notifies R1, and returns expectedAmount rounded once (7,333,333)', async () => {
    const { service, lockPeriodAndLine, buyForItems, notifySeatsBought, tx } = build();

    const result = await service.purchase(actor, ID_1, {
      purchasedOn: '2026-11-21',
      items: [
        { requestId: REQ_1, beneficiaryEmployeeId: EMP_1, taskId: TASK_1 },
        { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
      ],
    });

    expect(lockPeriodAndLine).toHaveBeenCalledWith(tx, 'sub-1', ID_1);
    expect(buyForItems).toHaveBeenCalled();
    expect(notifySeatsBought).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ subscriptionId: 'sub-1', seatPurchaseId: ID_2, quantity: 2 }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: ID_2,
        code: 'MUA-000001',
        quantity: 2,
        purchasedOn: '2026-11-21',
        invoiceObligation: 'WORKING_DAYS',
        invoiceDueOn: '2026-11-27',
        expectedAmount: { amount: '7333333', currency: 'VND' },
      }),
    );
    expect(result.changes).toHaveLength(2);
  });

  it('throws 404 SeatPurchaseLineNotFoundError when line does not exist', async () => {
    const { service } = build({ context: null });
    await expect(
      service.purchase(actor, ID_1, {
        purchasedOn: '2026-11-21',
        items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
      }),
    ).rejects.toBeInstanceOf(SeatPurchaseLineNotFoundError);
  });

  it('passes taskId to requireActingItAdmin (OQ-D1) and maps unauthorized items to SeatPurchaseNotInChargeError BEFORE line/date/item checks', async () => {
    const { service, requireActingItAdmin } = build({
      context: { ...baseLineContext, period: { ...baseLineContext.period, status: 'DRAFT' as 'ACTIVE' } },
      notInChargeEmployees: [EMP_2],
    });

    let caught: unknown;
    try {
      await service.purchase(actor, ID_1, {
        purchasedOn: '2026-11-21',
        items: [
          { requestId: REQ_1, beneficiaryEmployeeId: EMP_1, taskId: TASK_1 },
          { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
        ],
      });
    } catch (e) {
      caught = e;
    }
    expect(requireActingItAdmin).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.objectContaining({ beneficiaryEmployeeId: EMP_1, taskId: TASK_1 }),
    );
    expect(caught).toBeInstanceOf(SeatPurchaseNotInChargeError);
    expect((caught as SeatPurchaseNotInChargeError).items).toEqual([
      { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
    ]);
  });

  it('throws EmployeeNotStartedError (409) when beneficiary has not started', async () => {
    const { service } = build({ notStartedEmployees: [EMP_1] });
    await expect(
      service.purchase(actor, ID_1, {
        purchasedOn: '2026-11-21',
        items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
      }),
    ).rejects.toBeInstanceOf(EmployeeNotStartedError);
  });

  it('checks line purchasability (step 2) before date bounds (step 3)', async () => {
    const { service } = build({
      context: { ...baseLineContext, period: { ...baseLineContext.period, seatCounting: 'MEMBERS' as 'FIXED' } },
      today: '2026-11-21',
    });
    let caught: unknown;
    try {
      await service.purchase(actor, ID_1, {
        purchasedOn: '2026-10-01',
        items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SeatPurchaseLineNotPurchasableError);
    expect((caught as SeatPurchaseLineNotPurchasableError).reason).toBe('NOT_FIXED_SEAT_COUNTING');
  });

  it('checks closed month (step 3)', async () => {
    const { service } = build({ today: '2026-12-05' });
    await expect(
      service.purchase(actor, ID_1, {
        purchasedOn: '2026-11-21',
        items: [{ requestId: REQ_1, beneficiaryEmployeeId: EMP_1 }],
      }),
    ).rejects.toBeInstanceOf(SeatLedgerEffectiveInClosedMonthError);
  });

  it('throws SeatPurchaseItemNotPendingError with details.items when request not spend-approved, missing open task, or already has TOP_UP', async () => {
    const { service } = build({
      spendApprovedKeys: [`${REQ_1}:${EMP_1}`],
      existingTopUp: [`${REQ_1}:${EMP_1}`],
    });
    let caught: unknown;
    try {
      await service.purchase(actor, ID_1, {
        purchasedOn: '2026-11-21',
        items: [
          { requestId: REQ_1, beneficiaryEmployeeId: EMP_1 },
          { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
        ],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SeatPurchaseItemNotPendingError);
    expect((caught as SeatPurchaseItemNotPendingError).items).toEqual([
      { requestId: REQ_1, beneficiaryEmployeeId: EMP_1 },
      { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
    ]);
  });

  it('throws SeatPurchaseStockAvailableError when n > pending - free', async () => {
    const { service } = build({ pendingCount: 3, free: 2 });
    let caught: unknown;
    try {
      await service.purchase(actor, ID_1, {
        purchasedOn: '2026-11-21',
        items: [
          { requestId: REQ_1, beneficiaryEmployeeId: EMP_1 },
          { requestId: REQ_2, beneficiaryEmployeeId: EMP_2 },
        ],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SeatPurchaseStockAvailableError);
    expect((caught as SeatPurchaseStockAvailableError).free).toBe(2);
  });
});
