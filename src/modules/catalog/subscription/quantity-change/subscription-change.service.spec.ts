import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { LockedPlan } from '../../plan/plan-facts.service';
import { SubscriptionChangeService } from '../subscription-change.service';
import { SubscriptionPrimaryRetiredError, SubscriptionUpdateEmptyError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import { SEAT_LEDGER_ROUTES } from '../subscription.policy';
import type { SubscriptionRecord, SubscriptionView } from '../subscription.types';
import type { UpdateSubscriptionInput } from '../subscription.service';

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

    const err = await service.update(actor, 'sub-1', { quantityChangeReason: 'Only reason' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionUpdateEmptyError);
    expect((toSubscriptionApiException(err) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
      code: 'SUBSCRIPTION.UPDATE_EMPTY',
    });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it.each<[string, UpdateSubscriptionInput, Date | undefined]>([
    ['without the version', { purchasedQuantity: 12 }, undefined],
    [
      'reducing a 12-month subscription whose flags the body tries to change',
      { purchasedQuantity: 8, commitmentTermMonths: 1, allowsMidTermReduction: true },
      baseDate,
    ],
    ['increasing, without a reason', { purchasedQuantity: 12 }, baseDate],
    ['increasing, with a reason', { purchasedQuantity: 12, quantityChangeReason: 'New engineering hires' }, baseDate],
    ['reducing by one', { purchasedQuantity: 11 }, baseDate],
  ])(
    'refuses an edit of the seats (%s) with the routes that change them, before a transaction opens and with nothing written (W3-27)',
    async (_name, input, version) => {
      const { service, runner, recordAudit, guard } = makeSut();

      const err = await service.update(actor, 'sub-1', input, version).catch((e: unknown) => e);
      expect(err).toMatchObject({
        name: 'SubscriptionSeatCountViaLedgerError',
        routes: SEAT_LEDGER_ROUTES,
      });
      expect((toSubscriptionApiException(err) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
        code: 'SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER',
      });
      expect(runner.run).not.toHaveBeenCalled();
      expect(recordAudit).not.toHaveBeenCalled();
      expect(guard.tellSeatIncrease).not.toHaveBeenCalled();
      expect(guard.tellSeatReduction).not.toHaveBeenCalled();
    },
  );

  it('refuses to mark a subscription as the one that prices its plan, and lets the mark be taken off', async () => {
    const { service, runner } = makeSut();

    const err = await service.update(actor, 'sub-1', { isPrimaryForPlan: true }, baseDate).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionPrimaryRetiredError);
    expect((toSubscriptionApiException(err) as { getResponse?: () => unknown }).getResponse?.()).toMatchObject({
      code: 'SUBSCRIPTION.PRIMARY_RETIRED',
    });
    expect(runner.run).not.toHaveBeenCalled();
    await expect(service.update(actor, 'sub-1', { isPrimaryForPlan: false }, baseDate)).resolves.toBeDefined();
  });

  it('ignores quantityChangeReason and omits it from audit when not increasing purchasedQuantity', async () => {
    const { service, recordAudit } = makeSut();

    await service.update(actor, 'sub-1', { endDate: '2027-01-31', quantityChangeReason: 'Ignored reason' });

    expect(recordAudit).toHaveBeenCalledTimes(1);
    const event = recordAudit.mock.calls[0][1];
    expect(event.after).not.toHaveProperty('quantityChangeReason');
  });
});
