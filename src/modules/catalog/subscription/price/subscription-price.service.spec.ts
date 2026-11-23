import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { SubscriptionRepo } from '../subscription.repo';
import type { PlanReferencePriceRepo } from './plan-reference-price.repo';
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
    const service = new SubscriptionPriceService(
      { findPricedOfPlan } as unknown as SubscriptionRepo,
      {} as PlanReferencePriceRepo,
    );
    const tx = {} as DbTx;
    expect(await service.priceOfPlan('plan', tx)).toEqual({
      kind,
      unitPrice: { amountMinor: 100n, currency: 'VND' },
      reportingUnitPrice: { amountMinor: 4n, currency: 'USD' },
      billingCycle: 'MONTHLY',
      allowsMidTermReduction: false,
      source: 'SUBSCRIPTION',
    });
    expect(findPricedOfPlan).toHaveBeenCalledWith('plan', tx, undefined);
  });

  it('keeps an absent price absent when the plan has no reference price either', async () => {
    const service = new SubscriptionPriceService(
      { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
      { findOfPlan: jest.fn().mockResolvedValue(null) } as unknown as PlanReferencePriceRepo,
    );
    expect(await service.priceOfPlan('plan')).toBeNull();
  });

  describe('QĐ-113a: the reference price of the plan comes after the price of a subscription', () => {
    it('is not read when a subscription prices the plan', async () => {
      const findPlanReferencePrice = jest.fn();
      const service = new SubscriptionPriceService(
        {
          findPricedOfPlan: jest.fn().mockResolvedValue({
            subscriptionKind: 'TERM',
            unitPriceMinor: 700n,
            currency: 'VND',
            reporting: null,
            billingCycle: 'ANNUAL',
            allowsMidTermReduction: true,
          }),
        } as unknown as SubscriptionRepo,
        { findOfPlan: findPlanReferencePrice } as unknown as PlanReferencePriceRepo,
      );

      const price = await service.priceOfPlan('plan');

      expect(price?.source).toBe('SUBSCRIPTION');
      expect(price?.unitPrice).toEqual({ amountMinor: 700n, currency: 'VND' });
      expect(findPlanReferencePrice).not.toHaveBeenCalled();
    });

    it('prices a K1 or K2 plan with no priced subscription by the month', async () => {
      const tx = {} as DbTx;
      const findPlanReferencePrice = jest
        .fn()
        .mockResolvedValue({ provisioningType: 'K2', amountMinor: 500_000n, currency: 'VND' });
      const service = new SubscriptionPriceService(
        { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
        { findOfPlan: findPlanReferencePrice } as unknown as PlanReferencePriceRepo,
      );

      expect(await service.priceOfPlan('plan', tx)).toEqual({
        kind: 'RECURRING',
        unitPrice: { amountMinor: 500_000n, currency: 'VND' },
        reportingUnitPrice: { amountMinor: 500_000n, currency: 'VND' },
        billingCycle: 'MONTHLY',
        allowsMidTermReduction: false,
        source: 'PLAN_REFERENCE',
      });
      expect(findPlanReferencePrice).toHaveBeenCalledWith('plan', tx);
    });

    it('is not read by the price of a subscription alone, which stays null for a plan only the reference price prices', async () => {
      const findPlanReferencePrice = jest
        .fn()
        .mockResolvedValue({ provisioningType: 'K2', amountMinor: 500_000n, currency: 'VND' });
      const service = new SubscriptionPriceService(
        { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
        { findOfPlan: findPlanReferencePrice } as unknown as PlanReferencePriceRepo,
      );

      expect(await service.subscriptionPriceOfPlan('plan')).toBeNull();
      expect(findPlanReferencePrice).not.toHaveBeenCalled();
    });

    it('prices a K4 plan with no priced subscription by its one purchase', async () => {
      const service = new SubscriptionPriceService(
        { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
        {
          findOfPlan: jest.fn().mockResolvedValue({ provisioningType: 'K4', amountMinor: 9_000_000n, currency: 'VND' }),
        } as unknown as PlanReferencePriceRepo,
      );

      expect(await service.priceOfPlan('plan')).toMatchObject({ kind: 'ONE_TIME', source: 'PLAN_REFERENCE' });
    });
  });
});

describe('QĐ-113a: the "can be priced" cycles of plans count the reference price after the subscriptions', () => {
  it('asks for the reference cycle only of the plans no subscription prices', async () => {
    const findCyclesOfPlans = jest.fn().mockResolvedValue(new Map([['b', 'MONTHLY']]));
    const service = new SubscriptionPriceService(
      {
        findPricedCyclesOfPlans: jest.fn().mockResolvedValue(new Map([['a', 'ANNUAL']])),
      } as unknown as SubscriptionRepo,
      { findCyclesOfPlans } as unknown as PlanReferencePriceRepo,
    );

    const cycles = await service.pricedCyclesOfPlans(['a', 'b', 'c']);

    expect(findCyclesOfPlans).toHaveBeenCalledWith(['b', 'c'], undefined);
    expect([...cycles]).toEqual([
      ['a', 'ANNUAL'],
      ['b', 'MONTHLY'],
    ]);
  });
});
