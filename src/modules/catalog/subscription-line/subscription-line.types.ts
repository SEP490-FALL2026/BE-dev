import type { BusinessDate } from '../../../core/business-date';

/** Why a line stopped serving: continued by a new period, the period ended with no successor, or the line was taken off the period. */
export type SubscriptionLineClosedReason = 'RENEWED' | 'ENDED' | 'REMOVED';

/**
 * One line of a subscription period (W3-15): a plan of seats of the workspace with its price per seat-month and the least seats of its tier.
 * The seats it serves on a day are its ledger up to that day when the ledger has opened by then (`ledgerOpenedOn`), the quantity of the
 * period before; a line with no ledger (`ledgerOpenedOn` null: a draft, a past period) reads the quantity of the period.
 */
export interface SubscriptionLineRecord {
  id: string;
  organizationId: string;
  subscriptionId: string;
  workspaceId: string;
  planId: string;
  monthlyUnitPriceMinor: bigint;
  minimumSeats: number | null;
  ledgerOpenedOn: BusinessDate | null;
  renewedFromLineId: string | null;
  /** The last day the line still serves; null while it is live. */
  closedOn: BusinessDate | null;
  closedReason: SubscriptionLineClosedReason | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewSubscriptionLine {
  organizationId: string;
  subscriptionId: string;
  workspaceId: string;
  planId: string;
  monthlyUnitPriceMinor: bigint;
  minimumSeats?: number | null;
  ledgerOpenedOn?: BusinessDate | null;
  renewedFromLineId?: string | null;
}

/** What an IT Admin changes of a live line; a field left out stays. */
export interface SubscriptionLineChanges {
  monthlyUnitPriceMinor?: bigint;
  minimumSeats?: number | null;
}
