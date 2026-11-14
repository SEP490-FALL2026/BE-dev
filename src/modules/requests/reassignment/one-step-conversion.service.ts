import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { StepReassignmentRepo } from '../step-routing/step-reassignment.repo';
import { SpendRoutingService } from '../spend/spend-routing.service';

/**
 * Finishes the requests an earlier rule turned into one-step when their department lost its head. Since `QĐ-110i` nothing turns a request into
 * one-step because of a missing head any more, neither the end of a head period (`organization-change.listener.ts`) nor the sweep: a paid
 * request and a case B proposal wait for the next head (`routing.policy.ts`). What is left is the second phase of a conversion marked before: the
 * sweep completes it, one transaction for each request, with the standard budget check, and a request that is not marked is left alone.
 */
@Injectable()
export class OneStepConversionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly repo: StepReassignmentRepo,
    private readonly spending: SpendRoutingService,
  ) {}

  pendingIds(): Promise<string[]> {
    return this.repo.oneStepPendingIds();
  }

  async finishPending(id: string, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, id);
      if (
        !request ||
        request.routing?.mode !== 'ONE_STEP' ||
        !['PENDING', 'WAITING_CONTROLLED', 'AWAITING_SPEND_SUBMISSION'].includes(request.state)
      )
        return false;
      // A worker that was slower than a second worker does not open a second spend step.
      await this.spending.finishConversion(tx, request, now);
      return true;
    });
  }
}
