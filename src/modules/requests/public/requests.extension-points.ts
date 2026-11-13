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
 * Asked by the request of a person for software they already hold; the answer lets the request through the check of the seat held and the limits
 * GH-1/GH-2, and names the old right it replaces. With none added, nobody is in a grace and a seat held refuses the request as it always did.
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
