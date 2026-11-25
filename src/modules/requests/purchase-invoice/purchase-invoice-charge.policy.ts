import { addDays, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import { pooledInvoiceCeilingMinor } from './purchase-invoice-match.policy';
import type { SeatPricing } from './purchase-invoice.types';

const PURCHASABLE_STATES: ReadonlySet<string> = new Set(['AWAITING_EXECUTION', 'EXECUTING', 'COMPLETED']);
const FAILED_AFTER_PURCHASE_STATES: ReadonlySet<string> = new Set(['FAILED', 'AWAITING_IT_CLOSE']);

export function takesInvoice(state: string): boolean {
  return PURCHASABLE_STATES.has(state) || FAILED_AFTER_PURCHASE_STATES.has(state);
}

export function isFailedAfterPurchaseState(state: string): boolean {
  return FAILED_AFTER_PURCHASE_STATES.has(state);
}

export function heldByPerson(state: string, provisioningType: string | undefined): boolean {
  return !FAILED_AFTER_PURCHASE_STATES.has(state) && bearsByHolder(provisioningType);
}

export function pricingOf(facts: {
  monthlyPriceMinor: bigint | null;
  cycleMonths: number | null;
  renewalDate: BusinessDate | null;
}): SeatPricing {
  return {
    monthlyMinor: facts.monthlyPriceMinor,
    cycleMonths: facts.cycleMonths,
    renewalDate: facts.renewalDate,
  };
}

export function isOverApprovedInvoice(input: {
  netMinor: bigint;
  commitmentRemainingMinor: bigint | null;
  seatPricing: SeatPricing | null;
  expectedQuantity: number | null;
  serviceMonth: BusinessDate;
}): boolean {
  if (input.commitmentRemainingMinor !== null) return input.netMinor > input.commitmentRemainingMinor;
  if (input.seatPricing === null) return false;
  const ceiling = pooledInvoiceCeilingMinor({
    quantity: input.expectedQuantity,
    monthlyMinor: input.seatPricing.monthlyMinor,
    cycleMonths: input.seatPricing.cycleMonths,
    serviceMonth: input.serviceMonth,
    renewalDate: input.seatPricing.renewalDate,
  });

  return ceiling !== null && input.netMinor > ceiling;
}

/**
 * Which department bears a purchase invoice (`R-51`, `QĐ-55b`), as pure rules: the one that held the right in the month the invoice pays for. The
 * month may be running (a transfer on 16/11 counts for the period 11/2026 once it takes effect) or past (the holder of its last day), and a month
 * not yet begun is asked about today.
 */

/**
 * Whether the cost of a kind of right follows the person who holds it (`R-51`): only `K1`, the right of one person paid by the month. A `K4` key
 * bought once is a cost of the department of the request that bought it, whoever holds the key later (`QĐ-103k`); the seats of a pool (`K2`) are
 * borne by seat-months, and `K5` costs nothing.
 */
export function bearsByHolder(provisioningType: string | undefined): boolean {
  return provisioningType === 'K1';
}

/** The day whose holder of the right is asked for: the last day of the service month, or today when the month has not ended. */
export function holderDayOf(serviceMonth: BusinessDate, today: BusinessDate): BusinessDate {
  const lastDay = addDays(monthBoundsOf(serviceMonth).nextStart, -1);

  return lastDay < today ? lastDay : today;
}

/**
 * The Cost Center that bears it. A right held by one person, or by several of one Cost Center, is that Cost Center's; holders of different Cost
 * Centers (a group the head asked for), nobody holding it that day, or a holder with no Cost Center leave it with the Cost Center of the request.
 */
export function chargedCostCenterOf(input: {
  holderCostCenterIds: readonly (string | null)[];
  requestCostCenterId: string | null;
}): string | null {
  const first = input.holderCostCenterIds[0];
  const one = first !== undefined && first !== null && input.holderCostCenterIds.every((id) => id === first);

  return one ? first : input.requestCostCenterId;
}
