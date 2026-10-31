import { Injectable } from '@nestjs/common';
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
