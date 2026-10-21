import { SubscriptionQuantityBelowOccupiedError } from './subscription.errors';

/** Three different people on K1 plans of one software is where a Team or Business plan is worth considering (`QĐ-54a`). */
export const K2_RECOMMENDATION_THRESHOLD = 3;

export interface K2Recommendation {
  code: 'CONSIDER_K2';
  k1Holders: number;
  threshold: number;
}

/**
 * The number of seats bought never goes under the seats that are taken (`US-04-03` AC-5, `BR-27.5`): what has been given
 * out is given back first. `occupied` counts the assignments that have not ended and have not failed, those waiting for
 * their task and those waiting to be revoked included (`BR-10.4`). Throws SubscriptionQuantityBelowOccupiedError.
 */
export function assertQuantityNotBelowOccupied(input: { requested: number; occupied: number }): void {
  if (input.requested < input.occupied) {
    throw new SubscriptionQuantityBelowOccupiedError(input.occupied, input.requested);
  }
}

/** The suggestion to consider a K2 plan: from three different people on K1 plans; it blocks nothing (`US-04-02` AC-9). */
export function recommendK2(k1Holders: number): K2Recommendation | null {
  return k1Holders >= K2_RECOMMENDATION_THRESHOLD
    ? { code: 'CONSIDER_K2', k1Holders, threshold: K2_RECOMMENDATION_THRESHOLD }
    : null;
}
