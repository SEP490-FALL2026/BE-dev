import type { BusinessDate } from '../../../core/business-date';

/** The window of the calendar of the next working days the overviews count over: both days included (`QĐ-110` G2, R5 E2). */
export interface CalendarWindow {
  from: BusinessDate;
  to: BusinessDate;
}

/** The departures in the scope of an overview, by where they stand (SPEC P21); every number is a count of cases, never a person. */
export interface DepartureDashboardFacts {
  /** Handing over, with the last working day in the calendar window. */
  upcoming: number;
  /** The access is blocked (the system announced the block moment), the case is not closed and not past the deadline of the revocations. */
  awaitingRevocation: number;
  /** Past the deadline of the case with a right left without a completed task (`QĐ-110c`): the same cases the list of departures gives for `revocationOverdue=true`. */
  revocationOverdue: number;
  /** Closed (by the system) since the first of this month. */
  closedThisMonth: number;
  /** An IT Admin who left still answers for subscriptions or applications nobody has handed over (`R-8`); asked across the company, as the shared queue of the IT Admins is. */
  itHandoverPending: number;
  /** The lock of the account (1a) is recorded and the lock of the mailbox for good (1b) is not, on a case not closed. */
  mailboxLockPending: number;
}

/** The transfers in the scope of an overview, by phase (SPEC P21). */
export interface TransferDashboardFacts {
  /** Took effect, not closed, the grace still lasts (its last day included). */
  inGrace: number;
  /** Of those, the ones from the day of the reminder on: the grace ends within the reminder days. */
  graceEndingSoon: number;
  /** The grace is over and the rights are being taken back. */
  revoking: number;
}

/** What the overviews of an IT Admin and of the Super Admin read of the progress of the departures and the transfers. */
export interface PersonnelProgressFacts {
  calendar: CalendarWindow;
  departures: DepartureDashboardFacts;
  transfers: TransferDashboardFacts;
}

/** The scope of the progress counts: absent is the whole company (the Super Admin); a list is the departments of an IT Admin (empty reads nothing). */
export interface PersonnelProgressScope {
  departmentIds?: readonly string[] | undefined;
}
