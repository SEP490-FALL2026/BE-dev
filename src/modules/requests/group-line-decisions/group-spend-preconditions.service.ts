import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { compareLines } from '../group-request/group-line-decision.policy';
import { GroupRequestLinesMismatchError } from '../group-request/group-request.errors';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { checkSpendDecider } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';

/** What a decision of the spend of a group is made of: the request, the step the person holds, and the people whose need is confirmed. */
export interface GroupSpendDecidable {
  request: AccessRequestRecord;
  step: SpendStepRecord;
  confirmed: readonly { employeeId: string }[];
}

/**
 * Everything the decision of the spend of a group needs to hold before anything is written (`US-05-17` AC-9, `US-06-01` AC-15): the request locked,
 * the spend step open and given to the person, who is no party to it, and every person whose need is confirmed answered once and nobody else.
 * Throws AccessRequestNotFoundError, SpendDecisionRefusedError and GroupRequestLinesMismatchError.
 */
@Injectable()
export class GroupSpendPreconditions {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly lines: RequestLineRepo,
  ) {}

  async require(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { lines: readonly { employeeId: string }[] },
  ): Promise<GroupSpendDecidable> {
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
    const lines = await this.lines.lock(tx, request.id);
    const confirmed = lines.filter((line) => line.state === 'NEED_CONFIRMED');
    const mismatch = compareLines(
      confirmed.map((line) => line.employeeId),
      input.lines.map((verdict) => verdict.employeeId),
    );
    if (mismatch) throw new GroupRequestLinesMismatchError(mismatch);

    return { request, step, confirmed };
  }
}
