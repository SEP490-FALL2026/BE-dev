import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import { checkSpendDecider } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { JudgedSpendChecklist } from './spend-decision.service';

/**
 * A request for a group that is in a batch the approver sends back (`QĐ-111aq`: with a No, every request of the batch goes back): the whole group
 * goes back to its head through the return of the spend step, with the reason of the batch, and no person of it is decided. The answers the batch
 * was judged by are kept once for each person whose need is confirmed, as the return of the group on its own route keeps them.
 */
@Injectable()
export class SpendBatchGroupReturnService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly lines: RequestLineRepo,
    private readonly effects: SpendEffectsService,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /** Throws AccessRequestNotFoundError and SpendDecisionRefusedError. */
  async returnWhole(
    actor: AuthenticatedPrincipal,
    requestId: string,
    judged: JudgedSpendChecklist,
  ): Promise<{ requestState: string }> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.type !== 'GROUP_GRANT') throw new AccessRequestNotFoundError();
      const step = await this.steps.findOpen(requestId, 'SPEND_APPROVAL', tx);
      if (!step) throw new SpendDecisionRefusedError('NO_SPEND_STEP');
      const refusal = checkSpendDecider({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        assigneeEmployeeId: step.assigneeEmployeeId,
        stepState: step.state,
      });
      if (refusal) throw new SpendDecisionRefusedError(refusal);
      const confirmed = (await this.lines.lock(tx, request.id)).filter((line) => line.state === 'NEED_CONFIRMED');

      const now = new Date();
      const { requestState } = await this.effects.returnByApprover(tx, actor, request, step, {
        now,
        reason: judged.reason ?? '',
      });
      await this.checklists.record(tx, {
        organizationId: request.organizationId,
        verdict: judged.verdict,
        decision: 'RETURN',
        decidedByEmployeeId: actor.employeeId,
        decidedAt: now,
        subjects: confirmed.map((line) => ({
          kind: 'ACCESS_REQUEST' as const,
          id: request.id,
          lineEmployeeId: line.employeeId,
          decision: 'RETURN' as const,
        })),
      });

      return { requestState };
    });
  }
}
