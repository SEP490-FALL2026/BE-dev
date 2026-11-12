import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import type { ReleasedCommitment } from '../../budgets/public/budgets.types';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendStepRepo } from '../spend/spend-step.repo';

/** Why a request ends before its grant is done: its requester withdrew it, or it was closed because its beneficiary left or was moved. */
export type RequestEndReason = 'REQUEST_WITHDRAWN' | 'REQUEST_CANCELLED';

/**
 * What every end of a request that was cut short has in common (`US-05-08` AC-1, AC-2, AC-5; `US-03-04` AC-25): the steps still open
 * are closed (the need step, the assessment and the spend step), the
 * request leaves the batch it was sent in and what was held for it goes back to the budget. The caller holds the lock of the request,
 * has judged that it may end and then writes the state it ends in and the audit event, which differ between the two ends; the order
 * of the locks (the task of the grant, then the request) is theirs as well.
 */
@Injectable()
export class RequestEndService {
  constructor(
    private readonly steps: SpendStepRepo,
    private readonly batches: SpendBatchRepo,
    private readonly budgets: BudgetsApi,
  ) {}

  /** Returns what was released from the commitments of the request; throws BudgetCommitmentRefusedError for amounts that do not fit. */
  async close(
    tx: DbTx,
    actor: AuthenticatedPrincipal | null,
    request: { id: string; organizationId: string },
    reason: RequestEndReason,
    now: Date,
  ): Promise<ReleasedCommitment[]> {
    await this.steps.closeAllOpen(tx, request.id, now);
    await this.batches.markLeft(tx, request.id, reason, now);

    return this.budgets.releaseForRequest(tx, { requestId: request.id, reason, now });
  }
}
