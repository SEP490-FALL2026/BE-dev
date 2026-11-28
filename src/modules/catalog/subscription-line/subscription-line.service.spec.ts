import { HttpStatus } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { PlanFactsService, LockedPlan } from '../plan/plan-facts.service';
import type { SeatBaselinePhaseHook, SeatOccupancyHook } from '../public/catalog.extension-points';
import { WorkspaceVendorMismatchError } from '../workspace/workspace.errors';
import type { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import type { SeatLedgerService } from './ledger/seat-ledger.service';
import * as lineErrors from './subscription-line.errors';
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
const res = (v: unknown) => jest.fn().mockResolvedValue(v);
const k2Plan = {
  id: 'plan-2',
  name: 'Figma FigJam',
  applicationStatus: 'APPROVED',
  provisioningType: 'K2',
} as unknown as LockedPlan;
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
const codeOf = (error: unknown) => {
  const mapped = toSubscriptionLineApiException(error) as {
    getStatus?: () => number;
    getResponse?: () => { code?: string };
  };
  return { status: mapped.getStatus?.() ?? 500, code: mapped.getResponse?.().code };
};
async function expectRefusal(
  work: () => Promise<unknown>,
  ErrClass: new (...args: never[]) => unknown,
  status: HttpStatus,
  code?: string,
) {
  const caught = await work().catch((e: unknown) => e);
  expect(caught).toBeInstanceOf(ErrClass);
  expect(codeOf(caught)).toEqual({ status, code });
}

function makeSut(overrides: Record<string, unknown> = {}) {
  const tx = {} as DbTx;
  const order: string[] = [];
  const seq = (label: string, v: unknown) =>
    jest.fn().mockImplementation(() => (order.push(label), Promise.resolve(v)));
  const runner = {
    run: jest.fn(async (work: (t: DbTx) => Promise<unknown>) => work(tx)),
  } as unknown as TransactionRunner;
  const insert = res(makeLine());
  const update = res(makeLine({ monthlyUnitPriceMinor: 420_000n }));
  const lines = {
    readPeriodWorkspace: res('ws-1'),
    lockPeriod: seq('lockPeriod', makePeriod()),
    findLive: res(null),
    ofSubscriptions: res(new Map()),
    insert,
    lock: seq('lockLine', makeLine()),
    find: seq('findLine', makeLine()),
    update,
    ...(overrides.lines as object),
  } as unknown as SubscriptionLineRepo;
  const openLines = res(undefined);
  const seatLedger = {
    openLines,
    businessToday: res('2026-11-21'),
    requireOrganizationId: res('org-1'),
    seatsOnDays: res(new Map([['line-1', new Map([['2026-11-21', 5]])]])),
    ...(overrides.seatLedger as object),
  } as unknown as SeatLedgerService;
  const occupancy = {
    get: jest.fn().mockReturnValue({ occupiedBySubscriptionPlans: res(new Map()) }),
  } as unknown as SeatOccupancyHook;
  const plans = {
    lockShared: seq('lockPlan', k2Plan),
    vendorIdOf: res('ven-1'),
    lookups: res([k2Plan]),
    ...(overrides.plans as object),
  } as unknown as PlanFactsService;
  const workspaces = {
    lockBoth: seq('lockWorkspace', undefined),
    resolveAndLock: seq('resolveAndLock', 'ws-resolved'),
    ...(overrides.workspaces as object),
  } as unknown as WorkspaceForSubscriptionService;
  const baselinePhase = (overrides.overrideBaseline ?? {
    isBound: jest.fn().mockReturnValue(true),
    get: jest.fn().mockReturnValue({ isClosed: res(false), ...(overrides.baselinePhase as object) }),
  }) as unknown as SeatBaselinePhaseHook;
  const auditRecord = res(undefined);
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
  return { service, insert, update, openLines, auditRecord, order };
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
        lines: [{ lineId: created.id, effectiveOn: '2026-11-01', quantity: 4, recordedByEmployeeId: 'emp-khoa' }],
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

      await expectRefusal(
        () => service.addLine(actor, 'sub-1', baseAdd),
        lineErrors.SubscriptionLinePeriodStaleError,
        HttpStatus.CONFLICT,
        'SUBSCRIPTION.STALE',
      );
      expect(lockPeriod).toHaveBeenCalledTimes(4);
    });

    const addRefusals: [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
      new (...a: never[]) => unknown,
      HttpStatus,
      string?,
    ][] = [
      [
        'non-responsible IT Admin -> 403',
        {},
        { lines: { lockPeriod: res(makePeriod({ responsibleItAdminEmployeeId: 'emp-other' })) } },
        lineErrors.SubscriptionLineNotResponsibleError,
        HttpStatus.FORBIDDEN,
        'SUBSCRIPTION_LINE.NOT_RESPONSIBLE',
      ],
      [
        'unbound baseline hook -> throws loudly',
        { quantity: 3 },
        {
          baselinePhase: undefined,
          overrideBaseline: {
            isBound: jest.fn().mockReturnValue(false),
            get: jest.fn(() => {
              throw new Error("ExtensionPoint 'catalog.seat-baseline-phase' is not bound.");
            }),
          },
        },
        Error,
        HttpStatus.INTERNAL_SERVER_ERROR,
        undefined,
      ],
      [
        'closed baseline with quantity -> 422',
        { quantity: 3 },
        { baselinePhase: { isClosed: res(true) } },
        lineErrors.SubscriptionLineQuantityViaPurchaseError,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE',
      ],
      [
        'duplicate live line -> 409',
        {},
        { lines: { findLive: res({ id: 'line-existing', subscriptionId: 'sub-other' }) } },
        lineErrors.SubscriptionLineLiveTakenError,
        HttpStatus.CONFLICT,
        'SUBSCRIPTION.DUPLICATE_PLAN',
      ],
      [
        'plan from another vendor -> 422',
        {},
        {
          workspaces: { lockBoth: jest.fn().mockRejectedValue(new WorkspaceVendorMismatchError()) },
          plans: { vendorIdOf: res('ven-other') },
        },
        WorkspaceVendorMismatchError,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SUBSCRIPTION_LINE.WORKSPACE_VENDOR_MISMATCH',
      ],
      [
        'non-K2 plan -> 422',
        {},
        { plans: { lockShared: res({ ...k2Plan, provisioningType: 'K4' }) } },
        lineErrors.SubscriptionLinePlanNotK2Error,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SUBSCRIPTION_LINE.PLAN_NOT_K2',
      ],
      [
        '21st line (LINES_LIMIT) -> 409',
        {},
        {
          lines: {
            ofSubscriptions: res(
              new Map([
                ['sub-1', Array.from({ length: 20 }, (_, i) => makeLine({ id: `line-${i}`, planId: `plan-${i}` }))],
              ]),
            ),
          },
        },
        lineErrors.SubscriptionLinesLimitError,
        HttpStatus.CONFLICT,
        'SUBSCRIPTION.LINES_LIMIT',
      ],
      [
        'DRAFT period -> 422',
        {},
        { lines: { lockPeriod: res(makePeriod({ status: 'DRAFT', responsibleItAdminEmployeeId: null })) } },
        lineErrors.SubscriptionLinePeriodStillDraftError,
        HttpStatus.UNPROCESSABLE_ENTITY,
        'SUBSCRIPTION.STILL_DRAFT',
      ],
    ];

    it.each(addRefusals)('refuses %s', async (_label, extra, overrides, ErrClass, status, code) => {
      const { service, insert } = makeSut(overrides);
      await expectRefusal(() => service.addLine(actor, 'sub-1', { ...baseAdd, ...extra }), ErrClass, status, code);
      expect(insert).not.toHaveBeenCalled();
    });

    it('ensureLineWorkspace locks workspace (5b) before period (6) when period.workspaceId is null', async () => {
      const { service, order } = makeSut({
        lines: {
          readPeriodWorkspace: res(null),
          lockPeriod: jest
            .fn()
            .mockImplementation(() => (order.push('lockPeriod'), Promise.resolve(makePeriod({ workspaceId: null })))),
        },
      });
      await service.addLine(actor, 'sub-1', { ...baseAdd, quantity: 1 });
      expect(order).toEqual(['resolveAndLock', 'lockPeriod', 'lockPlan']);
    });
  });

  describe('updateLine', () => {
    const updBody = { monthlyUnitPrice: { amount: '400000', currency: 'VND' }, expectedUpdatedAt: updatedAt };

    it.each([
      [
        'missing line (404)',
        'line-x',
        {},
        { lines: { lock: res(null), find: res(null) } },
        lineErrors.SubscriptionLineNotFoundError,
        HttpStatus.NOT_FOUND,
        'SUBSCRIPTION_LINE.NOT_FOUND',
      ],
      [
        'non-responsible IT Admin (403)',
        'line-1',
        {},
        { lines: { lockPeriod: res(makePeriod({ responsibleItAdminEmployeeId: 'other' })) } },
        lineErrors.SubscriptionLineNotResponsibleError,
        HttpStatus.FORBIDDEN,
        'SUBSCRIPTION_LINE.NOT_RESPONSIBLE',
      ],
      [
        'closed line (409)',
        'line-1',
        {},
        { lines: { lock: res(makeLine({ closedOn: '2026-11-15', closedReason: 'REMOVED' })) } },
        lineErrors.SubscriptionLineClosedError,
        HttpStatus.CONFLICT,
        'SUBSCRIPTION_LINE.CLOSED',
      ],
      [
        'stale version (409)',
        'line-1',
        { expectedUpdatedAt: new Date('2026-11-19T00:00:00.000Z') },
        {},
        lineErrors.SubscriptionLineStaleError,
        HttpStatus.CONFLICT,
        'SUBSCRIPTION_LINE.STALE',
      ],
    ] as const)('rejects %s', async (_label, id, extra, overrides, ErrClass, status, code) => {
      const { service } = makeSut(overrides);
      await expectRefusal(() => service.updateLine(actor, id, { ...updBody, ...extra }), ErrClass, status, code);
    });

    it('updates monthlyUnitPriceMinor / minimumSeats and records SUBSCRIPTION_LINE.UPDATED audit', async () => {
      const { service, update, auditRecord } = makeSut();
      const body = {
        monthlyUnitPrice: { amount: '420000', currency: 'VND' },
        minimumSeats: 10,
        expectedUpdatedAt: updatedAt,
      };
      await service.updateLine(actor, 'line-1', body);
      expect(update).toHaveBeenCalledWith(expect.anything(), 'line-1', {
        monthlyUnitPriceMinor: 420_000n,
        minimumSeats: 10,
      });
      const auditMatch = {
        action: 'SUBSCRIPTION_LINE.UPDATED',
        resourceType: 'SUBSCRIPTION_LINE',
        resourceId: 'line-1',
      };
      expect(auditRecord).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(auditMatch));
    });

    it('reads line unlocked, locks period (6) before line (6c), and retries if subscriptionId moved', async () => {
      const { service, order } = makeSut();
      await service.updateLine(actor, 'line-1', updBody);
      expect(order).toEqual(['findLine', 'lockPeriod', 'lockLine']);

      const oldLine = makeLine({ subscriptionId: 'sub-old' });
      const newLine = makeLine({ subscriptionId: 'sub-new' });
      const find = jest.fn().mockResolvedValueOnce(oldLine).mockResolvedValueOnce(newLine);
      const lockPeriod = jest.fn().mockResolvedValue(makePeriod({ id: 'sub-new' }));
      const retrySut = makeSut({ lines: { find, lock: jest.fn().mockResolvedValue(newLine), lockPeriod } });
      await retrySut.service.updateLine(actor, 'line-1', updBody);
      expect(lockPeriod).toHaveBeenNthCalledWith(1, expect.anything(), 'sub-old', 'SHARE');
      expect(lockPeriod).toHaveBeenNthCalledWith(2, expect.anything(), 'sub-new', 'SHARE');
      expect(retrySut.update).toHaveBeenCalledTimes(1);

      const always = {
        find: jest.fn().mockResolvedValue(oldLine),
        lock: jest.fn().mockResolvedValue(newLine),
        lockPeriod: jest.fn().mockResolvedValue(makePeriod()),
      };
      await expectRefusal(
        () => makeSut({ lines: always }).service.updateLine(actor, 'line-1', updBody),
        lineErrors.SubscriptionLineStaleError,
        HttpStatus.CONFLICT,
        'SUBSCRIPTION_LINE.STALE',
      );
    });
  });
});
