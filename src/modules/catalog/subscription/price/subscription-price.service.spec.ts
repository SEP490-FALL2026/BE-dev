import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { LicenseLotStockService } from '../../license-lot/license-lot-stock.service';
import type { SubscriptionRepo } from '../subscription.repo';
import type { PlanReferencePriceRepo } from './plan-reference-price.repo';
import { SubscriptionPriceService } from './subscription-price.service';

const noLotStock = (): LicenseLotStockService =>
  ({
    newestFreeLotUnitPrice: jest.fn().mockResolvedValue(null),
    plansWithFreeLot: jest.fn().mockResolvedValue(new Set<string>()),
  }) as unknown as LicenseLotStockService;

/** The organization is on the 29th, the day after the UTC day it is 01:00 on in Vietnam. */
const DAY_OF_ORGANIZATION = { businessToday: jest.fn().mockResolvedValue('2026-11-29') } as never;

describe('BR-MF1-06 shared catalog price facts', () => {
  it.each([
    ['TERM', 'RECURRING', 100n],
    ['PERPETUAL', 'ONE_TIME', null],
  ] as const)(
    'maps %s once for API and worker price readers',
    async (subscriptionKind, kind, monthlyUnitPriceMinor) => {
      const findPricedOfPlan = jest.fn().mockResolvedValue({
        subscriptionKind,
        provisioningType: subscriptionKind === 'PERPETUAL' ? 'K4' : 'K2',
        referenceCommitmentMonths: null,
        unitPriceMinor: 100n,
        monthlyUnitPriceMinor,
        currency: 'VND',
        reporting: { amountMinor: 4n, currency: 'USD' },
        billingCycle: 'MONTHLY',
        allowsMidTermReduction: false,
      });
      const service = new SubscriptionPriceService(
        { findPricedOfPlan } as unknown as SubscriptionRepo,
        { findPlanProvisioningType: jest.fn().mockResolvedValue('K2') } as unknown as PlanReferencePriceRepo,
        noLotStock(),
        DAY_OF_ORGANIZATION,
      );
      const tx = {} as DbTx;
      expect(await service.priceOfPlan('plan', tx)).toEqual({
        kind,
        provisioningType: subscriptionKind === 'PERPETUAL' ? 'K4' : 'K2',
        referenceCommitmentMonths: null,
        unitPrice: { amountMinor: 100n, currency: 'VND' },
        reportingUnitPrice: { amountMinor: 4n, currency: 'USD' },
        monthlyPriceMinor: monthlyUnitPriceMinor,
        billingCycle: 'MONTHLY',
        allowsMidTermReduction: false,
        source: 'SUBSCRIPTION',
      });
      expect(findPricedOfPlan).toHaveBeenCalledWith('plan', '2026-11-29', tx, undefined);
    },
  );

  it('keeps an absent price absent when the plan has no reference price either', async () => {
    const service = new SubscriptionPriceService(
      { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
      {
        findPlanProvisioningType: jest.fn().mockResolvedValue('K2'),
        findOfPlan: jest.fn().mockResolvedValue(null),
      } as unknown as PlanReferencePriceRepo,
      noLotStock(),
      DAY_OF_ORGANIZATION,
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
        {
          findPlanProvisioningType: jest.fn().mockResolvedValue('K2'),
          findOfPlan: findPlanReferencePrice,
        } as unknown as PlanReferencePriceRepo,
        noLotStock(),
        DAY_OF_ORGANIZATION,
      );

      const price = await service.priceOfPlan('plan');

      expect(price?.source).toBe('SUBSCRIPTION');
      expect(price?.unitPrice).toEqual({ amountMinor: 700n, currency: 'VND' });
      expect(findPlanReferencePrice).not.toHaveBeenCalled();
    });

    it('prices a K1 or K2 plan with no priced subscription by the month', async () => {
      const tx = {} as DbTx;
      const findPlanReferencePrice = jest.fn().mockResolvedValue({
        provisioningType: 'K2',
        amountMinor: 500_000n,
        currency: 'VND',
        referenceCommitmentMonths: 12,
      });
      const service = new SubscriptionPriceService(
        { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
        {
          findPlanProvisioningType: jest.fn().mockResolvedValue('K2'),
          findOfPlan: findPlanReferencePrice,
        } as unknown as PlanReferencePriceRepo,
        noLotStock(),
        DAY_OF_ORGANIZATION,
      );

      expect(await service.priceOfPlan('plan', tx)).toEqual({
        kind: 'RECURRING',
        provisioningType: 'K2',
        referenceCommitmentMonths: 12,
        unitPrice: { amountMinor: 500_000n, currency: 'VND' },
        reportingUnitPrice: { amountMinor: 500_000n, currency: 'VND' },
        monthlyPriceMinor: 500_000n,
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
        noLotStock(),
        DAY_OF_ORGANIZATION,
      );

      expect(await service.subscriptionPriceOfPlan('plan')).toBeNull();
      expect(findPlanReferencePrice).not.toHaveBeenCalled();
    });

    it('prices a K4 plan with no priced subscription by its one purchase', async () => {
      const service = new SubscriptionPriceService(
        { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
        {
          findPlanProvisioningType: jest.fn().mockResolvedValue('K4'),
          findOfPlan: jest.fn().mockResolvedValue({ provisioningType: 'K4', amountMinor: 9_000_000n, currency: 'VND' }),
        } as unknown as PlanReferencePriceRepo,
        noLotStock(),
        DAY_OF_ORGANIZATION,
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
      {
        findCyclesOfPlans,
        findK4PlanIds: jest.fn().mockResolvedValue([]),
      } as unknown as PlanReferencePriceRepo,
      noLotStock(),
      DAY_OF_ORGANIZATION,
    );

    const cycles = await service.pricedCyclesOfPlans(['a', 'b', 'c']);

    expect(findCyclesOfPlans).toHaveBeenCalledWith(['b', 'c'], undefined);
    expect([...cycles]).toEqual([
      ['a', 'ANNUAL'],
      ['b', 'MONTHLY'],
    ]);
  });

  it('prices K4 via reference price first, then newest free lot unit price (K-A5), else null', async () => {
    const refService = new SubscriptionPriceService(
      { findPricedOfPlan: jest.fn() } as unknown as SubscriptionRepo,
      {
        findPlanProvisioningType: jest.fn().mockResolvedValue('K4'),
        findOfPlan: jest.fn().mockResolvedValue({ provisioningType: 'K4', amountMinor: 12_000_000n, currency: 'VND' }),
      } as unknown as PlanReferencePriceRepo,
      { newestFreeLotUnitPrice: jest.fn().mockResolvedValue(11_000_000n) } as unknown as LicenseLotStockService,
      DAY_OF_ORGANIZATION,
    );
    expect(await refService.priceOfPlan('k4-plan')).toMatchObject({
      kind: 'ONE_TIME',
      unitPrice: { amountMinor: 12_000_000n, currency: 'VND' },
      source: 'PLAN_REFERENCE',
    });

    const lotFallbackService = new SubscriptionPriceService(
      { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
      {
        findPlanProvisioningType: jest.fn().mockResolvedValue('K4'),
        findOfPlan: jest.fn().mockResolvedValue(null),
      } as unknown as PlanReferencePriceRepo,
      { newestFreeLotUnitPrice: jest.fn().mockResolvedValue(11_000_000n) } as unknown as LicenseLotStockService,
      DAY_OF_ORGANIZATION,
    );
    expect(await lotFallbackService.priceOfPlan('k4-plan')).toMatchObject({
      kind: 'ONE_TIME',
      unitPrice: { amountMinor: 11_000_000n, currency: 'VND' },
      source: 'SUBSCRIPTION',
    });

    const missingService = new SubscriptionPriceService(
      { findPricedOfPlan: jest.fn().mockResolvedValue(null) } as unknown as SubscriptionRepo,
      {
        findPlanProvisioningType: jest.fn().mockResolvedValue('K4'),
        findOfPlan: jest.fn().mockResolvedValue(null),
      } as unknown as PlanReferencePriceRepo,
      { newestFreeLotUnitPrice: jest.fn().mockResolvedValue(null) } as unknown as LicenseLotStockService,
      DAY_OF_ORGANIZATION,
    );
    expect(await missingService.priceOfPlan('k4-plan')).toBeNull();
  });
});
