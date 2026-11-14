import { addDays, type BusinessDate } from '../../../core/business-date';

/** How many days before the end of a right its holder, the head and the IT Admin are reminded (`US-03-05` AC-1): a figure of the Story. */
export const REMINDER_LEAD_DAYS = 7;
/** How many days past its end a right may wait before the item counts as a debt (`US-03-05` AC-3): a figure of the Story. */
export const DEBT_AFTER_DAYS = 7;
/** What a reminder offers: renew the right, or let it end. */
export const REMINDER_OPTIONS = ['EXTEND', 'LET_EXPIRE'] as const;

export type ReminderAudience = 'EMPLOYEE' | 'HEAD' | 'IT_ADMIN';

/** Where an expired right stands for the IT Admin; a right still in force is not in the queue at all. */
export type ExpiryQueueStatus = 'WAITING_RENEWAL_DECISION' | 'READY_TO_REVOKE' | 'REVOCATION_OPEN';

/** The right ends on its last day: it is expired from the day after (`US-03-05` AC-2). */
export function isExpired(expectedEndDate: BusinessDate, today: BusinessDate): boolean {
  return today > expectedEndDate;
}

/** Whole days since the end day; zero up to and including it. */
export function daysOverdue(expectedEndDate: BusinessDate, today: BusinessDate): number {
  const days = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${expectedEndDate}T00:00:00Z`)) / 86_400_000;

  return Math.max(0, Math.round(days));
}

/** More than seven days unhandled; only a flag, the dashboard that shows it is another item (`US-03-05` AC-3). */
export function isDebt(expectedEndDate: BusinessDate, today: BusinessDate): boolean {
  return daysOverdue(expectedEndDate, today) > DEBT_AFTER_DAYS;
}

/**
 * The days an end date puts a right in reminder range: from today to seven days ahead, so a pass that missed the seventh day still
 * reminds on the days after it, and never once the right has ended.
 */
export function reminderRange(today: BusinessDate): { from: BusinessDate; to: BusinessDate } {
  return { from: today, to: addDays(today, REMINDER_LEAD_DAYS) };
}

/** The day the reminder of an end date is due: seven days before it (`US-03-05` AC-1, `QĐ-111l`). A pass that comes later still tells, up to the end. */
export function reminderDayOf(expectedEndDate: BusinessDate): BusinessDate {
  return addDays(expectedEndDate, -REMINDER_LEAD_DAYS);
}

/** The day the system opens the revocation of a right that was not renewed: the day after its end, at the start of it (`US-03-05` AC-2, `QĐ-111l`). */
export function revocationOpensOn(expectedEndDate: BusinessDate): BusinessDate {
  return addDays(expectedEndDate, 1);
}

/** What the expiry needs to know of a renewal request that has not ended: whether it was approved (the IT Admin has still to extend the right). */
export interface RenewalFacts {
  approved: boolean;
}

/**
 * Whether the reminder of the end the right has is held back (R-27): a renewal that was approved moves the end, so the reminder of the
 * old end would tell the wrong day; the reminders follow the new end once the right is extended. A renewal still waiting for its decision
 * holds nothing back: the holder and the head are still told, with the choice to renew or let the right end (`US-03-05` AC-1, AC-12).
 */
export function reminderHeldBack(renewal: RenewalFacts | null): boolean {
  return renewal !== null && renewal.approved;
}

/**
 * Whether the system opens the revocation of a right today (`US-03-05` AC-2, AC-14, `QĐ-111l`, R-13): its end day has passed, no renewal waits
 * for a decision or for the IT Admin to extend the right (a renewal sent in time keeps the right as `QĐ-108*` says, and the revocation
 * follows if it is refused or withdrawn), and no revocation of the expiry was ever opened for it: the system asks once, and what the IT Admin
 * made of that task (closed as failed, for one) is theirs, who may start it again by the queue.
 */
export function systemRevocationOwed(input: {
  expectedEndDate: BusinessDate;
  today: BusinessDate;
  renewal: RenewalFacts | null;
  revocationEver: boolean;
}): boolean {
  return isExpired(input.expectedEndDate, input.today) && input.renewal === null && !input.revocationEver;
}

export interface ReminderRecipients {
  holderEmployeeId: string;
  /** The head of the department of the holder today; null when it has none: then nobody takes the part of the head (`QĐ-62c`). */
  headEmployeeId: string | null;
  /** The IT Admin in charge of the department; null when it has none. */
  itAdminEmployeeId: string | null;
}

/** The reminders owed for one right and one end date: at most one for each of the three, none for a head nobody is. */
export function remindersOwed(recipients: ReminderRecipients): { audience: ReminderAudience; employeeId: string }[] {
  const owed: { audience: ReminderAudience; employeeId: string }[] = [
    { audience: 'EMPLOYEE', employeeId: recipients.holderEmployeeId },
  ];
  if (recipients.headEmployeeId) owed.push({ audience: 'HEAD', employeeId: recipients.headEmployeeId });
  if (recipients.itAdminEmployeeId) owed.push({ audience: 'IT_ADMIN', employeeId: recipients.itAdminEmployeeId });

  return owed;
}

/**
 * Where an expired right stands: a revocation of it already under way comes first; a renewal waiting for its decision keeps the right
 * and the item waits (`AC-6`); otherwise the IT Admin may start the revocation (`AC-7`). A renewal sent after the end day is a new
 * request that the requests module never reports here (`AC-8`).
 */
export function queueStatusOf(input: { revocationOpen: boolean; renewalPending: boolean }): ExpiryQueueStatus {
  if (input.revocationOpen) return 'REVOCATION_OPEN';

  return input.renewalPending ? 'WAITING_RENEWAL_DECISION' : 'READY_TO_REVOKE';
}

export type StartRefusal = 'NOT_FOUND' | 'NOT_OPEN' | 'NOT_EXPIRED' | 'RENEWAL_PENDING';

/**
 * Whether the IT Admin may start the revocation of a right that ended on a day: the right is personal and has an end date (else
 * it is not in the queue), is still open, has passed its end day and has no renewal waiting. Null when it may.
 */
export function startRefusalOf(input: {
  kind: 'PERSONAL' | 'SERVICE';
  expectedEndDate: BusinessDate | null;
  open: boolean;
  today: BusinessDate;
  status: ExpiryQueueStatus | null;
}): StartRefusal | null {
  if (input.kind !== 'PERSONAL' || input.expectedEndDate === null) return 'NOT_FOUND';
  if (!input.open) return 'NOT_OPEN';
  if (!isExpired(input.expectedEndDate, input.today)) return 'NOT_EXPIRED';

  return input.status === 'WAITING_RENEWAL_DECISION' ? 'RENEWAL_PENDING' : null;
}
