import type { ApplicationKind } from '../catalog-entry/application.types';
import type { BillingCycle } from '../subscription/subscription.types';
import type { PriceAvailability, Submission } from './requestable-software.types';

/**
 * The kinds of software a person picks from the catalog to ask for (`QĐ-82n`): paid SaaS, licensed software and internal
 * software the catalog holds. A kind outside this list is never offered, so a kind added to the catalog later stays hidden
 * until the request rules know it. There is no free external kind.
 */
export const REQUESTABLE_KINDS: readonly ApplicationKind[] = ['SAAS', 'LICENSED', 'INTERNAL'];

/** Paid and licensed software is requested with an amount and a spend step; internal software never costs money (`QĐ-50a`). */
export const costsMoney = (kind: ApplicationKind): boolean => kind !== 'INTERNAL';

/**
 * Whether a request for software of this kind can be sent by a person whose department has, or has not, a Cost Center in use.
 * It mirrors the gate the request applies when it is previewed and sent (`QĐ-87g`): software that costs money needs one, free
 * internal software does not. The person may still pick it and keep a draft.
 */
export function submissionOf(kind: ApplicationKind, hasCostCenter: boolean): Submission {
  return costsMoney(kind) && !hasCostCenter
    ? { canSubmit: false, submitBlockedReason: 'FINANCE_SETUP_INCOMPLETE' }
    : { canSubmit: true, submitBlockedReason: null };
}

/**
 * Whether the department can price the plan, as the preview prices it: internal software has no price; paid software takes the
 * billing cycle of the subscription the department prices it by (`undefined` when it has none), and a cycle the system cannot
 * count in months leaves the price missing. A missing price does not stop the request: it stops only its spend step.
 */
export function priceOf(kind: ApplicationKind, cycle: BillingCycle | 'ONE_TIME' | undefined): PriceAvailability {
  if (!costsMoney(kind)) return { status: 'NOT_APPLICABLE', missingReason: null };
  if (cycle === undefined) return { status: 'MISSING', missingReason: 'NO_PRICED_SUBSCRIPTION' };
  if (cycle === 'OTHER') return { status: 'MISSING', missingReason: 'CYCLE_UNKNOWN' };

  return { status: 'PRICED', missingReason: null };
}
