import type { OffboardingRefusal } from '../offboarding/offboarding.policy';

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
