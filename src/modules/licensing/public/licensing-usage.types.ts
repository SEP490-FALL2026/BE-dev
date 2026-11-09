import type { BusinessDate } from '../../../core/business-date';

/** The days a person held a seat of an application on one assignment: what usage is read against (`FR-4.8`, `FR-4.9`). */
export interface AssignmentInterval {
  assignmentId: string;
  /** The first assignment of the chain of renewals this one belongs to: one chain is one seat. */
  chainRootId: string;
  planId: string;
  applicationId: string;
  employeeId: string;
  /** The first day of the seat (`valid_from`). */
  from: BusinessDate;
  /** The day the seat ends, exclusive; null while it is open. */
  until: BusinessDate | null;
  /**
   * The first day the seat could be used (`QĐ-77n`): the later of the `valid_from` of the first assignment of its chain and the day its grant
   * task was completed; the `valid_from` when no grant task was done (a seat of the baseline).
   */
  usableOn: BusinessDate;
}

export interface AssignmentIntervalFilter {
  /** The plans, or every plan of the application; one of the two. */
  planIds?: readonly string[];
  applicationId?: string;
  employeeIds?: readonly string[];
  from: BusinessDate;
  to: BusinessDate;
}

/** A person who holds a seat under an account identifier. */
export interface AccountIdentifierHolder {
  normalizedAccountIdentifier: string;
  employeeId: string;
}
