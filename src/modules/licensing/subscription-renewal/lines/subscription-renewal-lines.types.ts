import type { BusinessDate } from '../../../../core/business-date';

/** Who locked the target: the IT Admin by hand, or the system at the milestone when nobody did. */
export type LineTargetLockedBy = 'IT_ADMIN' | 'SYSTEM';

/**
 * What the system counted for a line at a renewal and locked: the seats the next period needs, the target the proposal aims at,
 * then the quantity the decision recorded. The quantity and the case are set once; the rest never changes.
 */
export interface SubscriptionLineTargetRecord {
  subscriptionLineId: string;
  renewalOn: BusinessDate;
  seatsNeeded: number;
  target: number;
  recordedQuantity: number | null;
  renewalId: string | null;
  lockedAt: Date;
  lockedBy: LineTargetLockedBy;
}

export interface NewSubscriptionLineTarget {
  subscriptionLineId: string;
  renewalOn: BusinessDate;
  seatsNeeded: number;
  target: number;
  lockedAt: Date;
  lockedBy: LineTargetLockedBy;
}
