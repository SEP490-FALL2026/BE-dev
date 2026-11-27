import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { SubscriptionRecord } from '../subscription.types';
import {
  periodServiceHarness,
  RATE_ONE,
  record,
} from '../../../../../test/support/subscription-period-service-harness';

describe('SubscriptionPeriodService: recording the next period of a multi-line period and closing its lines', () => {
  const h = periodServiceHarness();
  const { subscriptions, plans, pricing, organization, audit, periodLines, service, actor, tx } = h;
  const input = h.nextPeriodInput;

  beforeEach(h.reset);

  it('renews multi-line period: closes old lines RENEWED on startDate-1, creates only quantity > 0 lines, opens ledger, and copies workspace/minTotal', async () => {
    const prev = record({
      workspace: { id: 'ws-1', name: 'Slack WS' },
      minimumSeatsTotal: 15,
      isPrimaryForPlan: false,
    });
    subscriptions.find.mockResolvedValue(prev);
    plans.lockShared.mockResolvedValue({
      applicationKind: 'SAAS',
      provisioningType: 'K2',
      applicationStatus: 'ACTIVE',
    });
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    const oldLines = [
      {
        id: 'line-std',
        subscriptionId: 'sub-1',
        workspaceId: 'ws-1',
        planId: 'plan-1',
        monthlyUnitPriceMinor: 50000n,
        minimumSeats: 5,
        closedReason: null,
      },
      {
        id: 'line-prm',
        subscriptionId: 'sub-1',
        workspaceId: 'ws-1',
        planId: 'plan-2',
        monthlyUnitPriceMinor: 100000n,
        minimumSeats: null,
        closedReason: null,
      },
    ];
    periodLines.linesOf.mockResolvedValue(oldLines);
    pricing.priceToday.mockImplementation((_tx: DbTx, money: { amountMinor: bigint; currency: string } | null) =>
      Promise.resolve(
        money
          ? {
              unitPrice: { ...money, recordedOn: '2027-01-01' },
              priceSnapshot: { rate: RATE_ONE, reportingMinor: money.amountMinor, rateSource: 'SAME_CURRENCY' },
            }
          : { unitPrice: null, priceSnapshot: null },
      ),
    );
    subscriptions.insert.mockImplementation((_tx: DbTx, created: Partial<SubscriptionRecord>) =>
      Promise.resolve(record({ ...created, id: 'sub-2', workspace: { id: 'ws-1', name: 'Slack WS' } })),
    );

    await service.recordNext(
      tx,
      { systemCorrelationId: 'auto-sub-1' },
      {
        ...input,
        renewalId: 'ren-1',
        autoRecorded: true,
        lines: [
          { previousLineId: 'line-std', quantity: 15 },
          { previousLineId: 'line-prm', quantity: 0 },
        ],
      },
    );

    expect(periodLines.closeLines).toHaveBeenCalledWith(tx, 'sub-1', '2026-12-31', 'RENEWED');
    expect(subscriptions.insert).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        purchasedQuantity: 15,
        workspaceId: 'ws-1',
        minimumSeatsTotal: 15,
        seatCounting: 'FIXED',
        invoicedLater: false,
        // 12 months of the monthly price of the first line, recorded with the snapshot of the same currency.
        unitPrice: { amountMinor: 600_000n, currency: 'VND', recordedOn: '2027-01-01' },
        priceSnapshot: expect.objectContaining({ rate: RATE_ONE, reportingMinor: 600_000n }) as unknown,
      }),
    );
    expect(periodLines.createRenewedLines).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        nextSubscriptionId: 'sub-2',
        workspaceId: 'ws-1',
        startDate: '2027-01-01',
        renewalId: 'ren-1',
        autoRecorded: true,
        recordedByEmployeeId: null,
        resolved: [
          { oldLine: oldLines[0], quantity: 15, monthlyUnitPriceMinor: 50000n },
          { oldLine: oldLines[1], quantity: 0, monthlyUnitPriceMinor: 100000n },
        ],
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actorKind: 'SYSTEM', actorAppUserId: null, correlationId: 'auto-sub-1' }),
    );
  });

  describe('the application of every plan of the lines (a retired one refuses the renewal)', () => {
    const twoLines = [
      { id: 'line-b', subscriptionId: 'sub-1', workspaceId: 'ws-1', planId: 'plan-9', closedReason: null },
      { id: 'line-a', subscriptionId: 'sub-1', workspaceId: 'ws-1', planId: 'plan-2', closedReason: null },
    ];
    const lockOf = (retired: readonly string[]) => (_tx: DbTx, planId: string) =>
      Promise.resolve({
        id: planId,
        applicationKind: 'SAAS',
        provisioningType: 'K2',
        applicationStatus: retired.includes(planId) ? 'RETIRED' : 'ACTIVE',
      });

    it('refuses with APPLICATION_RETIRED naming the plan of a second line whose application is retired, and writes nothing', async () => {
      subscriptions.find.mockResolvedValue(record({ planId: 'plan-1' }));
      periodLines.linesOf.mockResolvedValue(twoLines);
      plans.lockShared.mockImplementation(lockOf(['plan-9']));

      await expect(
        service.recordNext(tx, actor, { ...input, lines: [{ previousLineId: 'line-a', quantity: 1 }] }),
      ).rejects.toMatchObject({ reason: 'APPLICATION_RETIRED', planId: 'plan-9' });
      expect(subscriptions.insert).not.toHaveBeenCalled();
      expect(periodLines.closeLines).not.toHaveBeenCalled();
    });

    it('locks the plans of the period and of its lines in id order and stops at the first whose application is retired', async () => {
      subscriptions.find.mockResolvedValue(record({ planId: 'plan-5' }));
      periodLines.linesOf.mockResolvedValue(twoLines);
      plans.lockShared.mockImplementation(lockOf(['plan-2']));

      await expect(
        service.recordNext(tx, actor, { ...input, lines: [{ previousLineId: 'line-a', quantity: 1 }] }),
      ).rejects.toMatchObject({ reason: 'APPLICATION_RETIRED', planId: 'plan-2' });
      expect(plans.lockShared.mock.calls.map((call: unknown[]) => call[1])).toEqual(['plan-2']);
    });
  });

  it('closeExpiredLines delegates closing live lines as ENDED on endDate', async () => {
    await service.closeExpiredLines(tx, 'sub-1', '2026-12-31');

    expect(periodLines.closeLines).toHaveBeenCalledWith(tx, 'sub-1', '2026-12-31', 'ENDED');
  });
});
