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
      matchResult: InvoiceMatch;
    }
  | { ok: false; refusal: InvoiceRefusal };

/**
 * `recordedNetMinor` is the price before tax of the invoices already recorded for this commitment: whether an invoice fits is judged
 * on the whole of them against what the commitment allowed (its amount less what went back to the budget), not on the one alone.
 */
export function planInvoice(
  commitment: InvoiceCommitment,
  recordedNetMinor: bigint,
  figures: InvoiceFigures,
): InvoicePlan {
  if (figures.netMinor <= 0n || figures.deductibleTaxMinor < 0n || figures.nonDeductibleTaxMinor < 0n) {
    return { ok: false, refusal: 'AMOUNT_NOT_POSITIVE' };
  }
  if (commitment.state === 'RELEASED') return { ok: false, refusal: 'COMMITMENT_RELEASED' };

  const heldMinor =
    commitment.state === 'HELD' ? commitment.amountMinor - commitment.releasedMinor - commitment.appliedMinor : 0n;
  const takeMinor = figures.netMinor < heldMinor ? figures.netMinor : heldMinor;
  const heldAfterMinor = heldMinor - takeMinor;
  const allowedMinor = commitment.amountMinor - commitment.releasedMinor;

  return {
    ok: true,
    actualCostMinor: figures.netMinor + figures.nonDeductibleTaxMinor,
    takeMinor,
    appliedAfterMinor: commitment.appliedMinor + takeMinor,
    heldAfterMinor,
    stateAfter: heldAfterMinor === 0n ? 'EXPENSED' : 'HELD',
    matchResult: matchOf(recordedNetMinor + figures.netMinor, allowedMinor, figures),
  };
}

function matchOf(cumulativeNetMinor: bigint, allowedMinor: bigint, figures: InvoiceFigures): InvoiceMatch {
  if (cumulativeNetMinor > allowedMinor) return 'PRICE_QUANTITY_EXCEPTION';

  return figures.deductibleTaxMinor > 0n || figures.nonDeductibleTaxMinor > 0n ? 'TAX_ONLY' : 'MATCHED';
}
