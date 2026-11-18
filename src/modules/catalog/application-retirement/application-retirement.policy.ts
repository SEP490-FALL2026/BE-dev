import type { BusinessDate } from '../../../core/business-date';
import {
  ApplicationAlreadyRetiredError,
  ApplicationRetirementBlockedError,
  type RetirementBlockingAssignment,
  type RetirementBlockingSubscription,
} from '../catalog-entry/application.errors';

/** The most assignments and subscriptions one answer lists; the totals count the rest. */
export const RETIREMENT_LIST_LIMIT = 50;

/**
 * The subscriptions of the plans of an application that stop it from being retired (`US-04-01` AC-9, AC-14): term
 * subscriptions that have not run out, that is with no end date or an end date today or later. A perpetual purchase never
 * stops it and needs no liquidation first (`QĐ-66f`).
 */
export function activeTermSubscriptions<T extends { kind: 'TERM' | 'PERPETUAL'; endDate: BusinessDate | null }>(
  subscriptions: readonly T[],
  today: BusinessDate,
): T[] {
  return subscriptions.filter(
    (subscription) => subscription.kind === 'TERM' && (subscription.endDate === null || subscription.endDate >= today),
  );
}

/**
 * Whether the application may be retired, judged in a fixed order (`US-04-01` AC-9, AC-14, `QĐ-111g`): it is not retired already; nothing
 * holds it. Nobody confirms: the IT Admin who retires it decides. A refusal lists what holds it and creates nothing. Throws
 * ApplicationAlreadyRetiredError and ApplicationRetirementBlockedError.
 */
export function decideRetirement(input: {
  retired: boolean;
  assignments: RetirementBlockingAssignment[];
  subscriptions: RetirementBlockingSubscription[];
  /** How many in all when the lists above are only the first of them; each defaults to its list's length. */
  assignmentTotal?: number;
  subscriptionTotal?: number;
}): 'RETIRE' {
  if (input.retired) throw new ApplicationAlreadyRetiredError();
  const assignmentTotal = input.assignmentTotal ?? input.assignments.length;
  const subscriptionTotal = input.subscriptionTotal ?? input.subscriptions.length;
  if (assignmentTotal > 0 || subscriptionTotal > 0) {
    throw new ApplicationRetirementBlockedError(
      input.assignments,
      input.subscriptions,
      assignmentTotal,
      subscriptionTotal,
    );
  }

  return 'RETIRE';
}
