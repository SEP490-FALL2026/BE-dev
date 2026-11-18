import type { BusinessDate } from '../../../core/business-date';

/**
 * A seat of a pool of K2 seats on a subscription that is in force on some day of a month, as the cost of the month reads it (`SM-1`): who holds
 * it, the days it is in force, and the request that asked for it (the commitment of the seat is the one of that request).
 */
export interface SeatOfMonth {
  assignmentId: string;
  subscriptionId: string;
  planId: string;
  /** The person who holds the seat, or who answers for a service account. */
  employeeId: string;
  kind: 'PERSONAL' | 'SERVICE';
  /** The department that owns a service account (`QĐ-86c`): every day of it is that department's, whoever answers for it. Null for a personal seat. */
  owningDepartmentId: string | null;
  /** The day the right begins. */
  heldFrom: BusinessDate;
  /** The first day the seat is no longer held; null while it is open. */
  heldUntil: BusinessDate | null;
  /** The request whose grant made the seat; null for a seat of the baseline or one no grant task made. */
  requestId: string | null;
}
