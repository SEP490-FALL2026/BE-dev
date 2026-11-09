import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import {
  AccessRequestNotFoundError,
  AccessRequestNotRequesterError,
  AccessRequestNotAwaitingRevisionError,
} from '../access-request/access-request.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';

/** Request lock precedes the budget-year lock; a concurrent second submission sees the resulting state. */
@Injectable()
export class RequestResubmissionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly spending: SpendRoutingService,
  ) {}
  async resubmit(actor: AuthenticatedPrincipal, id: string) {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, id);
      if (!request) throw new AccessRequestNotFoundError();
      if (request.requesterEmployeeId !== actor.employeeId) throw new AccessRequestNotRequesterError();
      if (request.routing?.mode !== 'ONE_STEP' || request.state !== 'AWAITING_REQUESTER_REVISION')
        throw new AccessRequestNotAwaitingRevisionError();
      await this.spending.route(tx, actor, request, 'SUBMISSION', new Date());
      const record = await this.requests.findById(id, tx);
      if (!record) throw new AccessRequestNotFoundError();
      return record;
    });
  }
}
