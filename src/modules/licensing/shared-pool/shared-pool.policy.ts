import type { BusinessDate } from '../../../core/business-date';
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
  /** The months of the cost for a K2 seat; null for a K4 key, whose price is paid once. */
  months: number | null;
  unitMinor: bigint;
  amountMinor: bigint;
  currency: string;
}

const MONTHS_OF_CYCLE = { MONTHLY: 1n, QUARTERLY: 3n, ANNUAL: 12n } as const;

const ceilDiv = (amount: bigint, divisor: bigint): bigint => (amount + divisor - 1n) / divisor;

/**
 * The cost avoided by the grant of a seat or key taken from the pool (`BR-MF1-09c`, `QĐ-106e`, `QĐ-108d`), in the reporting currency
 * (the price converted when it was recorded; the vendor's price only when it was never converted): a K2 seat is the monthly price of the
 * subscription it was taken from (an annual price over 12, rounded up to the minor unit) for the months left of the year counted from the
 * whole month of the grant; a K4 key is its purchase price. Null when the plan is of another kind, or the subscription has no price in a
 * cycle that can be put per month.
 */
export function avoidedCostOf(input: {
  provisioningType: ProvisioningType;
  completedOn: BusinessDate;
  price: {
    kind: 'RECURRING' | 'ONE_TIME';
    unitPrice: { amountMinor: bigint; currency: string };
    reportingUnitPrice?: { amountMinor: bigint; currency: string } | null;
    billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';
  } | null;
}): AvoidedCost | null {
  const { price } = input;
  if (price === null) return null;
  const { amountMinor, currency } = price.reportingUnitPrice ?? price.unitPrice;
  if (input.provisioningType === 'K4') {
    if (price.kind !== 'ONE_TIME') return null;

    return { provisioningType: 'K4', months: null, unitMinor: amountMinor, amountMinor, currency };
  }
  if (input.provisioningType !== 'K2' || price.kind !== 'RECURRING' || price.billingCycle === 'OTHER') return null;

  const months = 13 - Number(input.completedOn.slice(5, 7));
  const unitMinor = ceilDiv(amountMinor, MONTHS_OF_CYCLE[price.billingCycle]);

  return { provisioningType: 'K2', months, unitMinor, amountMinor: unitMinor * BigInt(months), currency };
}
