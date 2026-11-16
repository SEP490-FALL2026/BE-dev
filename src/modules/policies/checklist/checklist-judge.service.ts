import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  PolicyChecklistHasNoError,
  PolicyChecklistIncompleteError,
  PolicyDecisionReasonRequiredError,
  PolicyVersionChangedError,
} from '../public/policy-checklist.errors';
import type {
  ChecklistBody,
  ChecklistDecision,
  ChecklistVerdict,
  DecisionStepCode,
} from '../public/policy-checklist.types';
import { evaluateChecklist, judgeDecision, type StepInForce } from './checklist.policy';
import { ChecklistRepo } from './checklist.repo';

/**
 * Judges the checklist of a decision against the version of the policy in force at the step (`QĐ-111ap`): the version the person was shown,
 * every question they answer, then what the answers allow of the decision. It writes nothing; the caller writes the decision and then
 * the answers in the same transaction.
 */
@Injectable()
export class ChecklistJudgeService {
  constructor(private readonly repo: ChecklistRepo) {}

  /**
   * Throws PolicyVersionChangedError, PolicyChecklistIncompleteError, PolicyChecklistHasNoError and PolicyDecisionReasonRequiredError. Returns the
   * verdict and the reason the decision is kept with (the typed one, or the one filled in from the questions answered No).
   */
  async judge(
    tx: DbTx,
    input: {
      organizationId: string;
      stepCode: DecisionStepCode;
      checklist: ChecklistBody;
      decision: ChecklistDecision;
      reason?: string | null;
    },
  ): Promise<{ verdict: ChecklistVerdict; reason: string | null }> {
    const inForce = await this.stepInForce(tx, input.organizationId, input.stepCode);
    const evaluated = evaluateChecklist(inForce, input.checklist);
    if (!evaluated.ok) {
      const { fault } = evaluated;
      if (fault.kind === 'VERSION_CHANGED') {
        throw new PolicyVersionChangedError(input.stepCode, fault.policyVersionId, fault.versionNumber);
      }
      throw new PolicyChecklistIncompleteError(input.stepCode, fault.missing, fault.unexpected);
    }
    const judged = judgeDecision(evaluated.verdict, { decision: input.decision, reason: input.reason });
    if (judged.kind === 'HAS_NO') throw new PolicyChecklistHasNoError(input.stepCode, judged.items);
    if (judged.kind === 'REASON_REQUIRED') throw new PolicyDecisionReasonRequiredError();

    return { verdict: evaluated.verdict, reason: judged.reason };
  }

  /** The step in the policy that has it, in the version in force: each of the seven steps belongs to exactly one policy and the library keeps the set fixed. */
  private async stepInForce(tx: DbTx, organizationId: string, stepCode: DecisionStepCode): Promise<StepInForce> {
    for (const version of await this.repo.versionsInForce(tx, organizationId)) {
      const step = version.content.steps.find((candidate) => candidate.code === stepCode);
      if (step) {
        return {
          policyCode: version.policyCode,
          policyVersionId: version.policyVersionId,
          versionNumber: version.versionNumber,
          step,
        };
      }
    }

    throw new Error(`No policy of the organization ${organizationId} has the decision step ${stepCode} in force.`);
  }
}
