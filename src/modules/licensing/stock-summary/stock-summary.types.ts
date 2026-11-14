import type { StockPlan } from '../../catalog/public/catalog.types';

/** The seats a subscription holds from today on and how many of them are held by a right whose revocation is still open. */
export interface SeatOccupancy {
  occupied: number;
  inRevocation: number;
}

/** The keys of a K4 purchase: in the store and not withdrawn, given to a seat, and withdrawn from the store. */
export interface KeyCounts {
  inStore: number;
  assigned: number;
  withdrawn: number;
}

/** What a plan needs of the catalog to be counted: the kind it gives out and the subscriptions it is counted over. */
export type StockPlanFacts = Pick<StockPlan, 'provisioningType' | 'subscriptions'>;

/**
 * What a plan holds, by what it gives out (`QĐ-111n`): seats of a K2 plan (`purchased` and `free` are null when a subscription has no quantity),
 * keys of a K4 plan, the rights of a K1 plan.
 */
export type StockBlock =
  | { kind: 'SEATS'; purchased: number | null; assigned: number; free: number | null; revoking: number }
  | { kind: 'KEYS'; inStore: number; assigned: number; withdrawn: number }
  | { kind: 'HOLDERS'; holders: number };

/** One plan of the summary: the plan with its application and what it holds. */
export interface StockSummaryRow {
  plan: {
    planId: string;
    planName: string;
    provisioningType: 'K1' | 'K2' | 'K4';
    applicationId: string;
    applicationName: string;
    logoUrl: string | null;
  };
  stock: StockBlock;
}
