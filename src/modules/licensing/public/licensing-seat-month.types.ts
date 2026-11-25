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

export type SeatInForceSource = 'BASELINE' | 'HANDOVER' | 'REQUEST' | 'RENEWAL_CARRY' | 'MACHINE_ACCOUNT_CONVERSION';

/**
 * A seat of a pool of K2 seats on a subscription that is in force on a given business day, with its assignment source
 * and holder/owning-department facts used to classify running uncommitted cost.
 */
export interface SeatInForce {
  assignmentId: string;
  subscriptionId: string;
  planId: string;
  requestId: string | null;
  source: SeatInForceSource;
  kind: 'PERSONAL' | 'SERVICE';
  employeeId: string;
  owningDepartmentId: string | null;
  heldFrom: BusinessDate;
  heldUntil: BusinessDate | null;
}
