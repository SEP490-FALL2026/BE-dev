import { HttpStatus } from '@nestjs/common';
import type { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { LockedPlan, PlanFactsService } from '../../plan/plan-facts.service';
import type { SubscriptionPeriodLinesService } from '../../subscription-line/subscription-period-lines.service';
import type { SubscriptionPoolService } from '../pool/subscription-pool.service';
import { SubscriptionStillDraftError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionRepo } from '../subscription.repo';
import { SubscriptionMultiLineService } from './subscription-lines.service';

const actor = {
  appUserId: 'user-1',
  employeeId: 'emp-khoa',
  roles: ['IT_ADMIN'],
  sessionId: 'sess-1',
} as unknown as AuthenticatedPrincipal;

const planA: LockedPlan = {
  id: 'plan-a',
  name: 'Figma Design',
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

const planB: LockedPlan = { ...planA, id: 'plan-b', name: 'FigJam' };

describe('SubscriptionMultiLineService (F-3)', () => {
  it('F-3: refuses declaring a multi-line DRAFT with 422 SUBSCRIPTION.STILL_DRAFT', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const insert = jest.fn();
    const createForPeriod = jest.fn();
    const periodLines = {
      requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
      hasLiveLine: jest.fn().mockResolvedValue(null),
      hasLines: jest.fn().mockResolvedValue(false),
      hasPricedLines: jest.fn().mockResolvedValue(false),
      createForPeriod,
      activatePeriod: jest.fn(),
    } as unknown as SubscriptionPeriodLinesService;

    const multiLine = new SubscriptionMultiLineService(
      { insert } as unknown as SubscriptionRepo,
      {
        lookups: jest.fn().mockResolvedValue([planA, planB]),
        vendorIdsOf: jest.fn().mockResolvedValue(
          new Map([
            ['plan-a', 'ven-1'],
            ['plan-b', 'ven-1'],
          ]),
        ),
        lockExclusive: jest.fn((_tx: DbTx, id: string) => Promise.resolve(id === 'plan-a' ? planA : planB)),
      } as unknown as PlanFactsService,
      {
        read: jest.fn((m: { amount: string }) => Promise.resolve({ amountMinor: BigInt(m.amount), currency: 'VND' })),
        readOriginal: jest.fn(),
        priceToday: jest.fn().mockResolvedValue({ unitPrice: null, priceSnapshot: null }),
      } as unknown as SubscriptionPricingService,
      periodLines,
      {
        workspaceFor: jest.fn().mockResolvedValue('ws-1'),
        assertNoLiveDuplicate: jest.fn(),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    const err = await multiLine
      .declare(
        actor,
        {
          kind: 'TERM',
          billingCycle: 'MONTHLY',
          commitmentTermMonths: 1,
          lines: [
            { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
            { planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 2 },
          ],
        },
        [
          { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
          { planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 2 },
        ],
      )
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SubscriptionStillDraftError);
    const httpErr = toSubscriptionApiException(err) as {
      getStatus: () => number;
      getResponse: () => { code: string; details?: { missing?: string[] } };
    };
    expect(httpErr.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(httpErr.getResponse()).toMatchObject({
      code: 'SUBSCRIPTION.STILL_DRAFT',
      details: { missing: ['START_DATE'] },
    });
    expect(insert).not.toHaveBeenCalled();
    expect(createForPeriod).not.toHaveBeenCalled();
  });

  it('R8: refuses with 422 SUBSCRIPTION.APPLICATION_RETIRED naming the plan when the application of a second plan was retired between the lookup and the lock', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const insert = jest.fn();
    const multiLine = new SubscriptionMultiLineService(
      { insert } as unknown as SubscriptionRepo,
      {
        lookups: jest.fn().mockResolvedValue([planA, planB]),
        vendorIdsOf: jest.fn().mockResolvedValue(
          new Map([
            ['plan-a', 'ven-1'],
            ['plan-b', 'ven-1'],
          ]),
        ),
        lockExclusive: jest.fn((_tx: DbTx, id: string) =>
          Promise.resolve(id === 'plan-a' ? planA : { ...planB, applicationStatus: 'RETIRED' as const }),
        ),
      } as unknown as PlanFactsService,
      {
        read: jest.fn((m: { amount: string }) => Promise.resolve({ amountMinor: BigInt(m.amount), currency: 'VND' })),
        readOriginal: jest.fn(),
        priceToday: jest.fn(),
      } as unknown as SubscriptionPricingService,
      {
        requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
        hasLiveLine: jest.fn().mockResolvedValue(null),
        createForPeriod: jest.fn(),
      } as unknown as SubscriptionPeriodLinesService,
      {
        workspaceFor: jest.fn().mockResolvedValue('ws-1'),
        assertNoLiveDuplicate: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );
    const lines = [
      { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 10 },
      { planId: 'plan-b', monthlyUnitPrice: { amount: '375000', currency: 'VND' }, quantity: 2 },
    ];

    const err = await multiLine
      .declare(actor, { kind: 'TERM', billingCycle: 'MONTHLY', startDate: '2026-11-01', lines }, lines)
      .catch((e: unknown) => e);

    const httpErr = toSubscriptionApiException(err) as { getStatus: () => number; getResponse: () => object };
    expect(httpErr.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(httpErr.getResponse()).toMatchObject({
      code: 'SUBSCRIPTION.APPLICATION_RETIRED',
      details: { planId: 'plan-b' },
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('LINES_LIMIT: refuses declaring more than 20 lines with 409 SUBSCRIPTION.LINES_LIMIT', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const insert = jest.fn();
    const multiLine = new SubscriptionMultiLineService(
      { insert } as unknown as SubscriptionRepo,
      {} as PlanFactsService,
      { read: jest.fn(), readOriginal: jest.fn(), priceToday: jest.fn() } as unknown as SubscriptionPricingService,
      { requireOrganizationId: jest.fn() } as unknown as SubscriptionPeriodLinesService,
      {} as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    const twentyOne = Array.from({ length: 21 }, (_, idx) => ({
      planId: `plan-${idx}`,
      monthlyUnitPrice: { amount: '500000', currency: 'VND' },
      quantity: 1,
    }));

    const err = await multiLine
      .declare(
        actor,
        { kind: 'TERM', billingCycle: 'MONTHLY', commitmentTermMonths: 1, startDate: '2026-11-01', lines: twentyOne },
        twentyOne,
      )
      .catch((e: unknown) => e);

    const httpErr = toSubscriptionApiException(err) as {
      getStatus: () => number;
      getResponse: () => { code: string };
    };
    expect(httpErr.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(httpErr.getResponse().code).toBe('SUBSCRIPTION.LINES_LIMIT');
    expect(insert).not.toHaveBeenCalled();
  });

  it('populates unitPrice, priceSnapshot, monthlyUnitPriceMinor, and responsibleItAdminEmployeeId for ACTIVE multi-line declaration', async () => {
    const tx = {} as DbTx;
    const runner = { run: (work: (t: DbTx) => unknown) => Promise.resolve(work(tx)) } as unknown as TransactionRunner;
    const insert = jest.fn().mockResolvedValue({
      id: 'sub-1',
      planId: 'plan-a',
      planName: 'Figma Design',
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
      unitPrice: { amountMinor: 6_000_000n, currency: 'VND', recordedOn: '2026-01-05' },
      monthlyUnitPriceMinor: 500_000n,
      priceSnapshot: {
        rate: 1n,
        rateDate: '2026-01-05',
        rateSource: 'SAME_CURRENCY',
        reportingMinor: 6_000_000n,
        reportingCurrency: 'VND',
        exchangeRateId: null,
      },
      originalPrice: null,
      billingCycle: 'ANNUAL',
      commitmentTermMonths: 12,
      startDate: '2026-01-05',
      endDate: '2027-01-04',
      renewalDate: null,
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: false,
      allowsMidTermReduction: false,
      responsibleItAdminEmployeeId: 'emp-khoa',
      vendorMinimumSeats: null,
      isPrimaryForPlan: false,
      renewedFromId: null,
      workspace: { id: 'ws-1', name: 'Figma' },
      seatCounting: 'FIXED',
      minimumSeatsTotal: null,
      invoicedLater: false,
      createdAt: new Date('2026-01-05T00:00:00Z'),
      updatedAt: new Date('2026-01-05T00:00:00Z'),
    });
    const createForPeriod = jest.fn().mockResolvedValue([]);
    const periodLines = {
      requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
      hasLiveLine: jest.fn().mockResolvedValue(null),
      hasLines: jest.fn().mockResolvedValue(false),
      hasPricedLines: jest.fn().mockResolvedValue(false),
      createForPeriod,
      activatePeriod: jest.fn(),
    } as unknown as SubscriptionPeriodLinesService;

    const multiLine = new SubscriptionMultiLineService(
      { insert } as unknown as SubscriptionRepo,
      {
        lookups: jest.fn().mockResolvedValue([planA, planB]),
        vendorIdsOf: jest.fn().mockResolvedValue(
          new Map([
            ['plan-a', 'ven-1'],
            ['plan-b', 'ven-1'],
          ]),
        ),
        lockExclusive: jest.fn((_tx: DbTx, id: string) => Promise.resolve(id === 'plan-a' ? planA : planB)),
      } as unknown as PlanFactsService,
      {
        read: jest.fn((m: { amount: string }) => Promise.resolve({ amountMinor: BigInt(m.amount), currency: 'VND' })),
        readOriginal: jest.fn(),
        priceToday: jest.fn((_tx: DbTx, money: { amountMinor: bigint; currency: string } | null) =>
          Promise.resolve(
            money
              ? {
                  unitPrice: { amountMinor: money.amountMinor, currency: money.currency, recordedOn: '2026-01-05' },
                  priceSnapshot: {
                    rate: 1n,
                    rateDate: '2026-01-05',
                    rateSource: 'SAME_CURRENCY' as const,
                    reportingMinor: money.amountMinor,
                    reportingCurrency: money.currency,
                    exchangeRateId: null,
                  },
                }
              : { unitPrice: null, priceSnapshot: null },
          ),
        ),
      } as unknown as SubscriptionPricingService,
      periodLines,
      {
        workspaceFor: jest.fn().mockResolvedValue('ws-1'),
        assertNoLiveDuplicate: jest.fn(),
        assert: jest.fn(),
        assertVendorAdmins: jest.fn(),
        requireItAdmin: jest.fn(),
      } as unknown as SubscriptionPoolService,
      { record: jest.fn() } as unknown as AuditApi,
      runner,
    );

    const lines = [
      { planId: 'plan-a', monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 5 },
      { planId: 'plan-b', monthlyUnitPrice: { amount: '800000', currency: 'VND' }, quantity: 5 },
    ];
    await multiLine.declare(
      actor,
      {
        kind: 'TERM',
        billingCycle: 'ANNUAL',
        commitmentTermMonths: 12,
        startDate: '2026-01-05',
        endDate: '2027-01-04',
        lines,
      },
      lines,
    );

    expect(insert).toHaveBeenCalledTimes(1);
    const inserted = (insert.mock.calls as [DbTx, Record<string, unknown>][])[0]?.[1];
    expect(inserted).toMatchObject({
      status: 'ACTIVE',
      kind: 'TERM',
      startDate: '2026-01-05',
      billingCycle: 'ANNUAL',
      purchasedQuantity: 10,
      responsibleItAdminEmployeeId: 'emp-khoa',
      monthlyUnitPriceMinor: 500_000n,
    });
    expect(inserted?.unitPrice).toMatchObject({
      amountMinor: 6_000_000n,
      currency: 'VND',
      recordedOn: '2026-01-05',
    });
    expect(inserted?.priceSnapshot).toMatchObject({
      rate: 1n,
      rateDate: '2026-01-05',
      rateSource: 'SAME_CURRENCY',
      reportingMinor: 6_000_000n,
      reportingCurrency: 'VND',
    });
    expect(createForPeriod).toHaveBeenCalledTimes(1);
  });
});
