import { Injectable } from '@nestjs/common';
import { statesOf } from '../my-requests/my-requests.policy';
import { MyRequestsRepo } from '../my-requests/my-requests.repo';
import { NeedDecisionQueueRepo } from '../need-decision-queue/need-decision-queue.repo';

/** Counts the caller's own requests for every signed-in account, using the same scope as the list. */
@Injectable()
export class RequestsDashboardApi {
  constructor(
    private readonly myRequests: MyRequestsRepo,
    private readonly needQueue: NeedDecisionQueueRepo,
  ) {}

  /** The caller's open requests, including requests sent before their current role. */
  async openRequestsSentBy(actor: { employeeId: string; roles: readonly string[] }): Promise<number> {
    return this.myRequests.countOf({
      requesterEmployeeId: actor.employeeId,
      states: statesOf('open', undefined),
    });
  }

  /** The need steps that wait for the person now, as the need-decision queue counts them. */
  async needDecisionsHeldBy(employeeId: string): Promise<number> {
    return this.needQueue.countOpenOf(employeeId);
  }
}
