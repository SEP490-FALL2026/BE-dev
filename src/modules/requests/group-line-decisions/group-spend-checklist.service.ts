import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import { PolicyDecisionReasonRequiredError } from '../../policies/public/policy-checklist.errors';
import type { ChecklistBody, ChecklistVerdict } from '../../policies/public/policy-checklist.types';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import {
  needChecklistDecisionOf,
  peopleWithoutReason,
  typedReasonOf,
  verdictsOf,
  withReasons,
  type LineVerdict,
  type NeedLineVerdict,
} from '../group-request/group-line-decision.policy';

/** The decision of the spending approver on the people of a group as the one checklist of the group judged it. */
export interface GroupSpendAnswered {
  decision: 'APPROVE' | 'REJECT' | 'RETURN';
  /** One for each person whose need is confirmed, with the reason of a refusal. */
  verdicts: LineVerdict[];
  verdict: ChecklistVerdict;
}

/**
 * The checklist of the spend of a group (`QĐ-111ap`, `QĐ-111aq`, R-6): one for the whole group, kept once for each person decided; a No locks the
 * approval of everybody, and the group goes back to the head whole or not at all (`RETURN`). A person refused or sent back has the reason they
 * typed, or the one the answers No give.
 */
@Injectable()
export class GroupSpendChecklist {
  constructor(private readonly checklists: PolicyChecklistApi) {}

  /** Throws the errors of the checklist; writes nothing. */
  async judge(
    tx: DbTx,
    request: AccessRequestRecord,
    confirmed: readonly { employeeId: string }[],
    input: { lines: readonly NeedLineVerdict[]; checklist: ChecklistBody },
  ): Promise<GroupSpendAnswered> {
    const decision = needChecklistDecisionOf(input.lines);
    const judged = await this.checklists.judge(tx, {
      organizationId: request.organizationId,
      stepCode: '1.7',
      checklist: input.checklist,
      decision,
      reason: typedReasonOf(input.lines),
    });
    const reasoned = withReasons(input.lines, judged.autoReason);
    if (peopleWithoutReason(reasoned).length > 0) throw new PolicyDecisionReasonRequiredError();

    return { decision, verdicts: verdictsOf(confirmed, reasoned as LineVerdict[]), verdict: judged.verdict };
  }

  /** Keeps the answers once for each person, with what was decided of each; called once the group was decided or sent back. */
  record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    kept: { answered: GroupSpendAnswered; decidedAt: Date },
  ): Promise<void> {
    const { answered } = kept;

    return this.checklists.record(tx, {
      organizationId: request.organizationId,
      verdict: answered.verdict,
      decision: answered.decision,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: kept.decidedAt,
      subjects: answered.verdicts.map((verdict) => ({
        kind: 'ACCESS_REQUEST' as const,
        id: request.id,
        lineEmployeeId: verdict.employeeId,
        decision: verdict.decision,
      })),
    });
  }
}
