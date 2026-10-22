import { SubscriptionCostAllocationNotApplicableError } from './subscription.errors';
import type { PlanPricingModel } from './subscription.types';

export type AllocationApplicability = 'APPLICABLE' | 'PER_SEAT' | 'PRICING_MODEL_UNDECLARED';

/**
 * Whether the cost of a subscription is spread over Cost Centers by ratio (`QĐ-49g`): only when the plan is not billed
 * per seat (`QĐ-75b`; a per-seat cost follows the people who hold the seats) and its pricing model is known.
 */
export function allocationApplicability(pricingModel: PlanPricingModel | null): AllocationApplicability {
  if (pricingModel === null) return 'PRICING_MODEL_UNDECLARED';

  return pricingModel === 'PER_SEAT' ? 'PER_SEAT' : 'APPLICABLE';
}

/** Throws SubscriptionCostAllocationNotApplicableError unless the plan takes an allocation. */
export function assertAllocatable(pricingModel: PlanPricingModel | null): void {
  const applicability = allocationApplicability(pricingModel);
  if (applicability !== 'APPLICABLE') throw new SubscriptionCostAllocationNotApplicableError(applicability);
}
