import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendRoutingService } from './spend-routing.service';
import { entryFor } from './spend-submission.policy';

/**
 * What happens when a request that costs money enters the stage of being sent on (`US-06-14` AC-8). Normally it waits in the
 * queue of the head, who sends it on in a batch. When the head cannot, because the need was decided by the spending approver
 * in the place of the head, there is nobody to send it, so the check runs at once and the step is made straight for the
 * approver, with no queue and no batch. It runs in the transaction that moved the request, which it leaves alone when it
 * waits and when the request cannot be checked yet.
 */
@Injectable()
export class SpendEntryService {
  constructor(private readonly routing: SpendRoutingService) {}

  async enter(tx: DbTx, actor: AuthenticatedPrincipal, request: AccessRequestRecord): Promise<void> {
    const decision = request.needDecision;
    if (request.state !== 'AWAITING_SPEND_SUBMISSION' || decision === null) return;
    if (entryFor({ deciderRole: decision.deciderRole }) === 'HEAD_QUEUE') return;

    await this.routing.route(tx, actor, request, 'SUBMISSION', new Date());
  }
}
