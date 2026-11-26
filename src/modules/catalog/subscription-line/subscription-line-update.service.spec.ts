import { HttpStatus } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import type { LockedPlan, PlanFactsService } from '../plan/plan-facts.service';
import type { SeatBaselinePhaseHook, SeatOccupancyHook } from '../public/catalog.extension-points';
import type { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import type { SeatLedgerService } from './ledger/seat-ledger.service';
import {
  SubscriptionLineClosedError,
  SubscriptionLineNotFoundError,
  SubscriptionLineNotResponsibleError,
  SubscriptionLineStaleError,
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
  return {
    status: mapped.getStatus?.() ?? 500,
    code: mapped.getResponse?.().code,
  };
}

function makeSut(overrides: Record<string, unknown> = {}) {
  const tx = {} as DbTx;
  const runner = {
    run: jest.fn(async (work: (t: DbTx) => Promise<unknown>) => work(tx)),
  } as unknown as TransactionRunner;
  const update = jest.fn().mockResolvedValue(makeLine({ monthlyUnitPriceMinor: 420_000n }));
  const lines = {
    lockPeriod: jest.fn().mockResolvedValue(makePeriod()),
    lock: jest.fn().mockResolvedValue(makeLine()),
    find: jest.fn().mockResolvedValue(makeLine()),
    update,
    ...(overrides.lines as object),
  } as unknown as SubscriptionLineRepo;
  const seatLedger = {
    businessToday: jest.fn().mockResolvedValue('2026-11-21'),
    seatsOnDays: jest.fn().mockResolvedValue(new Map([['line-1', new Map([['2026-11-21', 5]])]])),
  } as unknown as SeatLedgerService;
  const occupancy = {
    get: jest.fn().mockReturnValue({
      occupiedBySubscriptionPlans: jest.fn().mockResolvedValue(new Map()),
    }),
  } as unknown as SeatOccupancyHook;
  const plans = { lookups: jest.fn().mockResolvedValue([k2Plan]) } as unknown as PlanFactsService;
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const service = new SubscriptionLineService(
    lines,
    seatLedger,
    plans,
    {} as WorkspaceForSubscriptionService,
    {} as SeatBaselinePhaseHook,
    occupancy,
    { record: auditRecord } as unknown as AuditApi,
    runner,
  );

  return { service, update, auditRecord };
}

describe('SubscriptionLineService updateLine', () => {
  const updBody = { monthlyUnitPrice: { amount: '400000', currency: 'VND' }, expectedUpdatedAt: updatedAt };

  it('rejects missing line (404), non-responsible IT Admin (403), closed line (409), stale version (409)', async () => {
    const missing = makeSut({
      lines: { lock: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue(null) },
    });
    await expect(missing.service.updateLine(actor, 'line-x', updBody)).rejects.toBeInstanceOf(
      SubscriptionLineNotFoundError,
    );
    expect(codeOf(new SubscriptionLineNotFoundError())).toEqual({
      status: HttpStatus.NOT_FOUND,
      code: 'SUBSCRIPTION_LINE.NOT_FOUND',
    });

    const notResp = makeSut({
      lines: {
        find: jest.fn().mockResolvedValue(makeLine()),
        lock: jest.fn().mockResolvedValue(makeLine()),
        lockPeriod: jest.fn().mockResolvedValue(makePeriod({ responsibleItAdminEmployeeId: 'other' })),
      },
    });
    await expect(notResp.service.updateLine(actor, 'line-1', updBody)).rejects.toBeInstanceOf(
      SubscriptionLineNotResponsibleError,
    );

    const closed = makeSut({
      lines: {
        find: jest.fn().mockResolvedValue(makeLine()),
        lock: jest.fn().mockResolvedValue(makeLine({ closedOn: '2026-11-15', closedReason: 'REMOVED' })),
        lockPeriod: jest.fn().mockResolvedValue(makePeriod()),
      },
    });
    await expect(closed.service.updateLine(actor, 'line-1', updBody)).rejects.toBeInstanceOf(
      SubscriptionLineClosedError,
    );
    expect(codeOf(new SubscriptionLineClosedError())).toEqual({
      status: HttpStatus.CONFLICT,
      code: 'SUBSCRIPTION_LINE.CLOSED',
    });

    const stale = makeSut();
    await expect(
      stale.service.updateLine(actor, 'line-1', {
        ...updBody,
        expectedUpdatedAt: new Date('2026-11-19T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(SubscriptionLineStaleError);
    expect(codeOf(new SubscriptionLineStaleError(updatedAt))).toEqual({
      status: HttpStatus.CONFLICT,
      code: 'SUBSCRIPTION_LINE.STALE',
    });
  });

  it('updates monthlyUnitPriceMinor / minimumSeats and records SUBSCRIPTION_LINE.UPDATED audit', async () => {
    const { service, update, auditRecord } = makeSut();

    await service.updateLine(actor, 'line-1', {
      monthlyUnitPrice: { amount: '420000', currency: 'VND' },
      minimumSeats: 10,
      expectedUpdatedAt: updatedAt,
    });

    expect(update).toHaveBeenCalledWith(expect.anything(), 'line-1', {
      monthlyUnitPriceMinor: 420_000n,
      minimumSeats: 10,
    });
    expect(auditRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'SUBSCRIPTION_LINE.UPDATED',
        resourceType: 'SUBSCRIPTION_LINE',
        resourceId: 'line-1',
      }),
    );
  });
});
