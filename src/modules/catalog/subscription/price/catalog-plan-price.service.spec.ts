import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { SubscriptionRepo } from '../subscription.repo';
import { CatalogPlanPriceService } from './catalog-plan-price.service';
import type { PlanReferencePriceRepo } from './plan-reference-price.repo';

describe('CatalogPlanPriceService', () => {
  it('returns subscription price first and falls back to plan reference price', async () => {
    const tx = {} as DbTx;
    const subService = new CatalogPlanPriceService(
      {
        findPricedOfPlan: jest.fn().mockResolvedValue({
          subscriptionKind: 'TERM',
          provisioningType: 'K2',
          referenceCommitmentMonths: 12,
          unitPriceMinor: 6_000_000n,
          monthlyUnitPriceMinor: 500_000n,
          currency: 'VND',
          reporting: { amountMinor: 6_000_000n, currency: 'VND' },
          billingCycle: 'ANNUAL',
          allowsMidTermReduction: false,
        }),
      } as unknown as SubscriptionRepo,
      { findOfPlan: jest.fn() } as unknown as PlanReferencePriceRepo,
    );

    expect(await subService.priceOfPlan('plan-1', tx, '2027-01-01')).toMatchObject({
      kind: 'RECURRING',
      monthlyPriceMinor: 500_000n,
      source: 'SUBSCRIPTION',
    });

    const refService = new CatalogPlanPriceService(
      { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
      {
        findOfPlan: jest.fn().mockResolvedValue({
          provisioningType: 'K1',
          amountMinor: 400_000n,
          currency: 'VND',
          referenceCommitmentMonths: 1,
        }),
      } as unknown as PlanReferencePriceRepo,
    );

    expect(await refService.priceOfPlan('plan-k1', tx)).toMatchObject({
      kind: 'RECURRING',
      provisioningType: 'K1',
      monthlyPriceMinor: 400_000n,
      source: 'PLAN_REFERENCE',
    });
  });
});
