import { Injectable } from '@nestjs/common';
import { mayRequest } from '../access-request/access-request.policy';
import { statesOf } from '../my-requests/my-requests.policy';
import { MyRequestsRepo } from '../my-requests/my-requests.repo';
import { NeedDecisionQueueRepo } from '../need-decision-queue/need-decision-queue.repo';

/**
 * The counts of requests the role overviews of the dashboards context read (`US-12-15` AC-2, AC-3).
 *
 * It checks mayRequest(actor.roles) not as an authorization check, but as the refusal rule of the source operation itself:
 * the Super Admin files and decides no business record, and meAccessRequestList refuses them, so there is no number to show.
 */
@Injectable()
export class RequestsDashboardApi {
  constructor(
    private readonly myRequests: MyRequestsRepo,
    private readonly needQueue: NeedDecisionQueueRepo,
  ) {}

  /**
   * The requests the person sent that are not over (the `open` view of "my requests"), or null for a caller who sends none (the
   * Super Admin): that list refuses them, so there is no number to show.
   */
  async openRequestsSentBy(actor: { employeeId: string; roles: readonly string[] }): Promise<number | null> {
    if (!mayRequest(actor.roles)) return null;

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
