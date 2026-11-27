export type DeliveryOutcome =
  'SENT' | 'CANCELLED' | 'FAILED' | 'RESCHEDULED' | 'LEASE_LOST_BEFORE_SEND' | 'LEASE_LOST_AFTER_SEND' | 'NOT_CLAIMED';

export interface DeliveryResult {
  outcome: DeliveryOutcome;
  /** The original code written to the outbox when delivery fails or is rescheduled. */
  failureCode?: string;
}
