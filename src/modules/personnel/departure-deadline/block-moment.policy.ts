import type { BusinessDate } from '../../../core/business-date';

type CaseState = 'HANDING_OVER' | 'LEFT' | 'CANCELLED';

/**
 * The first day the departure refuses the person, or null when it does not. A person who left is refused from the day they left or from
 * the block, whichever came first. A cancelled case refuses nobody: the block it left in force belongs to the account (it is lifted with an
 * unlock), not to the case. `block` is the block this case wrote.
 */
export function firstDayRefused(
  facts: { state: CaseState; leftOn: BusinessDate | null },
  block: { blockedFrom: BusinessDate } | null,
): BusinessDate | null {
  if (facts.state === 'CANCELLED') return null;
  const days = [block?.blockedFrom, facts.state === 'LEFT' ? facts.leftOn : null].filter(
    (day): day is BusinessDate => typeof day === 'string',
  );

  return days.length === 0 ? null : days.reduce((first, day) => (day < first ? day : first));
}

/**
 * Whether the block moment of a departure has come and nobody was told (`QĐ-110b`, `QĐ-110d`): the case is not cancelled or closed, the
 * system has not announced it yet, and the person is refused from today or earlier. A case cancelled before the moment never reaches it.
 */
export function blockMomentReached(
  facts: { state: CaseState; closed: boolean; announced: boolean; refusedFrom: BusinessDate | null },
  today: BusinessDate,
): boolean {
  return (
    facts.state !== 'CANCELLED' &&
    !facts.closed &&
    !facts.announced &&
    facts.refusedFrom !== null &&
    facts.refusedFrom <= today
  );
}

/** The Super Admin is asked to mark the person as left only while the handover is under way: a person already marked has nothing to mark. */
export function superAdminToMarkLeft(state: CaseState): boolean {
  return state === 'HANDING_OVER';
}

/**
 * Whether the lock of the company account of a departure blocked now is late (`QĐ-94m`(12), R-1): the block is that day, the IT Admin has the
 * day to write the lock, and from the next day it is still not written. A departure with a last working day has no such rule.
 */
export function accountLockOverdueOwed(
  facts: {
    state: CaseState;
    closed: boolean;
    accessBlockMode: 'WITH_LAST_DAY' | 'BLOCK_NOW';
    accountLocked: boolean;
    recordedOn: BusinessDate;
  },
  today: BusinessDate,
): boolean {
  return (
    facts.accessBlockMode === 'BLOCK_NOW' &&
    facts.state !== 'CANCELLED' &&
    !facts.closed &&
    !facts.accountLocked &&
    today > facts.recordedOn
  );
}
