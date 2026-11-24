import type { BusinessDate } from '../../../core/business-date';

export type ReturnTaskState = 'OPEN' | 'RECEIVED' | 'NOT_RECOVERED' | 'CANCELLED';

/**
 * Computes the return deadline from the offboarding access-block mode: immediate block means due today,
 * otherwise due on the employee's last working day.
 */
export function returnDueOn(facts: {
  accessBlockMode: 'BLOCK_NOW' | 'WITH_LAST_DAY';
  lastWorkingDay: BusinessDate | null;
  today: BusinessDate;
}): BusinessDate {
  if (facts.accessBlockMode === 'BLOCK_NOW') return facts.today;

  return facts.lastWorkingDay ?? facts.today;
}

/** An open return task becomes overdue once the calendar passes its due date. */
export function isOverdue(facts: { state: ReturnTaskState; dueOn: BusinessDate; today: BusinessDate }): boolean {
  return facts.state === 'OPEN' && facts.dueOn < facts.today;
}

/**
 * Overdue return tasks remind acting IT Admins and the Super Admin once per working day so weekends and holidays
 * do not accumulate noise.
 */
export function shouldRemindOn(facts: {
  state: ReturnTaskState;
  dueOn: BusinessDate;
  overdueNoticedOn: BusinessDate | null;
  today: BusinessDate;
  isWorkingDay: boolean;
}): boolean {
  if (!isOverdue({ state: facts.state, dueOn: facts.dueOn, today: facts.today })) return false;
  if (!facts.isWorkingDay) return false;

  return facts.overdueNoticedOn !== facts.today;
}

/** When an offboarding date is postponed to today or later, any previous overdue notice stamp is cleared. */
export function shouldClearOverdueNotice(facts: { newDueOn: BusinessDate; today: BusinessDate }): boolean {
  return facts.newDueOn >= facts.today;
}

export type ReturnTaskCompletionVerdict = 'OK' | 'OUTCOME_FIELDS_INVALID' | 'SOFTWARE_REMOVAL_NOTE_REQUIRED';

function judgeReceivedCompletion(facts: {
  hasCondition: boolean;
  softwareRemoval?: { outcome: 'REMOVED' | 'NOT_REMOVABLE'; note?: string | null } | null;
  reason?: string | null;
  hasActivationDecisions: boolean;
}): ReturnTaskCompletionVerdict {
  const hasReason = (facts.reason ?? '').trim().length > 0;
  if (!facts.hasCondition || !facts.softwareRemoval || hasReason || facts.hasActivationDecisions) {
    return 'OUTCOME_FIELDS_INVALID';
  }
  if (facts.softwareRemoval.outcome === 'NOT_REMOVABLE' && !(facts.softwareRemoval.note ?? '').trim()) {
    return 'SOFTWARE_REMOVAL_NOTE_REQUIRED';
  }

  return 'OK';
}

/** Validates mutually exclusive payload fields for RECEIVED versus NOT_RECOVERED task completion. */
export function judgeReturnTaskCompletion(facts: {
  outcome: 'RECEIVED' | 'NOT_RECOVERED';
  hasCondition: boolean;
  softwareRemoval?: { outcome: 'REMOVED' | 'NOT_REMOVABLE'; note?: string | null } | null;
  reason?: string | null;
  hasActivationDecisions: boolean;
}): ReturnTaskCompletionVerdict {
  if (facts.outcome === 'RECEIVED') return judgeReceivedCompletion(facts);

  const hasReason = (facts.reason ?? '').trim().length > 0;
  if (!hasReason || facts.hasCondition || (facts.softwareRemoval !== null && facts.softwareRemoval !== undefined)) {
    return 'OUTCOME_FIELDS_INVALID';
  }

  return 'OK';
}
