import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OpenGrantTaskService } from '../provisioning/open-grants/open-grant-task.service';
import type { BusinessDate } from '../../../core/business-date';
import type {
  GrantCompletion,
  GrantExecution,
  GrantedSeatOfRequest,
  K1AnnualHolderTimeline,
  K1AnnualPaidSeat,
  OpenGrantTask,
  PoolTopUpPurchase,
  SeatRootsOfRequests,
} from './licensing-open-grants.types';

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

  /**
   * Who completed the grant of each of these requests and when, the last completion of a request when it has more than one: the
   * account of the IT Admin, never the evidence. A request whose grant is not completed is absent. One statement.
   */
  listGrantCompletionsOfRequests(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, GrantCompletion>> {
    return this.openGrants.grantCompletionsOf(requestIds, tx);
  }

  /** Completed `POOL_TOP_UP` grant tasks of `requestId`, for pooled-quota top-up invoice expectation. */
  listCompletedPoolTopUpPurchasesOfRequest(requestId: string, tx?: DbTx): Promise<PoolTopUpPurchase[]> {
    return this.openGrants.completedPoolTopUpPurchasesOf(requestId, tx);
  }

  /**
   * The grant tasks of these requests that were not cancelled, each with the person it is for, its state and channel and why it failed, the
   * newest first: where the grant of each person of a request stands. A request nobody has granted has none. One statement, whatever the
   * number of requests; nothing here changes a task.
   */
  listGrantExecutionsOfRequests(requestIds: readonly string[], tx?: DbTx): Promise<GrantExecution[]> {
    return this.openGrants.grantExecutionsOf(requestIds, tx);
  }

  /** Root assignment & replacement segments along the lifetime of a K1 annual request. */
  getK1AnnualHolderTimeline(
    requestId: string,
    renewedAssignmentId: string | null,
    tx?: DbTx,
  ): Promise<K1AnnualHolderTimeline | null> {
    return this.openGrants.k1AnnualHolderTimeline(requestId, renewedAssignmentId, tx);
  }

  /** Maps request ids to their root assignment id for Tier 0 K1 allocation locking. */
  listK1AnnualRootsOfRequests(roots: SeatRootsOfRequests, tx?: DbTx): Promise<Map<string, string>> {
    return this.openGrants.k1AnnualRootsOfRequests(roots, tx);
  }

  /** Closed (non-replaced) 12-month K1 seats whose `validUntil <= onDate` (`F9(c)`). */
  listK1AnnualPaidSeatsOn(roots: SeatRootsOfRequests, onDate: BusinessDate, tx?: DbTx): Promise<K1AnnualPaidSeat[]> {
    return this.openGrants.listK1AnnualPaidSeatsOn(roots, onDate, tx);
  }
}
