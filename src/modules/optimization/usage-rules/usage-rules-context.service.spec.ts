import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { RulePass } from '../internal-rules/internal-rules.types';
import type { UsageRunContext } from './usage-rules.types';
import { UsageRulesContextService } from './usage-rules-context.service';

const REFERENCE = {
  kind: 'RECURRING',
  unitPrice: { amountMinor: 500_000n, currency: 'VND' },
  reportingUnitPrice: { amountMinor: 500_000n, currency: 'VND' },
  billingCycle: 'MONTHLY',
  allowsMidTermReduction: false,
  source: 'PLAN_REFERENCE',
};

/** The context of one application, with every read but the price of a seat empty. */
async function contextWith(catalog: Partial<Record<'getPlanPrice' | 'getSubscriptionPlanPrice', jest.Mock>>) {
  const service = new UsageRulesContextService(
    { getValue: jest.fn().mockResolvedValue(null) } as never,
    { getLeaveIntervals: jest.fn().mockResolvedValue([]) } as never,
    { evidenceFor: jest.fn().mockResolvedValue({ sources: [] }) } as never,
    { listAssignmentIntervals: jest.fn().mockResolvedValue([]) } as never,
    catalog as unknown as CatalogApi,
    {} as never,
    {} as never,
    { thresholdsOf: jest.fn().mockResolvedValue(new Map()) } as never,
  );

  return service.applicationOf({ today: '2026-11-18' } as RulePass as unknown as UsageRunContext, 'app', []);
}

describe('QĐ-113a the price of a seat for savings is the price of a subscription only', () => {
  it('is null when no subscription prices the plan, even though the plan has a reference price', async () => {
    const getPlanPrice = jest.fn().mockResolvedValue(REFERENCE);
    const getSubscriptionPlanPrice = jest.fn().mockResolvedValue(null);
    const context = await contextWith({ getPlanPrice, getSubscriptionPlanPrice });

    expect(await context.price('plan')).toBeNull();
    expect(getSubscriptionPlanPrice).toHaveBeenCalledWith('plan');
    expect(getPlanPrice).not.toHaveBeenCalled();
  });

  it('is the price of the subscription when one prices the plan', async () => {
    const context = await contextWith({
      getSubscriptionPlanPrice: jest.fn().mockResolvedValue({
        ...REFERENCE,
        unitPrice: { amountMinor: 3_000_000n, currency: 'VND' },
        billingCycle: 'QUARTERLY',
        source: 'SUBSCRIPTION',
      }),
    });

    expect(await context.price('plan')).toEqual({
      amountMinor: 3_000_000n,
      currency: 'VND',
      billingCycle: 'QUARTERLY',
    });
  });
});
