/**
 * What an invoice does to the commitment it is recorded against (`US-06-06` AC-1, AC-5, AC-9; `US-12-02` AC-5, AC-6), as one pure
 * decision. The commitment goes down by the price before tax, as far as it still holds anything; the invoice costs the price before
 * tax and the tax that cannot be deducted, whatever the commitment holds (`QĐ-34b`, `QĐ-97d`); and it is never refused for being more
 * than the budget allows (`C-08`).
 */

/** The commitment as the invoice finds it, row locked. */
export interface InvoiceCommitment {
  amountMinor: bigint;
  releasedMinor: bigint;
  appliedMinor: bigint;
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
}

/** What the invoice says, in the minor units of the currency of the commitment. */
export interface InvoiceFigures {
  /** The price on the invoice before tax. */
  netMinor: bigint;
  /** Tax that can be deducted: shown apart, never an expense. */
  deductibleTaxMinor: bigint;
  /** Tax that cannot be deducted: an expense. */
  nonDeductibleTaxMinor: bigint;
}

export type InvoiceMatch = 'MATCHED' | 'TAX_ONLY' | 'PRICE_QUANTITY_EXCEPTION';

export type InvoiceRefusal =
  /** The commitment was released: no spend was approved to be invoiced against it any more. */
  'COMMITMENT_RELEASED' | 'AMOUNT_NOT_POSITIVE';

export type InvoicePlan =
  | {
      ok: true;
      /** What the invoice cost the company: the price before tax and the tax that cannot be deducted. */
      actualCostMinor: bigint;
      /** What of the price takes the commitment down: at most what it still holds. */
      takeMinor: bigint;
      appliedAfterMinor: bigint;
      heldAfterMinor: bigint;
      stateAfter: 'HELD' | 'EXPENSED';
    }
  | { ok: false; refusal: InvoiceRefusal };

/**
 * The dong an invoice costs more than the commitment held is never a difference of the invoice: only the count and the price of one say
 * a difference (`R-44`), and the exchange rate and the card fee go straight into what was spent (`QĐ-111an`).
 */
export function planInvoice(commitment: InvoiceCommitment, figures: InvoiceFigures): InvoicePlan {
  if (figures.netMinor <= 0n || figures.deductibleTaxMinor < 0n || figures.nonDeductibleTaxMinor < 0n) {
    return { ok: false, refusal: 'AMOUNT_NOT_POSITIVE' };
  }
  if (commitment.state === 'RELEASED') return { ok: false, refusal: 'COMMITMENT_RELEASED' };

  const heldMinor =
    commitment.state === 'HELD' ? commitment.amountMinor - commitment.releasedMinor - commitment.appliedMinor : 0n;
  const takeMinor = figures.netMinor < heldMinor ? figures.netMinor : heldMinor;
  const heldAfterMinor = heldMinor - takeMinor;

  return {
    ok: true,
    actualCostMinor: figures.netMinor + figures.nonDeductibleTaxMinor,
    takeMinor,
    appliedAfterMinor: commitment.appliedMinor + takeMinor,
    heldAfterMinor,
    stateAfter: heldAfterMinor === 0n ? 'EXPENSED' : 'HELD',
  };
}

/** A commitment of the request that an invoice of a purchase may be booked to. */
export interface BookableCommitment {
  id: string;
  year: number;
  costCenterId: string;
  state: 'HELD' | 'RELEASED' | 'EXPENSED';
}

export type PurchaseBooking =
  /** Into the commitment of the year: the Cost Center that bears the cost is the one the commitment is attached to. */
  | { kind: 'COMMITMENT'; commitmentId: string }
  /** An expense of the Cost Center with no commitment: the right moved to another department, or the commitment was let go (`QĐ-55b`, `R-51`). */
  | { kind: 'COST_CENTER'; costCenterId: string }
  /** A line of the subscription, to be shared among departments later (`QĐ-104c`). */
  | { kind: 'SUBSCRIPTION'; subscriptionId: string }
  | { kind: 'UNPLACED' };

/**
 * Where the invoice of a purchase is booked (`PI-1`, `R-51`, `MIN-15`), as one pure decision. The invoice belongs to the year of the month it pays
 * for. An invoice of a subscription is a line of the subscription. Otherwise it goes into the commitment the request holds for that year when the Cost
 * Center that bears it (the department that held the right in the service month) is the commitment's own; a commitment that was let go, or another
 * department, takes it as an expense with no commitment. The price is never judged against the budget (`C-08`).
 */
export function bookPurchaseInvoice(input: {
  commitments: readonly BookableCommitment[];
  serviceYear: number;
  chargedCostCenterId: string | null;
  subscriptionId: string | null;
}): PurchaseBooking {
  if (input.subscriptionId !== null) return { kind: 'SUBSCRIPTION', subscriptionId: input.subscriptionId };
  const ofYear = input.commitments.find((commitment) => commitment.year === input.serviceYear);
  if (
    ofYear &&
    ofYear.state !== 'RELEASED' &&
    (input.chargedCostCenterId === null || ofYear.costCenterId === input.chargedCostCenterId)
  ) {
    return { kind: 'COMMITMENT', commitmentId: ofYear.id };
  }

  return input.chargedCostCenterId === null
    ? { kind: 'UNPLACED' }
    : { kind: 'COST_CENTER', costCenterId: input.chargedCostCenterId };
}
