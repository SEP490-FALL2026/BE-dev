import type { BusinessDate } from '../../../core/business-date';
import { nextBillingBoundary, proratedSeatAmount, type BillingCycleKind } from '../../../core/seat-month-cost';

export interface VendorChargeInput {
  today: BusinessDate;
  free: number;
  commitmentTermMonths: 1 | 12 | null;
  billingCycle: BillingCycleKind | null;
  renewalDate: BusinessDate | null;
  endDate: BusinessDate | null;
  monthlyUnitPriceMinor: bigint | null;
  minimumSeats: number | null;
  seatsToday: number;
}

export interface VendorChargeEstimate {
  until: BusinessDate;
  amountMinor: bigint;
  mode: 'ONE_OFF' | 'MONTHLY';
  tierStepSeats?: number;
}

const SUPPORTED_CYCLES: ReadonlySet<string> = new Set(['ANNUAL', 'MONTHLY', 'QUARTERLY']);

function isEligibleForVendorCharge(input: VendorChargeInput): boolean {
  return (
    input.free === 0 &&
    input.commitmentTermMonths === 12 &&
    input.monthlyUnitPriceMinor !== null &&
    input.monthlyUnitPriceMinor > 0n &&
    input.billingCycle !== null &&
    SUPPORTED_CYCLES.has(input.billingCycle)
  );
}

function tierStepSeatsOf(minimumSeats: number | null, seatsToday: number): number | undefined {
  return minimumSeats !== null && minimumSeats > 1 && seatsToday >= minimumSeats ? minimumSeats : undefined;
}

/**
 * Computes the read-time vendor charge until renewal/next payment:
 * shown only when the line `chooseLine` would take has a 12-month commitment and the plan has `free === 0`.
 */
export function vendorChargeUntilRenewalOf(input: VendorChargeInput): VendorChargeEstimate | undefined {
  if (!isEligibleForVendorCharge(input)) return undefined;

  const until = nextBillingBoundary({
    billingCycle: input.billingCycle,
    renewalDate: input.renewalDate,
    endDate: input.endDate,
    fromDate: input.today,
  });
  if (until === null || until <= input.today) return undefined;

  const tierStepSeats = tierStepSeatsOf(input.minimumSeats, input.seatsToday);
  const amountMinor = proratedSeatAmount({
    monthlyMinor: input.monthlyUnitPriceMinor as bigint,
    seats: tierStepSeats ?? 1,
    from: input.today,
    untilExclusive: until,
  });

  return {
    until,
    amountMinor,
    mode: input.billingCycle === 'ANNUAL' ? 'ONE_OFF' : 'MONTHLY',
    ...(tierStepSeats !== undefined ? { tierStepSeats } : {}),
  };
}
