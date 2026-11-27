import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Contributions } from '../../../core/extension/contributions';
import { Listeners } from '../../../core/extension/listeners';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/**
 * How a request ended for some of the people it is for: the seat they asked for was granted (`GRANTED`), or the request ended for
 * them without one (`ENDED_WITHOUT_GRANT`: refused, refused by the IT Admin, withdrawn, cancelled, failed or closed as failed, left out
 * of the file the head sent on, closed because the person was transferred or left). A request for one person makes one event for that
 * person; a request for a group makes one event for each person whose line reaches its own end, naming only that person, so a listener
 * learns each line when it ends and never has to read a line that is still open.
 */
export interface RequestOutcomeEvent {
  organizationId: string;
  requestId: string;
  /** The department the request was sent from (a paid request keeps it whoever is transferred later). */
  departmentId: string;
  /** The plan asked for; null for software that is not in the catalog. */
  planId: string | null;
  /** The people the outcome is for, sorted. */
  beneficiaryEmployeeIds: string[];
  outcome: 'GRANTED' | 'ENDED_WITHOUT_GRANT';
  /** The day it ended on the calendar of the organization, as YYYY-MM-DD. */
  endedOn: string;
}

/**
 * The contexts that hear how a request ended (the personnel context: revoking the old seat of a transfer review that said
 * `STILL_NEEDED`), told in the transaction in which it ended, so what follows is never left half done; a listener that throws undoes
 * the outcome as well. They are added when their module starts, so requests never imports them.
 */
@Injectable()
export class RequestOutcomeListeners extends Listeners<RequestOutcomeEvent, DbTx> {
  constructor() {
    super('requests.outcome');
  }
}

/** What a right held in the grace of a transfer says to the request that asks for it again: the transfer, and the old right it is part of. */
export interface TransferGraceHolding {
  transferId: string;
  /** The right held from before the transfer, in the grace of which the person asks for the same software again. */
  assignmentId: string;
}

/**
 * The contexts that know a person is in the grace of a transfer and holds a right from before it (`QĐ-110q`, `R-49`, SPEC P10): the personnel context.
 * Asked by the request of a person for software they already hold; the answer lets the request through the check of the seat held and the count of the limits
 * (GH-2; a duplicate of the plan stays refused), and names the old right it replaces. With none added, nobody is in a grace and a seat held refuses the request as it always did.
 */
export interface TransferGraceHoldContribution {
  /**
   * Whether the held right `assignmentId` (begun on `effectiveFrom`) of the person is a right of the old department of a transfer whose grace
   * still lasts on `today`; null when it is not, or the person has no transfer in its grace.
   */
  holdingOf(
    input: { employeeId: string; assignmentId: string; effectiveFrom: BusinessDate; today: BusinessDate },
    tx?: DbTx,
  ): Promise<TransferGraceHolding | null>;
}

/**
 * The contributions of the grace of a transfer, added when their module starts so requests never import personnel (ADR-0019: a lower module that needs
 * a higher one opens an extension point). A `Contributions` and not a `Hook` because the worker graph loads requests without personnel: with none,
 * the answer is no grace. The first contribution that knows the right answers.
 */
@Injectable()
export class TransferGraceHoldContributions extends Contributions<TransferGraceHoldContribution> {
  constructor() {
    super('requests.transfer-grace-hold');
  }
}

/**
 * A case of an invoice that differs that Finance closed as a suspicion that the software was paid for outside the process (`RC-1`, `QĐ-111y`, `R-29`):
 * what the invoice says and what was approved or bought, side by side, and the money Finance could not account for. The review of the accounts
 * at the vendor (`SBF-08`) takes it up as a case of its own.
 */
export interface InvoiceDiscrepancyReferral {
  organizationId: string;
  caseId: string;
  purchaseInvoiceId: string;
  vendorId: string;
  /** The request or the subscription the invoice was for: one of them. */
  requestId: string | null;
  subscriptionId: string | null;
  /** What differs: seat count, unit price, or expected pool amount; in a fixed order. */
  mismatches: Array<'QUANTITY' | 'UNIT_PRICE' | 'EXPECTED_AMOUNT'>;
  /** The count the invoice states and the count that was approved or bought; null for a side nobody knew. */
  quantity: { invoice: number; expected: number | null };
  /** The price of one the invoice states and the one of the plan or subscription, in the currency each is stated in, in minor units. */
  unitPrice: {
    invoice: { amountMinor: bigint; currency: string };
    expected: { amountMinor: bigint; currency: string } | null;
  };
  /** What Finance could not account for, in dong. */
  differenceMinor: bigint;
  reason: string;
  closedByEmployeeId: string;
  closedAt: Date;
}

/**
 * The contexts that take up a case closed as a suspicion (the usage context: the accounts at the vendor against the rights on record), told in the
 * transaction in which Finance closes it, so a closed case is never left without the entry it was sent on as, and a listener that throws undoes the
 * closing. They are added when their module starts, so requests never imports them.
 */
@Injectable()
export class InvoiceDiscrepancyReferralListeners extends Listeners<InvoiceDiscrepancyReferral, DbTx> {
  constructor() {
    super('requests.invoice-discrepancy-referral');
  }
}
