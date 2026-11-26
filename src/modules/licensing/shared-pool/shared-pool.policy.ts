import type { PoolSubscription } from '../../catalog/public/catalog.types';
import { PurchaseNotAllowedError, PurchaseNotApplicableError, PurchaseReasonRequiredError } from './shared-pool.errors';

type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/** What the pool of a plan holds today: the seats or keys free to grant, and those still being taken back. */
export interface PoolStock {
  free: number;
  /** Seats or keys held by a right whose revocation is open: not free yet. */
  inRevocation: number;
  /** The subscriptions that still have a free seat, for the answer that refuses a purchase. */
  freeSubscriptionIds: readonly string[];
  /** The free seats of each subscription a grant can take a seat from, in the order a grant that names none takes them. */
  freeBySubscription: ReadonlyMap<string, number>;
}

export type PurchaseDecision =
  { purchased: false } | { purchased: true; kind: 'POOL_TOP_UP' | 'KEY_PURCHASE'; reason: string | null };

/**
 * Whether a purchase may be recorded with the grant (`BR-MF1-09a`, `BR-MF1-09b`): never while the pool still has a free seat or
 * key of the plan; with none free, a purchase while a seat is only being taken back needs a reason. The IT Admin buys one seat per
 * grant, because a grant is for one person. Throws PurchaseNotApplicableError, PurchaseNotAllowedError and
 * PurchaseReasonRequiredError.
 */
export function judgePurchase(input: {
  provisioningType: ProvisioningType;
  purchase: { reason?: string } | undefined;
  stock: PoolStock | null;
}): PurchaseDecision {
  if (!input.purchase) return { purchased: false };
  if (input.provisioningType !== 'K2' && input.provisioningType !== 'K4') throw new PurchaseNotApplicableError();
  const stock = input.stock ?? { free: 0, inRevocation: 0, freeSubscriptionIds: [], freeBySubscription: new Map() };
  if (stock.free > 0) throw new PurchaseNotAllowedError(stock.free, stock.freeSubscriptionIds);

  const reason = input.purchase.reason?.trim() || null;
  if (stock.inRevocation > 0 && reason === null) throw new PurchaseReasonRequiredError();

  return { purchased: true, kind: input.provisioningType === 'K2' ? 'POOL_TOP_UP' : 'KEY_PURCHASE', reason };
}

/** What a seat granted from the pool would have cost had it been bought instead: the cost avoided, recorded once (`BR-MF1-09c`). */
export interface AvoidedCost {
  provisioningType: 'K2' | 'K4';
  /** Unused (stored as null for new rows); retained on row writer for schema compatibility (`D-12`). */
  months: number | null;
  unitMinor: bigint;
  /** The unit price converted to the reporting currency when it was recorded; null when it was not converted. */
  amountMinor: bigint;
  currency: string;
}

function compareLineCandidate(a: PoolSubscription, b: PoolSubscription): number {
  const createdA = a.lineCreatedAt ? a.lineCreatedAt.getTime() : Number.MAX_SAFE_INTEGER;
  const createdB = b.lineCreatedAt ? b.lineCreatedAt.getTime() : Number.MAX_SAFE_INTEGER;
  if (createdA !== createdB) return createdA - createdB;
  const idA = a.subscriptionLineId ?? a.subscriptionId;
  const idB = b.subscriptionLineId ?? b.subscriptionId;
  if (idA < idB) return -1;
  if (idA > idB) return 1;
  return 0;
}

/**
 * Selects the pool line/subscription to take a seat from (`P0-05`):
 * prefers candidates that still have free seats (`free > 0`), then sorts deterministically by
 * `lineCreatedAt ASC`, `subscriptionLineId ASC` (falling back to `subscriptionId` for legacy periods without lines).
 */
export function choosePoolLine(candidates: readonly PoolSubscription[], stock: PoolStock): PoolSubscription | null {
  if (candidates.length === 0) return null;
  const withRoom = candidates.filter((candidate) => (stock.freeBySubscription.get(candidate.subscriptionId) ?? 0) > 0);
  const pool = withRoom.length > 0 ? [...withRoom] : [...candidates];
  pool.sort(compareLineCandidate);

  return pool[0] ?? null;
}
