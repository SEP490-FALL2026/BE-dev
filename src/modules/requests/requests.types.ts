import type { DbTx } from '../../infrastructure/database/transaction-runner';

/** A request a person is the beneficiary of that is not over, as the IT Admin sees it beside the record of their departure (`US-03-04` AC-24). */
export interface OpenRequestOfBeneficiary {
  requestId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';
  state: string;
  /** The plan asked for; null for software that is not in the catalog yet. */
  plan: { planId: string; planName: string; applicationId: string; applicationName: string } | null;
  requester: { employeeId: string; employeeCode: string; fullName: string };
  submittedAt: Date;
  /** The request is for a group of people: the line of this person is the open part of it, and closing that line leaves the request for the others. */
  group: boolean;
  /** The IT Admin may close it now: the person has left (their line only, when the request is for a group). */
  cancellable: boolean;
}

/**
 * How a request ended for some of the people it is for (F43): the seat they asked for was granted (`GRANTED`), or the request ended for
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
 * A context that hears how a request ended, in the transaction in which it ended, so that what follows (revoking the old seat of a
 * transfer review that said `STILL_NEEDED`) is never left half done. It never imports the module of requests' private files: it registers
 * itself with `RequestsService.registerOutcomeListener` when its module starts. A listener that throws undoes the outcome as well.
 */
export interface RequestOutcomeListener {
  requestOutcome(tx: DbTx, event: RequestOutcomeEvent): Promise<void>;
}
