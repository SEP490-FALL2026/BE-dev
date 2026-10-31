import { SubscriptionQuantityBelowOccupiedError } from './subscription.errors';

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
