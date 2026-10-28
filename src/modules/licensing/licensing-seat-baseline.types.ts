import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';

/** One seat the baseline wrote on a subscription another department owns, with the department that owns it. */
export interface SeatBaselineClosedSeat {
  assignmentId: string;
  /** The department that owns the subscription the seat sits on. */
  owningDepartmentId: string;
}

/** A person who holds seats on subscriptions of other departments than their own on the day step 4 is closed, with those seats. */
export interface SeatBaselineClosedHolder {
  employeeId: string;
  /** The department the person is in on the closing day (the head of this department decides the review, `QĐ-89e`). */
  employeeDepartmentId: string;
  /** Sorted by assignment id. */
  assignments: SeatBaselineClosedSeat[];
}

/**
 * What closing the seat baseline (step 4 of the installation) tells the modules that act on it, in the transaction of the
 * closing (F21). `holders` are only the people who hold a seat on a subscription owned by another department than their own,
 * one entry for each person, sorted by employee id.
 */
export interface SeatBaselineClosedEvent {
  organizationId: string;
  /** The closing day in the calendar of the organization. */
  closedOn: BusinessDate;
  holders: SeatBaselineClosedHolder[];
}

/**
 * The port a module registers with `LicensingService.registerSeatBaselineClosedListener` when it starts, so licensing never imports
 * it (the personnel module opens the review after the installation, decided by the head of the department of each holder). It
 * is called in the transaction that closes the baseline, once for the closing, after the closing is written and audited; a
 * listener that throws rolls the closing back. With no listener registered, closing tells nobody.
 */
export interface SeatBaselineClosedListener {
  baselineClosed(tx: DbTx, event: SeatBaselineClosedEvent, actor: AuthenticatedPrincipal): Promise<void>;
}
