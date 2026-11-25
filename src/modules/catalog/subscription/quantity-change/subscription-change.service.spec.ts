import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LockedPlan } from '../../plan/plan-facts.service';
import { SubscriptionChangeService } from '../subscription-change.service';
import {
  SubscriptionMidTermReductionNotAllowedError,
  SubscriptionQuantityReasonRequiredError,
  SubscriptionUpdateEmptyError,
  SubscriptionVersionRequiredError,
} from '../subscription.errors';
import type { SubscriptionRecord, SubscriptionView } from '../subscription.types';

const actor = {
  accountId: 'acc-1',
  employeeId: 'emp-1',
  roles: ['IT_ADMIN'],
  email: 'it@example.com',
  departmentId: 'dept-1',
} as unknown as AuthenticatedPrincipal;

const baseDate = new Date('2026-11-10T00:00:00.000Z');

const makeRecord = (overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  id: 'sub-1',
  planId: 'plan-1',
  planName: 'Slack Pro',
  planPricingModel: 'PER_SEAT',
  planProvisioningType: 'K2',
  planHasAdminConsole: true,
  applicationId: 'app-1',
  applicationName: 'Slack',
  applicationLogoUrl: null,
  applicationKind: 'SAAS',
  vendor: { id: 'ven-1', name: 'Slack' },
  kind: 'TERM',
  status: 'ACTIVE',
  purchasedQuantity: 10,
  unitPrice: { amountMinor: 200_000n, currency: 'VND', recordedOn: '2026-01-01' },
  monthlyUnitPriceMinor: 16_667n,
  priceSnapshot: {
    rate: 1n,
    rateDate: '2026-01-01',
    rateSource: 'SAME_CURRENCY',
    reportingMinor: 200_000n,
    reportingCurrency: 'VND',
    exchangeRateId: null,
  },
  originalPrice: null,
  billingCycle: 'ANNUAL',
  commitmentTermMonths: 12,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  renewalDate: '2026-12-31',
  noticeDeadline: null,
  noticePeriodDays: 30,
  autoRenew: true,
  allowsMidTermReduction: false,
  responsibleItAdminEmployeeId: 'emp-1',
  vendorMinimumSeats: null,
  isPrimaryForPlan: true,
  renewedFromId: null,
  workspace: null,
  seatCounting: 'FIXED',
  minimumSeatsTotal: null,
  invoicedLater: false,
  createdAt: baseDate,
  updatedAt: baseDate,
  ...overrides,
});

const lockedPlan: LockedPlan = {
  id: 'plan-1',
  name: 'Slack Pro',
  applicationId: 'app-1',
  applicationName: 'Slack',
  applicationKind: 'SAAS',
  applicationStatus: 'APPROVED',
  pricingModel: 'PER_SEAT',
  provisioningType: 'K2',
  keyBinding: null,
  sharingPolicy: null,
  hasAdminConsole: true,
  referenceCommitmentMonths: null,
};

interface RecordedAuditEvent {
  action: string;
  after: Record<string, unknown>;
}

function makeSut(stored: SubscriptionRecord = makeRecord()) {
  const tx = {} as DbTx;
  const subscriptions = {
    lock: jest.fn().mockResolvedValue(stored),
    find: jest.fn().mockResolvedValue(stored),
    lockPrimaryCandidates: jest.fn().mockResolvedValue(undefined),
    update: jest.fn((_tx: DbTx, _id: string, state: Partial<SubscriptionRecord>) =>
      Promise.resolve({
        ...stored,
        ...state,
        updatedAt: new Date('2026-11-11T00:00:00.000Z'),
      }),
    ),
  };
  const plans = {
    lockShared: jest.fn().mockResolvedValue(lockedPlan),
    lockExclusive: jest.fn().mockResolvedValue(lockedPlan),
  };
  const pricing = {
    read: jest.fn(),
    readOriginal: jest.fn(),
    priceToday: jest.fn(),
  };
  const views = {
    viewAll: jest.fn((records: SubscriptionRecord[]) => Promise.resolve(records as unknown as SubscriptionView[])),
  };
  const recordAudit = jest.fn<Promise<void>, [DbTx, RecordedAuditEvent]>(() => Promise.resolve());
  const audit = { record: recordAudit };
  const runner = {
    run: jest.fn((fn: (t: DbTx) => Promise<SubscriptionRecord>) => fn(tx)),
  };
  const guard = {
    requireOrganizationId: jest.fn().mockResolvedValue('org-1'),
    requireResponsible: jest.fn().mockResolvedValue(undefined),
    assertNotBelowOccupied: jest.fn().mockResolvedValue(undefined),
    judgePool: jest.fn().mockResolvedValue(undefined),
    tellSeatIncrease: jest.fn().mockResolvedValue(undefined),
    tellSeatReduction: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SubscriptionChangeService(
    subscriptions as never,
    plans as never,
    pricing as never,
    views as never,
    audit as never,
    runner as never,
    guard as never,
  );

  return { service, subscriptions, plans, recordAudit, runner, guard };
}

describe('SubscriptionChangeService', () => {
  it('refuses an update that only sends quantityChangeReason with SubscriptionUpdateEmptyError', async () => {
    const { service, runner } = makeSut();

    await expect(service.update(actor, 'sub-1', { quantityChangeReason: 'Only reason' })).rejects.toThrow(
      SubscriptionUpdateEmptyError,
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('refuses changing purchasedQuantity without expectedUpdatedAt before entering a transaction', async () => {
    const { service, runner } = makeSut();

    await expect(service.update(actor, 'sub-1', { purchasedQuantity: 12 })).rejects.toThrow(
      SubscriptionVersionRequiredError,
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('blocks reducing a 12-month active K2 subscription using stored flags even when PATCH tries to change them', async () => {
    const { service, guard } = makeSut();

    await expect(
      service.update(
        actor,
        'sub-1',
        { purchasedQuantity: 8, commitmentTermMonths: 1, allowsMidTermReduction: true },
        baseDate,
      ),
    ).rejects.toThrow(SubscriptionMidTermReductionNotAllowedError);
    expect(guard.assertNotBelowOccupied).not.toHaveBeenCalled();
  });

  it('refuses increasing an active K2 subscription without quantityChangeReason', async () => {
    const { service, recordAudit } = makeSut();

    await expect(service.update(actor, 'sub-1', { purchasedQuantity: 12 }, baseDate)).rejects.toThrow(
      SubscriptionQuantityReasonRequiredError,
    );
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('records quantityChangeReason in the audit after snapshot when increasing an active K2 subscription', async () => {
    const { service, recordAudit } = makeSut();

    await service.update(
      actor,
      'sub-1',
      { purchasedQuantity: 12, quantityChangeReason: 'New engineering hires' },
      baseDate,
    );

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const event = recordAudit.mock.calls[0][1];
    expect(event.action).toBe('SUBSCRIPTION.UPDATED');
    expect(event.after).toMatchObject({ quantity: 12, quantityChangeReason: 'New engineering hires' });
  });

  it('ignores quantityChangeReason and omits it from audit when not increasing purchasedQuantity', async () => {
    const { service, recordAudit } = makeSut();

    await service.update(actor, 'sub-1', { endDate: '2027-01-31', quantityChangeReason: 'Ignored reason' });

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const event = recordAudit.mock.calls[0][1];
    expect(event.after).not.toHaveProperty('quantityChangeReason');
  });

  it('W3-03: reducing purchasedQuantity on active K2 calls tellSeatReduction and not tellSeatIncrease', async () => {
    const { service, guard } = makeSut(makeRecord({ purchasedQuantity: 12, allowsMidTermReduction: true }));

    await service.update(actor, 'sub-1', { purchasedQuantity: 11 }, baseDate);

    expect(guard.tellSeatReduction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscriptionId: 'sub-1',
        from: 12,
        to: 11,
      }),
    );
    expect(guard.tellSeatIncrease).not.toHaveBeenCalled();
  });

  it('W3-03: increasing purchasedQuantity keeps tellSeatIncrease and does not call tellSeatReduction', async () => {
    const { service, guard } = makeSut(makeRecord({ purchasedQuantity: 11 }));

    await service.update(actor, 'sub-1', { purchasedQuantity: 12, quantityChangeReason: 'Growth' }, baseDate);

    expect(guard.tellSeatIncrease).toHaveBeenCalledTimes(1);
    expect(guard.tellSeatReduction).not.toHaveBeenCalled();
  });
});
