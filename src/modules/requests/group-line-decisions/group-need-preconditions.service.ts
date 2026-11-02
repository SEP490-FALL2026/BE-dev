import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { AccessRequestDecisionRefusedError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, NeedStepWithDecision } from '../access-request/access-request.types';
import {
  checkLineNeedDecider,
  compareLines,
  needStepOf,
  type LineVerdict,
} from '../group-request/group-line-decision.policy';
import {
  GroupRequestLineHoldsAccessError,
  GroupRequestLinesMismatchError,
} from '../group-request/group-request.errors';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { StepFreezeService } from '../step-routing/step-freeze.service';

/** What a decision of the need of a group is made of: the request, the step the person decides, and the lines still waiting on it. */
export interface GroupNeedDecidable {
  request: AccessRequestRecord;
  step: NeedStepWithDecision;
  open: readonly { employeeId: string }[];
  approves: boolean;
}

/** What the person decides with: the verdict of each of their people, and the reason they give for a term longer than a year. */
interface LineNeedVerdicts {
  lines: readonly LineVerdict[];
  termConfirmationReason?: string;
}

/**
 * Everything the decision of the need of a group needs to hold before anything is written (`US-05-17` AC-3, AC-4, AC-15, AC-16,
 * `US-05-04` AC-14): the request locked, the step the person holds, who may decide it, that every person still waiting is answered
 * and nobody else, and that nobody approved has been given the right since the request was sent. Throws AccessRequestNotFoundError,
 * AccessRequestDecisionRefusedError, GroupRequestLinesMismatchError and GroupRequestLineHoldsAccessError.
 */
@Injectable()
export class GroupNeedPreconditions {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly licensing: LicensingApi,
    private readonly freeze: StepFreezeService,
  ) {}

  async require(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: LineNeedVerdicts,
  ): Promise<GroupNeedDecidable> {
    const request = await this.requests.lockById(tx, requestId);
    if (!request || request.type !== 'GROUP_GRANT' || !canViewRequest(actor, viewFactsOf(request))) {
      throw new AccessRequestNotFoundError();
    }
    const lines = await this.lines.lock(tx, request.id);
    const step = needStepOf(request.needSteps, lines, actor.employeeId);
    const own = lines.filter((line) => line.needStepId === step.id);
    const approves = input.lines.some((verdict) => verdict.decision === 'APPROVE');

    const refusal = checkLineNeedDecider({
      actorEmployeeId: actor.employeeId,
      requesterEmployeeId: request.requesterEmployeeId,
      stepEmployeeIds: own.map((line) => line.employeeId),
      assigneeEmployeeId: step.assigneeEmployeeId,
      stepState: step.state,
      stepAwaitsConversion: await this.freeze.awaitsConversion(tx, { kind: 'NEED', ...step }),
      termMonths: request.termMonths,
      approves,
      confirmed: (input.termConfirmationReason ?? '').trim() !== '',
    });
    if (refusal) throw new AccessRequestDecisionRefusedError(refusal);

    const open = own.filter((line) => line.state === 'AWAITING_NEED');
    const mismatch = compareLines(
      open.map((line) => line.employeeId),
      input.lines.map((verdict) => verdict.employeeId),
    );
    if (mismatch) throw new GroupRequestLinesMismatchError(mismatch);
    await this.assertNobodyHoldsAccess(request, input.lines);

    return { request, step, open, approves };
  }

  /** A person who holds a seat of the plan since the request was sent is not approved: the line is checked again (`AC-15`). */
  private async assertNobodyHoldsAccess(request: AccessRequestRecord, verdicts: readonly LineVerdict[]): Promise<void> {
    if (request.planId === null) return;
    const holding: string[] = [];
    for (const verdict of verdicts.filter((candidate) => candidate.decision === 'APPROVE')) {
      const { total } = await this.licensing.getSeatsHeldInPlans(verdict.employeeId, [request.planId], {
        skip: 0,
        take: 1,
      });
      if (total > 0) holding.push(verdict.employeeId);
    }
    if (holding.length > 0) throw new GroupRequestLineHoldsAccessError(holding);
  }
}
