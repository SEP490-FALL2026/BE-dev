import { HttpStatus } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { PlanFactsService, LockedPlan } from '../plan/plan-facts.service';
import type { SeatBaselinePhaseHook, SeatOccupancyHook } from '../public/catalog.extension-points';
import { WorkspaceVendorMismatchError } from '../workspace/workspace.errors';
import type { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import type { SeatLedgerService } from './ledger/seat-ledger.service';
import {
  SubscriptionLineLiveTakenError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLinePeriodStaleError,
  SubscriptionLinePlanNotK2Error,
  SubscriptionLineQuantityViaPurchaseError,
} from './subscription-line.errors';
import { toSubscriptionLineApiException } from './subscription-line.http-errors';
import type { SubscriptionLineRepo } from './subscription-line.repo';
import { SubscriptionLineService } from './subscription-line.service';
import type { SubscriptionLineRecord } from './subscription-line.types';

const actor = {
  appUserId: 'user-1',
  employeeId: 'emp-khoa',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

const updatedAt = new Date('2026-11-20T00:00:00.000Z');

const k2Plan: LockedPlan = {
  id: 'plan-2',
  name: 'Figma FigJam',
  applicationId: 'app-1',
  applicationName: 'Figma',
  applicationKind: 'SAAS',
  applicationStatus: 'APPROVED',
  pricingModel: 'PER_SEAT',
  provisioningType: 'K2',
  keyBinding: null,
  sharingPolicy: null,
  hasAdminConsole: true,
  referenceCommitmentMonths: null,
};

const makePeriod = (overrides: Record<string, unknown> = {}) => ({
  id: 'sub-1',
  organizationId: 'org-1',
  workspaceId: 'ws-1',
  kind: 'TERM' as const,
  status: 'ACTIVE' as const,
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  responsibleItAdminEmployeeId: 'emp-khoa',
  updatedAt,
  ...overrides,
});

const makeLine = (overrides: Partial<SubscriptionLineRecord> = {}): SubscriptionLineRecord => ({
  id: 'line-1',
  organizationId: 'org-1',
  subscriptionId: 'sub-1',
  workspaceId: 'ws-1',
  planId: 'plan-2',
  monthlyUnitPriceMinor: 375_000n,
  minimumSeats: 5,
  ledgerOpenedOn: '2026-11-01',
  renewedFromLineId: null,
  closedOn: null,
  closedReason: null,
  createdAt: updatedAt,
  updatedAt,
  ...overrides,
});

function codeOf(error: unknown): { status: number; code: string | undefined } {
  const mapped = toSubscriptionLineApiException(error) as {
    getStatus?: () => number;
    getResponse?: () => { code?: string };
  };
  return { status: mapped.getStatus?.() ?? 500, code: mapped.getResponse?.().code };
}

function makeSut(overrides: Record<string, unknown> = {}) {
  const tx = {} as DbTx;
  const order: string[] = [];
  const runner = {
    run: jest.fn(async (work: (t: DbTx) => Promise<unknown>) => work(tx)),
  } as unknown as TransactionRunner;
  const insert = jest.fn().mockResolvedValue(makeLine());
  const update = jest.fn().mockResolvedValue(makeLine({ monthlyUnitPriceMinor: 420_000n }));
  const lines = {
    readPeriodWorkspace: jest.fn().mockResolvedValue('ws-1'),
    lockPeriod: jest.fn().mockImplementation(() => {
      order.push('lockPeriod');
      return Promise.resolve(makePeriod());
    }),
    findLive: jest.fn().mockResolvedValue(null),
    ofSubscriptions: jest.fn().mockResolvedValue(new Map()),
    insert,
    lock: jest.fn().mockImplementation(() => {
      order.push('lockLine');
      return Promise.resolve(makeLine());
    }),
    find: jest.fn().mockResolvedValue(makeLine()),
    update,
    ...(overrides.lines as object),
  } as unknown as SubscriptionLineRepo;
  const openLines = jest.fn().mockResolvedValue(undefined);
  const seatLedger = {
    openLines,
    requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
    listPagedByLine: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    businessToday: jest.fn().mockResolvedValue('2026-11-21'),
    seatsOnDays: jest.fn().mockResolvedValue(new Map([['line-1', new Map([['2026-11-21', 5]])]])),
    ...(overrides.seatLedger as object),
    ...(overrides.ledgerRepo as object),
  } as unknown as SeatLedgerService;
  const occupancy = {
    get: jest.fn().mockReturnValue({ occupiedBySubscriptionPlans: jest.fn().mockResolvedValue(new Map()) }),
  } as unknown as SeatOccupancyHook;
  const plans = {
    lockShared: jest.fn().mockImplementation(() => {
      order.push('lockPlan');
      return Promise.resolve(k2Plan);
    }),
    vendorIdOf: jest.fn().mockResolvedValue('ven-1'),
    lookups: jest.fn().mockResolvedValue([k2Plan]),
    ...(overrides.plans as object),
  } as unknown as PlanFactsService;
  const workspaces = {
    lockBoth: jest.fn().mockImplementation(() => {
      order.push('lockWorkspace');
      return Promise.resolve();
    }),
    resolveAndLock: jest.fn().mockImplementation(() => {
      order.push('resolveAndLock');
      return Promise.resolve('ws-resolved');
    }),
    ...(overrides.workspaces as object),
  } as unknown as WorkspaceForSubscriptionService;
  const baselinePhase = {
    isBound: jest.fn().mockReturnValue(true),
    get: jest
      .fn()
      .mockReturnValue({ isClosed: jest.fn().mockResolvedValue(false), ...(overrides.baselinePhase as object) }),
  } as unknown as SeatBaselinePhaseHook;
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const audit = { record: auditRecord, ...(overrides.audit as object) } as unknown as AuditApi;
  const service = new SubscriptionLineService(
    lines,
    seatLedger,
    plans,
    workspaces,
    baselinePhase,
    occupancy,
    audit,
    runner,
  );

  return {
    service,
    lines,
    insert,
    update,
    openLines,
    auditRecord,
    seatLedger,
    plans,
    workspaces,
    baselinePhase,
    audit,
    order,
  };
}

describe('SubscriptionLineService (W3-15)', () => {
  describe('addLine (N5 lock order + baseline + uniqueness)', () => {
    it('locks workspace (5b) -> period (6) -> plan (7) and opens ledger when ACTIVE', async () => {
      const { service, insert, openLines, order } = makeSut();

      const created = await service.addLine(actor, 'sub-1', {
        planId: 'plan-2',
        monthlyUnitPrice: { amount: '375000', currency: 'VND' },
        minimumSeats: 5,
        quantity: 4,
        expectedUpdatedAt: updatedAt,
      });

      expect(order).toEqual(['lockWorkspace', 'lockPeriod', 'lockPlan']);
      expect(insert).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          subscriptionId: 'sub-1',
          workspaceId: 'ws-1',
          planId: 'plan-2',
          monthlyUnitPriceMinor: 375_000n,
          minimumSeats: 5,
        }),
      );
      expect(openLines).toHaveBeenCalledWith(expect.anything(), {
        lines: [
          {
            lineId: created.id,
            effectiveOn: '2026-11-01',
            quantity: 4,
            recordedByEmployeeId: 'emp-khoa',
          },
        ],
      });
    });

    const baseAdd = {
      planId: 'plan-2',
      monthlyUnitPrice: { amount: '375000', currency: 'VND' },
      expectedUpdatedAt: updatedAt,
    };

    it('retries up to 3 times when workspaceId moves between probe and lock, then throws 409 SUBSCRIPTION.STALE', async () => {
      const readPeriodWorkspace = jest.fn().mockResolvedValue('ws-0');
      const lockPeriod = jest
        .fn()
        .mockResolvedValueOnce(makePeriod({ workspaceId: 'ws-1' }))
        .mockResolvedValueOnce(makePeriod({ workspaceId: 'ws-2' }))
        .mockResolvedValueOnce(makePeriod({ workspaceId: 'ws-3' }))
        .mockResolvedValueOnce(makePeriod({ workspaceId: 'ws-4' }));
      const { service } = makeSut({ lines: { readPeriodWorkspace, lockPeriod } });

      const caught = await service.addLine(actor, 'sub-1', baseAdd).catch((e: unknown) => e);

      expect(lockPeriod).toHaveBeenCalledTimes(4);
      expect(caught).toBeInstanceOf(SubscriptionLinePeriodStaleError);
      expect(codeOf(caught)).toEqual({ status: HttpStatus.CONFLICT, code: 'SUBSCRIPTION.STALE' });
    });

    it('rejects non-responsible IT Admin with 403 SUBSCRIPTION_LINE.NOT_RESPONSIBLE', async () => {
      const { service } = makeSut({
        lines: {
          readPeriodWorkspace: jest.fn().mockResolvedValue('ws-1'),
          lockPeriod: jest.fn().mockResolvedValue(makePeriod({ responsibleItAdminEmployeeId: 'emp-other' })),
        },
      });

      const caught = await service.addLine(actor, 'sub-1', baseAdd).catch((e: unknown) => e);

      expect(caught).toBeInstanceOf(SubscriptionLineNotResponsibleError);
      expect(codeOf(caught)).toEqual({ status: HttpStatus.FORBIDDEN, code: 'SUBSCRIPTION_LINE.NOT_RESPONSIBLE' });
    });

    it('rejects quantity when baseline phase is closed with 422 SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE', async () => {
      const { service } = makeSut({
        baselinePhase: { isClosed: jest.fn().mockResolvedValue(true) },
      });

      const caught = await service.addLine(actor, 'sub-1', { ...baseAdd, quantity: 3 }).catch((e: unknown) => e);

      expect(caught).toBeInstanceOf(SubscriptionLineQuantityViaPurchaseError);
      expect(codeOf(caught)).toEqual({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: 'SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE',
      });
    });

    it('rejects duplicate live line in workspace with 409 SUBSCRIPTION.DUPLICATE_PLAN', async () => {
      const { service } = makeSut({
        lines: {
          readPeriodWorkspace: jest.fn().mockResolvedValue('ws-1'),
          lockPeriod: jest.fn().mockResolvedValue(makePeriod()),
          findLive: jest.fn().mockResolvedValue({ id: 'line-existing', subscriptionId: 'sub-other' }),
        },
      });

      const caught = await service.addLine(actor, 'sub-1', baseAdd).catch((e: unknown) => e);

      expect(caught).toBeInstanceOf(SubscriptionLineLiveTakenError);
      expect(codeOf(caught)).toEqual({ status: HttpStatus.CONFLICT, code: 'SUBSCRIPTION.DUPLICATE_PLAN' });
    });

    it('rejects plan from another vendor with 422 WORKSPACE_VENDOR_MISMATCH and non-K2 plan', async () => {
      const { service } = makeSut({
        workspaces: {
          lockBoth: jest.fn().mockRejectedValue(new WorkspaceVendorMismatchError()),
        },
        plans: {
          lockShared: jest.fn().mockResolvedValue(k2Plan),
          vendorIdOf: jest.fn().mockResolvedValue('ven-other'),
          lookups: jest.fn().mockResolvedValue([k2Plan]),
        },
      });

      const caught = await service
        .addLine(actor, 'sub-1', {
          planId: 'plan-2',
          monthlyUnitPrice: { amount: '375000', currency: 'VND' },
          expectedUpdatedAt: updatedAt,
        })
        .catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(WorkspaceVendorMismatchError);
      expect(codeOf(caught)).toEqual({ status: HttpStatus.UNPROCESSABLE_ENTITY, code: 'WORKSPACE_VENDOR_MISMATCH' });

      const { service: nonK2Svc } = makeSut({
        plans: {
          lockShared: jest.fn().mockResolvedValue({ ...k2Plan, provisioningType: 'K4' }),
          vendorIdOf: jest.fn().mockResolvedValue('ven-1'),
          lookups: jest.fn().mockResolvedValue([{ ...k2Plan, provisioningType: 'K4' }]),
        },
      });
      const caughtK4 = await nonK2Svc
        .addLine(actor, 'sub-1', {
          planId: 'plan-2',
          monthlyUnitPrice: { amount: '375000', currency: 'VND' },
          expectedUpdatedAt: updatedAt,
        })
        .catch((e: unknown) => e);
      expect(caughtK4).toBeInstanceOf(SubscriptionLinePlanNotK2Error);
    });

    it('LINES_LIMIT: rejects adding a 21st line to a period with 409 SUBSCRIPTION.LINES_LIMIT', async () => {
      const existingTwenty = Array.from({ length: 20 }, (_, i) => makeLine({ id: `line-${i}`, planId: `plan-${i}` }));
      const { service, insert } = makeSut({
        lines: {
          readPeriodWorkspace: jest.fn().mockResolvedValue('ws-1'),
          lockPeriod: jest.fn().mockResolvedValue(makePeriod()),
          ofSubscriptions: jest.fn().mockResolvedValue(new Map([['sub-1', existingTwenty]])),
        },
      });

      const caught = await service.addLine(actor, 'sub-1', baseAdd).catch((e: unknown) => e);

      expect(codeOf(caught)).toEqual({ status: HttpStatus.CONFLICT, code: 'SUBSCRIPTION.LINES_LIMIT' });
      expect(insert).not.toHaveBeenCalled();
    });

    it('F-4: ensureLineWorkspace locks workspace (5b) before period (6) when period.workspaceId is null', async () => {
      const { service, order } = makeSut({
        lines: {
          readPeriodWorkspace: jest.fn().mockResolvedValue(null),
          lockPeriod: jest.fn().mockImplementation(() => {
            order.push('lockPeriod');
            return Promise.resolve(makePeriod({ workspaceId: null }));
          }),
        },
      });

      await service.addLine(actor, 'sub-1', { ...baseAdd, quantity: 1 });

      expect(order).toEqual(['resolveAndLock', 'lockPeriod', 'lockPlan']);
    });
  });
});
