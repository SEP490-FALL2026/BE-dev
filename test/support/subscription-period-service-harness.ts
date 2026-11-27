import type { DbTx } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../src/modules/audit/public/audit.api';
import type { OperatingParametersApi } from '../../src/modules/operating-parameters/public/operating-parameters.api';
import type { PlanFactsService } from '../../src/modules/catalog/plan/plan-facts.service';
import type { SubscriptionPoolService } from '../../src/modules/catalog/subscription/pool/subscription-pool.service';
import type { SubscriptionPeriodRepo } from '../../src/modules/catalog/subscription/period/subscription-period.repo';
import { SubscriptionPeriodService } from '../../src/modules/catalog/subscription/period/subscription-period.service';
import type { SubscriptionPricingService } from '../../src/modules/catalog/subscription/subscription-pricing.service';
import type { SubscriptionRepo } from '../../src/modules/catalog/subscription/subscription.repo';
import { SubscriptionWindowsService } from '../../src/modules/catalog/subscription/subscription-windows.service';
import type { SubscriptionPeriodLinesService } from '../../src/modules/catalog/subscription-line/subscription-period-lines.service';
import type { SubscriptionRecord } from '../../src/modules/catalog/subscription/subscription.types';

export const TODAY = '2026-11-17';
export const RATE_ONE = 10n ** 10n;

/** A K2 subscription of the shared pool by the year: the shape the renewal now reads (S20-T2). */
export function record(extra: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub-1',
    planId: 'plan-1',
    planName: 'Team',
    planPricingModel: 'PER_SEAT',
    planProvisioningType: 'K2',
    planHasAdminConsole: false,
    applicationId: 'app-1',
    applicationName: 'Slack',
    applicationLogoUrl: null,
    applicationKind: 'SAAS',
    vendor: { id: 'vendor-1', name: 'Vendor' },
    kind: 'TERM',
    status: 'ACTIVE',
    purchasedQuantity: 10,
    unitPrice: { amountMinor: 100000n, currency: 'VND', recordedOn: '2026-01-01' },
    monthlyUnitPriceMinor: 8333n,
    priceSnapshot: null,
    originalPrice: null,
    billingCycle: 'ANNUAL',
    commitmentTermMonths: 12,
    startDate: '2026-01-01',
    endDate: null,
    renewalDate: '2027-01-01',
    noticeDeadline: '2026-12-01',
    noticePeriodDays: null,
    autoRenew: true,
    allowsMidTermReduction: false,
    responsibleItAdminEmployeeId: 'emp-1',
    vendorMinimumSeats: 5,
    isPrimaryForPlan: true,
    renewedFromId: null,
    workspace: null,
    seatCounting: 'FIXED',
    minimumSeatsTotal: null,
    invoicedLater: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

export const STANDARD_DAYS: Record<string, number> = {
  SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY: 7,
  SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL: 30,
  SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL: 7,
};

/**
 * The service of the subscription periods over mocked collaborators, shared by the unit specs that read the periods the renewal reads
 * and the ones that record the next one. Call `reset` in a `beforeEach`.
 */
export function periodServiceHarness() {
  const subscriptions = {
    findMany: jest.fn(),
    find: jest.fn(),
    lock: jest.fn(),
    successorsOf: jest.fn(),
    insert: jest.fn(),
  };
  const periodRepo = { listAdjustmentSubjectIds: jest.fn() };
  const plans = { lockShared: jest.fn() };
  const pricing = {
    read: jest.fn(),
    priceToday: jest.fn(),
    businessToday: jest.fn(),
    getOrganization: jest.fn(),
  };
  const organization = { businessToday: pricing.businessToday, getOrganization: pricing.getOrganization };
  const audit = { record: jest.fn() };
  const pool = { releasePrimary: jest.fn() };
  const parameters = { getValuesAt: jest.fn() };
  const periodLines = {
    linesOf: jest.fn(),
    closeLines: jest.fn(),
    createRenewedLines: jest.fn(),
  };
  const service = new SubscriptionPeriodService(
    subscriptions as unknown as SubscriptionRepo,
    periodRepo as unknown as SubscriptionPeriodRepo,
    plans as unknown as PlanFactsService,
    pricing as unknown as SubscriptionPricingService,
    audit as unknown as AuditApi,
    pool as unknown as SubscriptionPoolService,
    new SubscriptionWindowsService(parameters as unknown as OperatingParametersApi),
    periodLines as unknown as SubscriptionPeriodLinesService,
  );
  const reset = (): void => {
    jest.resetAllMocks();
    subscriptions.successorsOf.mockResolvedValue(new Map());
    periodLines.linesOf.mockResolvedValue([]);
    organization.businessToday.mockResolvedValue(TODAY);
    parameters.getValuesAt.mockImplementation((key: string, instants: Date[]) =>
      Promise.resolve(instants.map(() => STANDARD_DAYS[key])),
    );
  };

  return {
    subscriptions,
    periodRepo,
    plans,
    pricing,
    organization,
    audit,
    pool,
    parameters,
    periodLines,
    service,
    reset,
    actor: { employeeId: 'emp-1' } as unknown as AuthenticatedPrincipal,
    tx: {} as DbTx,
    nextPeriodInput: {
      previousSubscriptionId: 'sub-1',
      purchasedQuantity: 10,
      unitPrice: { amount: '100000', currency: 'VND' },
      billingCycle: 'ANNUAL' as const,
      startDate: '2027-01-01',
      renewalDate: '2028-01-01',
      noticeDeadline: '2027-12-01',
      autoRenew: true,
      allowsMidTermReduction: false,
    },
  };
}
