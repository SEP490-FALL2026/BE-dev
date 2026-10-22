import type { SeatTarget, SeatTargetRef } from '../../catalog/catalog.types';
import {
  SeatPlanNotSupportedError,
  SeatApplicationRetiredError,
  SeatQuantityUnknownError,
  SeatSubscriptionDraftError,
  SeatTargetInvalidError,
  SeatTargetNotFoundError,
} from '../licensing.errors';

/** The target a baseline is for: exactly one subscription of a paid plan, or one internal plan. */
export function toSeatTargetRef(input: { subscriptionId?: string; planId?: string }): SeatTargetRef {
  if (input.subscriptionId && input.planId) throw new SeatTargetInvalidError('BOTH');
  if (input.subscriptionId) return { subscriptionId: input.subscriptionId };
  if (input.planId) return { planId: input.planId };

  throw new SeatTargetInvalidError('NEITHER');
}

/**
 * Whether a baseline may be taken for the target the catalog answered (`AC-11`, `AC-12`, `INV-01`), in a fixed order:
 * it exists; its plan is not K3 or K4 (a K4 baseline needs a key from the vault and a company device, which is another
 * item); an internal plan is named by itself and a paid plan only through a subscription (its seats are counted per
 * subscription); a subscription is not a draft (`US-04-03` AC-6); a subscription has the quantity that tells how many
 * seats there are.
 */
export function assertBaselineTarget(ref: SeatTargetRef, target: SeatTarget | null): asserts target is SeatTarget {
  if (!target) throw new SeatTargetNotFoundError('planId' in ref ? 'PLAN' : 'SUBSCRIPTION');
  if (target.provisioningType === 'K4' || target.provisioningType === 'K3') {
    throw new SeatPlanNotSupportedError(target.provisioningType);
  }
  if ('planId' in ref && target.provisioningType !== 'K5') throw new SeatTargetInvalidError('PLAN_NEEDS_SUBSCRIPTION');
  assertSeatTargetUsable(target);
  if (target.kind === 'SUBSCRIPTION' && target.purchasedQuantity === null) throw new SeatQuantityUnknownError();
}

/**
 * A seat is taken only under an application still in the catalog and a subscription that is complete, whether the seat is
 * recorded or granted (`US-04-03` AC-6, `US-04-01` AC-9). Throws SeatApplicationRetiredError, SeatSubscriptionDraftError.
 */
export function assertSeatTargetUsable(target: SeatTarget): void {
  if (target.applicationStatus === 'RETIRED') throw new SeatApplicationRetiredError();
  if (target.status === 'DRAFT') throw new SeatSubscriptionDraftError(target.missing);
}
