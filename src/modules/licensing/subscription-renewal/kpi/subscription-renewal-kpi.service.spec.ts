import type { KpiMissedAdjustmentService } from './kpi-missed-adjustment.service';
import { SubscriptionRenewalKpiService } from './subscription-renewal-kpi.service';

describe('SubscriptionRenewalKpiService', () => {
  it('delegates kpi4ForSubscription to KpiMissedAdjustmentService', async () => {
    const summary = { subscriptionId: 'sub-1', totalSeatMonths: 2.5, totalAmountMinor: 1_250_000n, lines: [] };
    const missedAdjustment = { kpi4ForSubscription: jest.fn().mockResolvedValue(summary) };
    const service = new SubscriptionRenewalKpiService(missedAdjustment as unknown as KpiMissedAdjustmentService);

    const result = await service.kpi4ForSubscription('sub-1', ['2027-07-01']);

    expect(result).toEqual(summary);
    expect(missedAdjustment.kpi4ForSubscription).toHaveBeenCalledWith('sub-1', ['2027-07-01'], undefined);
  });
});
