import { HttpStatus } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { LockedPlan, PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import type { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { SubscriptionLinesXorPlanError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import { SubscriptionMultiLineService } from './subscription-lines.service';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionRepo } from '../subscription.repo';
import { SubscriptionService } from '../subscription.service';
import type { SubscriptionRecord, SubscriptionView } from '../subscription.types';
import type { SubscriptionViewService } from '../subscription-view.service';

const actor = {
  appUserId: 'user-1',
  employeeId: 'emp-khoa',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

const planA: LockedPlan = {
  id: 'plan-b',
  name: 'FigJam',
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

const planB: LockedPlan = {
  ...planA,
  id: 'plan-a',
  name: 'Figma Design',
};

const baseRecord = (over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  id: 'sub-1',
  planId: 'plan-b',
  planName: 'FigJam',
  planPricingModel: 'PER_SEAT',
  planProvisioningType: 'K2',
  planHasAdminConsole: true,
  applicationId: 'app-1',
  applicationName: 'Figma',
  applicationLogoUrl: null,
  applicationKind: 'SAAS',
  vendor: { id: 'ven-1', name: 'Figma' },
  kind: 'TERM',
  status: 'ACTIVE',
  purchasedQuantity: 10,
  unitPrice: { amountMinor: 375_000n, currency: 'VND', recordedOn: '2026-11-01' },
  monthlyUnitPriceMinor: 375_000n,
  priceSnapshot: {
    rate: 1n,
    rateDate: '2026-11-01',
    rateSource: 'SAME_CURRENCY',
    reportingMinor: 375_000n,
    reportingCurrency: 'VND',
    exchangeRateId: null,
  },
  originalPrice: null,
  billingCycle: 'MONTHLY',
  commitmentTermMonths: 1,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  renewalDate: '2026-12-01',
  noticeDeadline: null,
  noticePeriodDays: null,
  autoRenew: false,
  allowsMidTermReduction: false,
  responsibleItAdminEmployeeId: 'emp-khoa',
  vendorMinimumSeats: null,
  isPrimaryForPlan: true,
  renewedFromId: null,
  workspace: { id: 'ws-1', name: 'Figma WS' },
  seatCounting: 'FIXED',
  minimumSeatsTotal: null,
  invoicedLater: false,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  ...over,
});

describe('SubscriptionService lines[] & draft activation (W3-15)', () => {
  it('refuses body having both lines and planId, or neither, with 422 SUBSCRIPTION.LINES_XOR_PLAN', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const service = new SubscriptionService(
      {} as SubscriptionRepo,
      {} as PlanFactsService,
      { read: jest.fn(), readOriginal: jest.fn(), priceToday: jest.fn() } as unknown as SubscriptionPricingService,
      { viewAll: jest.fn() } as unknown as SubscriptionViewService,
      {
        requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
        createForPeriod: jest.fn(),
        activatePeriod: jest.fn(),
        hasLines: jest.fn().mockResolvedValue(false),
        declare: jest.fn(),
      } as unknown as SubscriptionMultiLineService,
      { requireItAdmin: jest.fn() } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    const errBoth = await service
      .declare(actor, {
        planId: 'plan-a',
        lines: [{ planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 5 }],
        kind: 'TERM',
      } as never)
      .catch((e: unknown) => e);
    expect(errBoth).toBeInstanceOf(SubscriptionLinesXorPlanError);
    const httpBoth = toSubscriptionApiException(errBoth) as {
      getStatus: () => number;
      getResponse: () => { code: string };
    };
    expect(httpBoth.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(httpBoth.getResponse().code).toBe('SUBSCRIPTION.LINES_XOR_PLAN');

    const errNeither = await service.declare(actor, { kind: 'TERM' } as never).catch((e: unknown) => e);
    expect(errNeither).toBeInstanceOf(SubscriptionLinesXorPlanError);
  });

  it('locks plans in ascending id order after workspace (5b -> 7), writes lines, and opens ledger on ACTIVE create', async () => {
    const lockOrder: string[] = [];
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const lockExclusive = jest.fn((_tx: DbTx, id: string) => {
      lockOrder.push(`plan:${id}`);
      return Promise.resolve(id === 'plan-a' ? planB : planA);
    });
    const workspaceFor = jest.fn(() => {
      lockOrder.push('workspace:ws-1');
      return Promise.resolve('ws-1');
    });
    const createForPeriod = jest.fn().mockResolvedValue(undefined);
    const periodLines = {
      requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
      hasLiveLine: jest.fn().mockResolvedValue(null),
      hasLines: jest.fn().mockResolvedValue(false),
      createForPeriod,
      activatePeriod: jest.fn(),
    } as unknown as SubscriptionPeriodLinesService;

    const multiLine = new SubscriptionMultiLineService(
      { insert: jest.fn().mockResolvedValue(baseRecord({ purchasedQuantity: 10 })) } as unknown as SubscriptionRepo,
      {
        lookups: jest.fn().mockResolvedValue([planA, planB]),
        vendorIdsOf: jest.fn().mockResolvedValue(
          new Map([
            ['plan-a', 'ven-1'],
            ['plan-b', 'ven-1'],
          ]),
        ),
        lockExclusive,
      } as unknown as PlanFactsService,
      {
        read: jest.fn((m: { amount: string }) => Promise.resolve({ amountMinor: BigInt(m.amount), currency: 'VND' })),
        readOriginal: jest.fn(),
        priceToday: jest.fn().mockResolvedValue({ unitPrice: null, priceSnapshot: null }),
      } as unknown as SubscriptionPricingService,
      periodLines,
      {
        workspaceFor,
        assertNoLiveDuplicate: jest.fn(),
        responsibleOfDeclaration: jest.fn().mockResolvedValue('emp-khoa'),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    const service = new SubscriptionService(
      {} as SubscriptionRepo,
      {} as PlanFactsService,
      {} as SubscriptionPricingService,
      {
        viewAll: jest.fn().mockResolvedValue([{ id: 'sub-1' } as SubscriptionView]),
      } as unknown as SubscriptionViewService,
      multiLine,
      { requireItAdmin: jest.fn() } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    await service.declare(actor, {
      kind: 'TERM',
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 1,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      lines: [
        { planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 4, minimumSeats: 2 },
        { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 6 },
      ],
    });

    expect(lockOrder).toEqual(['workspace:ws-1', 'plan:plan-a', 'plan:plan-b']);
    expect(createForPeriod).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        subscriptionId: 'sub-1',
        workspaceId: 'ws-1',
        startDate: '2026-11-01',
        status: 'ACTIVE',
        recordedByEmployeeId: 'emp-khoa',
      }),
    );
  });

  it('writes monthlyUnitPriceMinor to draft line and opens ledger on complete (FIX-W3 P15)', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const draft = baseRecord({
      status: 'DRAFT',
      purchasedQuantity: 5,
      monthlyUnitPriceMinor: 375_000n,
      unitPrice: { amountMinor: 375_000n, currency: 'VND', recordedOn: '2026-11-01' },
    });
    const active = baseRecord({ status: 'ACTIVE' });
    const activatePeriod = jest.fn().mockResolvedValue(undefined);

    const service = new SubscriptionService(
      {
        find: jest.fn().mockResolvedValue(draft),
        lock: jest.fn().mockResolvedValue(draft),
        update: jest.fn().mockResolvedValue(active),
      } as unknown as SubscriptionRepo,
      {
        lookups: jest.fn().mockResolvedValue([planA]),
        lockExclusive: jest.fn().mockResolvedValue(planA),
      } as unknown as PlanFactsService,
      { read: jest.fn(), readOriginal: jest.fn(), priceToday: jest.fn() } as unknown as SubscriptionPricingService,
      {
        viewAll: jest.fn().mockResolvedValue([{ id: 'sub-1' } as SubscriptionView]),
      } as unknown as SubscriptionViewService,
      {
        requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
        hasLines: jest.fn().mockResolvedValue(false),
        createForPeriod: jest.fn(),
        activatePeriod,
        declare: jest.fn(),
      } as unknown as SubscriptionMultiLineService,
      {
        workspaceFor: jest.fn().mockResolvedValue('ws-1'),
        assertActivation: jest.fn(),
        assertNoLiveDuplicate: jest.fn(),
        takePrimaryFromPrevious: jest.fn().mockResolvedValue(true),
      } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    await service.complete(actor, 'sub-1');

    expect(activatePeriod).toHaveBeenCalledWith(tx, active, 'emp-khoa');
  });
});
