import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OpenGrantTaskService } from '../provisioning/open-grants/open-grant-task.service';
import type { BusinessDate } from '../../../core/business-date';
import type { GrantedSeatOfRequest, OpenGrantTask, SeatRootsOfRequests } from './licensing-open-grants.types';

/**
 * The licensing facade for the grant tasks of a person that are not finished (`US-03-04` AC-24).
 */
@Injectable()
export class LicensingOpenGrantsApi {
  constructor(private readonly openGrants: OpenGrantTaskService) {}

  /**
   * The grant tasks of a person that are not finished (queued, waiting for a retry, being worked or failed), oldest first, with the
   * plan of each and the total (`US-03-04` AC-24). Nothing here changes a task. The cost of a page is the same whatever its size.
   */
  listOpenGrantTasksOfBeneficiary(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenGrantTask[]; total: number }> {
    return this.openGrants.pageOf(employeeId, page, tx);
  }

  /**
   * The seats of these requests that are still held on `onDate`, each followed along the chain of records that carried it (a handover, a
   * renewal, a seat carried to a renewed subscription) to the one that runs now: from the grants of `grantRequestIds` that neither failed nor
   * were cancelled, and from the records `namedRoots` names. A seat counts when the last record of its chain is not closed by that day and not
   * expected to end before it (`BR-MF1-09e`). A request for a group has one for each person granted; a request nobody granted has none.
   * One statement, whatever the number of requests; nothing here changes a seat.
   */
  listHeldSeatsOfRequests(
    roots: SeatRootsOfRequests,
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<GrantedSeatOfRequest[]> {
    return this.openGrants.heldSeatsOfRequests(roots, onDate, tx);
  }
}
