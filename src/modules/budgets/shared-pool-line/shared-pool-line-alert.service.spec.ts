import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { LicenseLotCostService } from './license-lot-cost.service';
import { SharedPoolLineAlertService } from './shared-pool-line-alert.service';
import type { SharedPoolLineDetail, SharedPoolLineFactsService } from './shared-pool-line-facts.service';

const makeLine = (extra: Partial<SharedPoolLineDetail> = {}): SharedPoolLineDetail => ({
  subscriptionId: 'sub-1',
  responsibleItAdminEmployeeId: 'it-1',
  paidMinor: 6_000_000n,
  invoicedMinor: 0n,
  allocatedMinor: 4_800_000n,
  withoutCostCenterMinor: 0n,
  idleCostMinor: 1_000_000n,
  idleCostByLabel: { missedAdjustmentMinor: 0n, reducibleMinor: 0n, lockedUntil: {} },
  invoiceVarianceMinor: 0n,
  invoiceVarianceInReviewMinor: 0n,
  deviceLotPurchasesMinor: 0n,
  replacementKeysMinor: 0n,
  unallocatedMinor: 1_000_000n,
  flags: [],
  ratioPercent: '16.67',
  exceedsIdleRatioThreshold: true,
  ...extra,
});

describe('SharedPoolLineAlertService (IDLE_SEAT_COST_RATIO_HIGH, R1)', () => {
  const build = (lines: SharedPoolLineDetail[]) => {
    const facts = {
      linesOfMonth: jest.fn().mockResolvedValue(lines),
    };
    const identity = {
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['it-1'])),
      findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue('super-1'),
    };
    const organizationReads = {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    };
    const notifications = {
      notifyInApp: jest.fn().mockResolvedValue(true),
    };
    const runner = {
      run: jest.fn((fn: (tx: DbTx) => Promise<unknown>) => fn({} as DbTx)),
    };
    const lotCosts = {
      idleAlertsForMonth: jest.fn().mockResolvedValue([]),
    };
    const service = new SharedPoolLineAlertService(
      facts as unknown as SharedPoolLineFactsService,
      identity as unknown as IdentityAccessApi,
      organizationReads as unknown as OrganizationReadApi,
      notifications as unknown as NotificationsApi,
      runner as unknown as TransactionRunner,
      lotCosts as unknown as LicenseLotCostService,
    );

    return { service, identity, notifications, runner };
  };

  it('sends IDLE_SEAT_COST_RATIO_HIGH to usable responsible IT Admin with monthly eventKey', async () => {
    const { service, notifications } = build([
      makeLine({ subscriptionId: 'sub-alert', exceedsIdleRatioThreshold: true, ratioPercent: '10.75' }),
      makeLine({ subscriptionId: 'sub-ok', exceedsIdleRatioThreshold: false, ratioPercent: '9.14' }),
    ]);

    const sent = await service.warnIdleRatioForMonth('2027-03-01');

    expect(sent).toBe(1);
    expect(notifications.notifyInApp).toHaveBeenCalledTimes(1);
    expect(notifications.notifyInApp).toHaveBeenCalledWith(expect.anything(), {
      organizationId: 'org-1',
      recipientEmployeeId: 'it-1',
      code: 'IDLE_SEAT_COST_RATIO_HIGH',
      subject: { type: 'SUBSCRIPTION', id: 'sub-alert' },
      params: { subscriptionId: 'sub-alert', month: '2027-03', ratioPercent: '10.75' },
      eventKey: 'IDLE_SEAT_COST_RATIO_HIGH:sub-alert:2027-03',
    });
  });

  it('falls back to usable Super Admin (R1) when responsible IT Admin is locked or unset', async () => {
    const { service, identity, notifications } = build([
      makeLine({ subscriptionId: 'sub-locked', responsibleItAdminEmployeeId: 'it-locked', ratioPercent: '16.67' }),
      makeLine({ subscriptionId: 'sub-none', responsibleItAdminEmployeeId: null, ratioPercent: '12.50' }),
    ]);
    identity.findUsableItAdminEmployeeIds.mockResolvedValue(new Set());

    const sent = await service.warnIdleRatioForMonth('2027-02-01');

    expect(sent).toBe(2);
    expect(identity.findUsableSuperAdminEmployeeId).toHaveBeenCalledTimes(1);
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        recipientEmployeeId: 'super-1',
        eventKey: 'IDLE_SEAT_COST_RATIO_HIGH:sub-locked:2027-02',
      }),
    );
    expect(notifications.notifyInApp).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        recipientEmployeeId: 'super-1',
        eventKey: 'IDLE_SEAT_COST_RATIO_HIGH:sub-none:2027-02',
      }),
    );
  });

  it('skips sending when no usable IT Admin or Super Admin exists and preserves idempotent false returns', async () => {
    const { service, identity, notifications } = build([makeLine({ responsibleItAdminEmployeeId: 'it-locked' })]);
    identity.findUsableItAdminEmployeeIds.mockResolvedValue(new Set());
    identity.findUsableSuperAdminEmployeeId.mockResolvedValue(null);

    expect(await service.warnIdleRatioForMonth('2027-02-01')).toBe(0);
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });
});
