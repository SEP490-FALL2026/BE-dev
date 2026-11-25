import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import {
  SeatLedgerBelowOccupancyError,
  SeatLedgerEffectiveInClosedMonthError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLineStaleError,
} from '../subscription-line.errors';
import type { SeatLedgerService } from '../ledger/seat-ledger.service';
import type { SubscriptionLineRepo } from '../subscription-line.repo';
import {
  SeatLedgerMidTermReductionNotAllowedError,
  SeatLedgerReductionExceedsPurchaseError,
} from './subscription-line-correction.errors';
import { SubscriptionLineCorrectionService } from './subscription-line-correction.service';

const TS = new Date('2027-03-03T00:00:00.000Z');
const actor: AuthenticatedPrincipal = {
  subject: 'u-it',
  appUserId: 'u-it',
  employeeId: 'it-resp',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
  sessionId: 's-1',
};

function build(
  over: {
    responsible?: string | null;
    seatCounting?: 'FIXED' | 'MEMBERS';
    allowsMidTermReduction?: boolean;
    refunded?: {
      id: string;
      subscriptionLineId: string;
      reason: 'INITIAL' | 'TOP_UP' | 'RENEWAL' | 'REDUCE';
      delta: number;
    } | null;
    alreadyReduced?: number;
    recordVendorError?: Error;
    notFound?: boolean;
  } = {},
) {
  const tx = {} as DbTx;
  const runner = { run: jest.fn((fn: (t: DbTx) => Promise<unknown>) => fn(tx)) } as unknown as TransactionRunner;
  const line = {
    id: 'line-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    workspaceId: 'ws-1',
    planId: 'plan-1',
    monthlyUnitPriceMinor: 500_000n,
    minimumSeats: null,
    ledgerOpenedOn: '2026-11-01',
    renewedFromLineId: null,
    closedOn: null,
    closedReason: null,
    createdAt: TS,
    updatedAt: TS,
  };
  const context = over.notFound
    ? null
    : {
        line,
        plan: { id: 'plan-1', provisioningType: 'K2' as const },
        period: {
          id: 'sub-1',
          organizationId: 'org-1',
          workspaceId: 'ws-1',
          kind: 'TERM' as const,
          status: 'ACTIVE' as const,
          seatCounting: over.seatCounting ?? ('FIXED' as const),
          allowsMidTermReduction: over.allowsMidTermReduction ?? false,
          billingCycle: 'ANNUAL' as const,
          invoicedLater: false,
          startDate: '2026-11-01',
          endDate: '2027-10-31',
          renewalDate: '2027-11-01',
          responsibleItAdminEmployeeId: over.responsible === undefined ? 'it-resp' : over.responsible,
        },
      };

  const lines = {
    findWithPurchaseContext: jest.fn().mockResolvedValue(context),
  } as unknown as SubscriptionLineRepo;
  const recordVendor = over.recordVendorError
    ? jest.fn().mockRejectedValue(over.recordVendorError)
    : jest.fn().mockImplementation(
        (
          _tx,
          _line,
          input: {
            delta: number;
            effectiveOn: string;
            note: string;
            outOfProcess?: boolean;
            refundedSeatChangeId?: string | null;
          },
        ) =>
          Promise.resolve({
            purchase: null,
            change: {
              id: 'chg-new',
              organizationId: 'org-1',
              subscriptionLineId: 'line-1',
              effectiveOn: input.effectiveOn,
              delta: input.delta,
              reason: input.delta > 0 ? 'TOP_UP' : 'REDUCE',
              source: 'VENDOR_RECORD',
              basis: 'NONE',
              requestId: null,
              beneficiaryEmployeeId: null,
              seatPurchaseId: null,
              renewalId: null,
              refundedSeatChangeId: input.refundedSeatChangeId ?? null,
              note: input.note,
              outOfProcess: input.outOfProcess ?? false,
              autoRecorded: false,
              recordedByEmployeeId: actor.employeeId,
              recordedAt: new Date('2027-03-06T00:00:00.000Z'),
            },
          }),
      );
  const seatLedger = {
    lockPeriodAndLine: jest.fn().mockResolvedValue(context ? line : null),
    businessToday: jest.fn().mockResolvedValue('2027-03-06'),
    findChange: jest.fn().mockResolvedValue(over.refunded ?? null),
    sumRefundedFor: jest.fn().mockResolvedValue(over.alreadyReduced ?? 0),
    recordVendor,
  } as unknown as SeatLedgerService;
  const identity = {
    findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-resp'])),
    findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue('sa-1'),
    findUsableFinanceEmployeeId: jest.fn().mockResolvedValue('fin-1'),
  } as unknown as IdentityAccessApi;
  const notifyInApp = jest.fn().mockResolvedValue(true);
  const notifications = { notifyInApp } as unknown as NotificationsApi;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;

  return {
    tx,
    recordVendor,
    notifyInApp,
    audit,
    service: new SubscriptionLineCorrectionService(runner, lines, seatLedger, identity, notifications, audit),
  };
}

describe('SubscriptionLineCorrectionService (W3-19)', () => {
  it('Ca 2: FIXED +1 without basis marks outOfProcess=true and notifies Finance (+R1)', async () => {
    const { service, recordVendor, notifyInApp, tx } = build();
    const res = await service.recordCorrection(actor, 'line-1', {
      delta: 1,
      effectiveOn: '2027-03-06',
      note: 'Vendor added 1 seat in SBF-08',
      expectedUpdatedAt: TS,
    });

    expect(recordVendor).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      expect.objectContaining({ delta: 1, outOfProcess: true }),
    );
    expect(res.outOfProcess).toBe(true);
    expect(notifyInApp).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'fin-1',
        code: 'SEAT_LEDGER_VENDOR_RECORDED',
        params: expect.objectContaining({ outOfProcess: true, delta: 1 }) as unknown,
      }),
    );
  });

  it('MEMBERS +1 reconciliation does NOT set outOfProcess', async () => {
    const { service, recordVendor, notifyInApp } = build({ seatCounting: 'MEMBERS' });
    const res = await service.recordCorrection(actor, 'line-1', {
      delta: 1,
      effectiveOn: '2027-03-06',
      note: 'Vendor reconciliation',
      expectedUpdatedAt: TS,
    });

    expect(recordVendor).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ outOfProcess: false }),
    );
    expect(res.outOfProcess).toBe(false);
    expect(notifyInApp).not.toHaveBeenCalled();
  });

  it('Ca 8: refuses non-responsible IT Admin with SubscriptionLineNotResponsibleError', async () => {
    const { service } = build({ responsible: 'it-other' });
    await expect(
      service.recordCorrection(actor, 'line-1', {
        delta: 1,
        effectiveOn: '2027-03-06',
        note: 'x',
        expectedUpdatedAt: TS,
      }),
    ).rejects.toBeInstanceOf(SubscriptionLineNotResponsibleError);
  });

  it('throws 404, 409 STALE, 409 BELOW_OCCUPANCY, 422 EFFECTIVE_IN_CLOSED_MONTH on correction', async () => {
    await expect(
      build({ notFound: true }).service.recordCorrection(actor, 'line-1', {
        delta: 1,
        effectiveOn: '2027-03-06',
        note: 'x',
        expectedUpdatedAt: TS,
      }),
    ).rejects.toBeInstanceOf(SubscriptionLineNotFoundError);

    await expect(
      build().service.recordCorrection(actor, 'line-1', {
        delta: 1,
        effectiveOn: '2027-03-06',
        note: 'x',
        expectedUpdatedAt: new Date('2027-03-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SubscriptionLineStaleError);

    await expect(
      build({ recordVendorError: new SeatLedgerBelowOccupancyError() }).service.recordCorrection(actor, 'line-1', {
        delta: -1,
        effectiveOn: '2027-03-06',
        note: 'x',
        expectedUpdatedAt: TS,
      }),
    ).rejects.toBeInstanceOf(SeatLedgerBelowOccupancyError);

    await expect(
      build({ recordVendorError: new SeatLedgerEffectiveInClosedMonthError('2027-03-01') }).service.recordCorrection(
        actor,
        'line-1',
        { delta: -1, effectiveOn: '2027-02-28', note: 'x', expectedUpdatedAt: TS },
      ),
    ).rejects.toBeInstanceOf(SeatLedgerEffectiveInClosedMonthError);
  });

  it('Ca 3 & Ca 4: mid-term reduction enforces flag and cumulative boundary 1 + 2 = 3 vs 1 + 3 > 3', async () => {
    await expect(
      build({ allowsMidTermReduction: false }).service.recordReduction(actor, 'line-1', {
        refundedSeatChangeId: 'chg-buy',
        quantity: 1,
        effectiveOn: '2027-03-06',
        note: 'reduce',
        expectedUpdatedAt: TS,
      }),
    ).rejects.toBeInstanceOf(SeatLedgerMidTermReductionNotAllowedError);

    await expect(
      build({
        allowsMidTermReduction: true,
        refunded: { id: 'chg-buy', subscriptionLineId: 'line-1', reason: 'TOP_UP', delta: 3 },
        alreadyReduced: 1,
      }).service.recordReduction(actor, 'line-1', {
        refundedSeatChangeId: 'chg-buy',
        quantity: 3,
        effectiveOn: '2027-03-06',
        note: 'exceed',
        expectedUpdatedAt: TS,
      }),
    ).rejects.toBeInstanceOf(SeatLedgerReductionExceedsPurchaseError);

    const ok = build({
      allowsMidTermReduction: true,
      refunded: { id: 'chg-buy', subscriptionLineId: 'line-1', reason: 'TOP_UP', delta: 3 },
      alreadyReduced: 1,
    });
    const reduced = await ok.service.recordReduction(actor, 'line-1', {
      refundedSeatChangeId: 'chg-buy',
      quantity: 2,
      effectiveOn: '2027-03-06',
      note: 'boundary 1+2=3',
      expectedUpdatedAt: TS,
    });
    expect(reduced.delta).toBe(-2);
    expect(reduced.refundedSeatChangeId).toBe('chg-buy');
  });
});
