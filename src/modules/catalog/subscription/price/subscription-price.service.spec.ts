import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { SubscriptionRepo } from '../subscription.repo';
import { SubscriptionPriceService } from './subscription-price.service';

describe('BR-MF1-06 shared catalog price facts', () => {
  it.each([
    ['TERM', 'RECURRING'],
    ['PERPETUAL', 'ONE_TIME'],
  ])('maps %s once for API and worker price readers', async (subscriptionKind, kind) => {
    const findPricedOfPlan = jest.fn().mockResolvedValue({
      subscriptionKind,
      unitPriceMinor: 100n,
      currency: 'VND',
      reporting: { amountMinor: 4n, currency: 'USD' },
      billingCycle: 'MONTHLY',
      allowsMidTermReduction: false,
    });
    const service = new SubscriptionPriceService({ findPricedOfPlan } as unknown as SubscriptionRepo);
    const tx = {} as DbTx;
    expect(await service.priceOfPlan('plan', tx)).toEqual({
      kind,
      unitPrice: { amountMinor: 100n, currency: 'VND' },
      reportingUnitPrice: { amountMinor: 4n, currency: 'USD' },
      billingCycle: 'MONTHLY',
      allowsMidTermReduction: false,
    });
    expect(findPricedOfPlan).toHaveBeenCalledWith('plan', tx, undefined);
  });

  it('keeps an absent price absent', async () => {
    const service = new SubscriptionPriceService({
      findPricedOfPlan: jest.fn().mockResolvedValue(null),
    } as unknown as SubscriptionRepo);
    expect(await service.priceOfPlan('plan')).toBeNull();
  });
});
