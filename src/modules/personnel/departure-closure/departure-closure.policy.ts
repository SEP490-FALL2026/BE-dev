import type { K1ChecklistFacts } from '../../licensing/public/licensing.types';
import { blockersOf, type BlockerFacts, type OffboardingRefusal } from '../offboarding/offboarding.policy';

/** What the lock of the mailbox for good, item (1b) of `BM-08`, is judged on. */
export interface MailboxLockFacts {
  closed: boolean;
  /** The person is blocked on the day of the act (`isBlocked`): they have left, or the block of the handover is in force. */
  blocked: boolean;
  /** Item (1a), the lock of the company account, is written. */
  accountLocked: boolean;
  /** The K1 personal seats the person holds (or will) that have no task of revocation completed: the mailbox is still in use while there is one. */
  k1RightsOpen: number;
}

/**
 * Whether the IT Admin may write item (1b) now (`QĐ-110e`, `B-1`, SPEC P28), the first thing that is wrong winning in the order a person
 * puts it right: the case is closed, the person is not blocked yet, the lock of the company account (1a) comes first, and a person who still
 * holds a K1 seat locks the mailbox for good only after every revocation of a K1 seat is completed (or the system writes it when the last one is
 * ticked). A person with no K1 writes it right after (1a). Writing it a second time is not asked here: it answers as it was.
 */
export function mailboxLockRefusal(facts: MailboxLockFacts): OffboardingRefusal | null {
  if (facts.closed) return { code: 'CASE_CLOSED' };
  if (!facts.blocked) return { code: 'CASE_NOT_BLOCKED' };
  if (!facts.accountLocked) return { code: 'ACCOUNT_LOCK_FIRST' };
  if (facts.k1RightsOpen > 0) return { code: 'MAILBOX_LOCK_BEFORE_K1', details: { k1RightsOpen: facts.k1RightsOpen } };

  return null;
}

/**
 * Whether the K1 revocation that was just completed ticked the lock of the mailbox (`QĐ-111az`, `R-1`): only the checklist of a departure has that
 * step, and only the last K1 revocation of the person carries it (D-62), so a task that is not the last never says so.
 */
export function mailboxLockedByTask(checklist: K1ChecklistFacts | null): boolean {
  return checklist !== null && checklist.variant === 'DEPARTURE' && checklist.doneCodes.includes('MAILBOX_LOCKED');
}

/**
 * Whether the system writes item (1b) now (`P28`): the last K1 revocation ticked it, (1a) is written (it always is before a departure's
 * revocation is opened, but a revocation another source asked for can end in the same hour) and (1b) was not written already.
 */
export function systemMailboxLockDue(facts: {
  ticked: boolean;
  accountLocked: boolean;
  mailboxLocked: boolean;
}): boolean {
  return facts.ticked && facts.accountLocked && !facts.mailboxLocked;
}

/**
 * Whether the system closes the departure now (`QĐ-110e`, `B-1`): the person has left and nothing keeps the case open, which is to say the lock of the
 * company account (1a) and of the mailbox for good (1b) are written and every personal seat of the person has a completed task of revocation (a task
 * that failed keeps it open: the IT Admin opens a new one). The responsibilities that are not handed over never keep it (`QĐ-110j`).
 */
export function closureDue(facts: BlockerFacts): boolean {
  return facts.state === 'LEFT' && !facts.closed && Object.keys(blockersOf(facts)).length === 0;
}
