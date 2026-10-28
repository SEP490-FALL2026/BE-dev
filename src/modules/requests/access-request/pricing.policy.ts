import type { BusinessDate } from '../../../core/business-date';
import { addMonths, fiscalYearOf } from '../../../core/fiscal-year';
import { MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';

/**
 * What a request for paid software costs, as a pure calculation (`FR-3.2`, `QĐ-82m` C, `QĐ-84`): the unit price of the
 * plan, for every billing period of the term and every person it is for, laid out from the day the money is expected to
 * go out. The price comes from the subscription of the plan in the catalog, never from a person's hand. When there is no
 * price nothing is guessed: the request is _missing its price_ and cannot be sent on to be decided as spend (`QĐ-84e`).
 * A schedule that crosses a fiscal year keeps its total and says the year of every payment (`QĐ-84a`); which of the
 * payments bind, and so are held against a budget, is for the check of the budget, which has the evidence of the
 * commitment (`QĐ-84c`).
 */

export type BillingCycleCode = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER';

const CYCLE_MONTHS: Readonly<Record<Exclude<BillingCycleCode, 'OTHER'>, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

export interface PricingInput {
  /** The unit price per person per billing period of the plan; null when the plan has no priced subscription. */
  unitPrice: Money | null;
  billingCycle: BillingCycleCode | null;
  termMonths: number;
  beneficiaries: number;
  /** The day the money is expected to go out: the first payment, and the day that fixes the budget year. */
  expectedSpendOn: BusinessDate;
  fiscalYearStartMonth: number;
}

export type MissingPriceReason = 'NO_PRICED_SUBSCRIPTION' | 'CYCLE_UNKNOWN' | 'AMOUNT_TOO_LARGE' | 'AWAITING_QUOTE';

export interface PaymentPeriod {
  dueOn: BusinessDate;
  amountMinor: bigint;
  /** The fiscal year the payment falls in (`QĐ-84a`). */
  budgetYear: number;
  /**
   * Whether the contract binds the company to this payment. A period after the commitment of a quote is a forecast that
   * goes the way of a renewal (`US-05-06` AC-15); every period priced from the catalog binds.
   */
  binding: boolean;
}

export type Pricing =
  | {
      status: 'PRICED';
      amount: Money;
      unitPrice: Money;
      billingCycle: BillingCycleCode;
      periods: PaymentPeriod[];
      budgetYear: number;
    }
  | { status: 'MISSING'; reason: MissingPriceReason; budgetYear: number };

export function priceRequest(input: PricingInput): Pricing {
  const budgetYear = fiscalYearOf(input.expectedSpendOn, input.fiscalYearStartMonth);
  // A price of nothing is no price: a paid request never costs 0 (`FR-3.2`, F34), so the price data is incomplete and the request is not
  // checked, instead of reaching an approval that cannot hold a commitment of 0.
  if (input.unitPrice === null || input.unitPrice.amountMinor <= 0n || input.billingCycle === null) {
    return { status: 'MISSING', reason: 'NO_PRICED_SUBSCRIPTION', budgetYear };
  }
  if (input.billingCycle === 'OTHER') return { status: 'MISSING', reason: 'CYCLE_UNKNOWN', budgetYear };

  const cycleMonths = CYCLE_MONTHS[input.billingCycle];
  const count = Math.ceil(input.termMonths / cycleMonths);
  const perPeriod = input.unitPrice.amountMinor * BigInt(input.beneficiaries);
  const periods = Array.from({ length: count }, (_, index) => {
    const dueOn = addMonths(input.expectedSpendOn, index * cycleMonths);

    return {
      dueOn,
      amountMinor: perPeriod,
      budgetYear: fiscalYearOf(dueOn, input.fiscalYearStartMonth),
      binding: true,
    };
  });
  const total = perPeriod * BigInt(count);
  if (total > MAX_AMOUNT_MINOR) return { status: 'MISSING', reason: 'AMOUNT_TOO_LARGE', budgetYear };

  return {
    status: 'PRICED',
    amount: { amountMinor: total, currency: input.unitPrice.currency },
    unitPrice: input.unitPrice,
    billingCycle: input.billingCycle,
    periods,
    budgetYear,
  };
}
