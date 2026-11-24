import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import type { PlanFactsService } from '../../plan/plan-facts.service';
import { SubscriptionPeriodRefusedError } from '../../public/subscription-period.errors';
import type { SubscriptionPoolService } from '../pool/subscription-pool.service';
import type { SubscriptionPeriodRepo } from './subscription-period.repo';
import { SubscriptionPeriodService } from './subscription-period.service';
import type { SubscriptionPricingService } from '../subscription-pricing.service';
import type { SubscriptionRepo } from '../subscription.repo';
import { SubscriptionWindowsService } from '../subscription-windows.service';
import type { SubscriptionRecord } from '../subscription.types';

const TODAY = '2026-11-17';

/** A K2 subscription of the shared pool by the year: the shape the renewal now reads (S20-T2). */
function record(extra: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
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
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

describe('SubscriptionPeriodService: the periods the renewal reads, the shared pool included (S20-T2)', () => {
  const subscriptions = {
    findMany: jest.fn(),
    find: jest.fn(),
    lock: jest.fn(),
    successorsOf: jest.fn(),
    insert: jest.fn(),
  };
  const periodRepo = { listAdjustmentSubjectIds: jest.fn() };
  const plans = { lockShared: jest.fn() };
  const pricing = { read: jest.fn(), priceToday: jest.fn() };
  const organization = { businessToday: jest.fn(), getOrganization: jest.fn() };
  const audit = { record: jest.fn() };
  const pool = { releasePrimary: jest.fn() };
  const STANDARD_DAYS: Record<string, number> = {
    SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY: 7,
    SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL: 30,
    SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL: 7,
  };
  const parameters = { getValuesAt: jest.fn() };
  const service = new SubscriptionPeriodService(
    subscriptions as unknown as SubscriptionRepo,
    periodRepo as unknown as SubscriptionPeriodRepo,
    plans as unknown as PlanFactsService,
    pricing as unknown as SubscriptionPricingService,
    organization as unknown as OrganizationReadApi,
    audit as unknown as AuditApi,
    pool as unknown as SubscriptionPoolService,
    new SubscriptionWindowsService(parameters as unknown as OperatingParametersApi),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    subscriptions.successorsOf.mockResolvedValue(new Map());
    organization.businessToday.mockResolvedValue(TODAY);
    parameters.getValuesAt.mockImplementation((key: string, instants: Date[]) =>
      Promise.resolve(instants.map(() => STANDARD_DAYS[key])),
    );
  });

  it('returns the facts of a shared-pool subscription with no owner department, not leaving it out', async () => {
    subscriptions.findMany.mockResolvedValue([record()]);

    const [facts] = await service.facts(['sub-1']);

    expect(facts).toMatchObject({
      subscriptionId: 'sub-1',
      responsibleItAdminEmployeeId: 'emp-1',
      provisioningType: 'K2',
      commitmentTermMonths: 12,
      vendorMinimumSeats: 5,
      isPrimaryForPlan: true,
    });
  });

  it('reads the point of adjustment of a plan by the year from its deadline to cancel (30 days before; red alert 7 days before)', async () => {
    subscriptions.findMany.mockResolvedValue([record()]);

    const [facts] = await service.facts(['sub-1']);

    expect(facts.adjustment).toEqual({
      kind: 'NOTICE_DEADLINE',
      deadline: '2026-12-01',
      point: '2026-11-01',
      end: '2027-01-01',
      redAlertOn: '2026-11-24',
      commitment: 'ANNUAL',
    });
  });

  it('counts the point and the red alert with the days the parameters held when the period began, read once for all the periods (S20-T9b, QĐ-106h)', async () => {
    subscriptions.findMany.mockResolvedValue([record(), record({ id: 'sub-2', startDate: '2026-03-01' })]);
    parameters.getValuesAt.mockImplementation((key: string, instants: Date[]) =>
      Promise.resolve(
        instants.map((instant) =>
          instant.toISOString().startsWith('2026-03')
            ? { ...STANDARD_DAYS, SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL: 45, SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL: 10 }[key]
            : STANDARD_DAYS[key],
        ),
      ),
    );

    const facts = await service.facts(['sub-1', 'sub-2']);

    expect(parameters.getValuesAt).toHaveBeenCalledTimes(3);
    expect(parameters.getValuesAt).toHaveBeenCalledWith(
      'SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL',
      [new Date('2026-01-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z')],
      undefined,
    );
    expect(facts[0].adjustment).toMatchObject({ point: '2026-11-01', redAlertOn: '2026-11-24' });
    expect(facts[1].adjustment).toMatchObject({ point: '2026-10-17', redAlertOn: '2026-11-21' });
  });

  it('reads the point of a plan by the month from the next payment day today (7 days before), with no red alert', async () => {
    subscriptions.findMany.mockResolvedValue([
      record({
        billingCycle: 'MONTHLY',
        commitmentTermMonths: 1,
        noticeDeadline: null,
        renewalDate: '2026-10-25',
        autoRenew: true,
      }),
    ]);

    const [facts] = await service.facts(['sub-1']);

    expect(facts.adjustment).toEqual({
      kind: 'PAYMENT_DATE',
      deadline: '2026-11-25',
      point: '2026-11-18',
      end: '2026-11-25',
      redAlertOn: null,
      commitment: 'MONTHLY',
    });
  });

  it('has no adjustment when no date gives a point (a plan by the year that renews itself with no deadline, no days of notice, no renewal day)', async () => {
    subscriptions.findMany.mockResolvedValue([
      record({ noticeDeadline: null, noticePeriodDays: null, renewalDate: null, endDate: null }),
    ]);

    const [facts] = await service.facts(['sub-1']);

    expect(facts.adjustment).toBeNull();
  });

  it('has no adjustment for a purchase made once', async () => {
    subscriptions.findMany.mockResolvedValue([
      record({ kind: 'PERPETUAL', commitmentTermMonths: null, billingCycle: null, noticeDeadline: null }),
    ]);

    const [facts] = await service.facts(['sub-1']);

    expect(facts.adjustment).toBeNull();
  });

  it('keeps the periods of every subscription', async () => {
    subscriptions.findMany.mockResolvedValue([record({})]);
    subscriptions.successorsOf.mockResolvedValue(new Map([['sub-1', 'sub-2']]));

    const [facts] = await service.facts(['sub-1']);

    expect(facts).toMatchObject({ renewedById: 'sub-2' });
  });

  it('lists the K2 terms that run a period for the adjustment, at most 500, none that a later period continues', async () => {
    periodRepo.listAdjustmentSubjectIds.mockResolvedValue(['sub-1', 'sub-2']);
    subscriptions.findMany.mockResolvedValue([record(), record({ id: 'sub-2' })]);
    subscriptions.successorsOf.mockResolvedValue(new Map([['sub-2', 'sub-3']]));

    const subjects = await service.adjustmentSubjects();

    expect(periodRepo.listAdjustmentSubjectIds).toHaveBeenCalledWith(500);
    expect(subscriptions.findMany).toHaveBeenCalledWith(['sub-1', 'sub-2']);
    expect(subjects.map((period) => period.subscriptionId)).toEqual(['sub-1']);
  });

  describe('recordNext of a shared-pool subscription', () => {
    const actor = { employeeId: 'emp-1' } as unknown as AuthenticatedPrincipal;
    const tx = {} as DbTx;
    const input = {
      previousSubscriptionId: 'sub-1',
      purchasedQuantity: 10,
      unitPrice: { amount: '100000', currency: 'VND' },
      billingCycle: 'ANNUAL' as const,
      startDate: '2027-01-01',
      renewalDate: '2028-01-01',
      noticeDeadline: '2027-12-01',
      autoRenew: true,
      allowsMidTermReduction: false,
    };

    it('records the next period with no owner department instead of refusing NO_OWNER_DEPARTMENT', async () => {
      const previous = record();
      subscriptions.find.mockResolvedValue(previous);
      plans.lockShared.mockResolvedValue({
        applicationKind: 'SAAS',
        provisioningType: 'K2',
        applicationStatus: 'ACTIVE',
      });
      pricing.read.mockResolvedValue({ amountMinor: 100000n, currency: 'VND' });
      pricing.priceToday.mockResolvedValue({ unitPrice: previous.unitPrice, priceSnapshot: null });
      organization.getOrganization.mockResolvedValue({ id: 'org-1' });
      subscriptions.insert.mockImplementation((_tx: DbTx, created: Partial<SubscriptionRecord>) =>
        Promise.resolve(record({ ...created, id: 'sub-2' })),
      );

      const next = await service.recordNext(tx, actor, input);

      expect(subscriptions.insert).toHaveBeenCalledWith(tx, expect.anything());
      expect(next).toMatchObject({ subscriptionId: 'sub-2', renewedFromId: 'sub-1' });
    });

    it('reads the price where the caller says it sits in its body, so a money error points at that field of the renewal (FIX-E-R2)', async () => {
      const previous = record();
      subscriptions.find.mockResolvedValue(previous);
      plans.lockShared.mockResolvedValue({
        applicationKind: 'SAAS',
        provisioningType: 'K2',
        applicationStatus: 'ACTIVE',
      });
      pricing.read.mockRejectedValue(new Error('stop after the price'));

      await expect(service.recordNext(tx, actor, { ...input, unitPricePath: 'nextPeriod.unitPrice' })).rejects.toThrow(
        'stop after the price',
      );

      expect(pricing.read).toHaveBeenCalledWith(input.unitPrice, 'nextPeriod.unitPrice');
    });

    it('still refuses a period that is already continued', async () => {
      subscriptions.find.mockResolvedValue(record());
      subscriptions.successorsOf.mockResolvedValue(new Map([['sub-1', 'sub-2']]));

      await expect(service.recordNext(tx, actor, input)).rejects.toThrow(SubscriptionPeriodRefusedError);
    });
  });
});
