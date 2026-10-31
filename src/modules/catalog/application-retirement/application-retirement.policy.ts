import type { BusinessDate } from '../../../core/business-date';
import {
  ApplicationAlreadyRetiredError,
  ApplicationRetirementBlockedError,
  ApplicationRetirementNeedsConfirmationError,
  ApplicationRetirementNoteRequiredError,
  ApplicationRetirementNotBusinessOwnerError,
  type RetirementBlockingAssignment,
  type RetirementBlockingSubscription,
} from '../catalog-entry/application.errors';

/** The most assignments, subscriptions and confirmations one answer lists; the totals count the rest. */
export const RETIREMENT_LIST_LIMIT = 50;

/** The longest note of a confirmation; the DTO bounds the request with it. */
export const RETIREMENT_NOTE_MAX_LENGTH = 2000;

/** The content of the Business Owner confirmation, trimmed. Throws ApplicationRetirementNoteRequiredError when blank. */
export function cleanConfirmationNote(raw: string): string {
  const note = raw.trim();
  if (note.length === 0) throw new ApplicationRetirementNoteRequiredError();

  return note;
}

/**
 * Who may confirm (`US-04-01` AC-8): the Business Owner of the application today, and still working. A person who held the
 * role before, or someone else, does not confirm for them. Throws ApplicationRetirementNotBusinessOwnerError.
 */
export function assertConfirmable(input: {
  currentOwnerEmployeeId: string;
  businessOwnerEmployeeId: string;
  ownerStatus: string | null;
}): void {
  if (input.businessOwnerEmployeeId !== input.currentOwnerEmployeeId || input.ownerStatus !== 'ACTIVE') {
    throw new ApplicationRetirementNotBusinessOwnerError();
  }
}

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
 * Whether the application may be retired, judged in a fixed order (`US-04-01` AC-8, AC-9): it is not retired already; the
 * Business Owner of today has confirmed, which is asked for even when nothing holds the application; nothing holds it.
 * A refusal lists what holds it and creates nothing. Throws ApplicationAlreadyRetiredError,
 * ApplicationRetirementNeedsConfirmationError and ApplicationRetirementBlockedError.
 */
export function decideRetirement(input: {
  retired: boolean;
  confirmedByCurrentOwner: boolean;
  assignments: RetirementBlockingAssignment[];
  subscriptions: RetirementBlockingSubscription[];
  /** How many in all when the lists above are only the first of them; each defaults to its list's length. */
  assignmentTotal?: number;
  subscriptionTotal?: number;
}): 'RETIRE' {
  if (input.retired) throw new ApplicationAlreadyRetiredError();
  if (!input.confirmedByCurrentOwner) throw new ApplicationRetirementNeedsConfirmationError();
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
