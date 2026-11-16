import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { ChecklistBody, ChecklistVerdict } from '../../policies/public/policy-checklist.types';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { AssessmentRecord, ProposalRecord } from '../access-request/assessment-record.types';
import { AssessmentRefusedError } from './assessment.errors';
import { actsForAssignee, checkAssessor } from './assessment.policy';
import { AssessmentStepRepo } from './assessment-step.repo';

/**
 * The way into the assessment of a proposal for every command that writes it (`US-05-06`, `US-05-18`): the request locked while it
 * is assessed, the person who may assess it, the assessment it must have, the step of the IT Admin that a completion, a refusal or
 * a return ends, and the checklist of that step (`QĐ-111ap`). Says nothing about what is written.
 */
@Injectable()
export class AssessmentGate {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly assessmentReads: AssessmentReadRepo,
    private readonly steps: AssessmentStepRepo,
    private readonly catalog: CatalogApi,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /** The request, locked; AccessRequestNotFoundError when it is not a proposal: a request has an assessment from the proposal on. */
  async lockProposal(tx: DbTx, requestId: string): Promise<AccessRequestRecord> {
    const request = await this.requests.lockById(tx, requestId);
    // A request has an assessment from the proposal on, whatever branch its registration later gave it.
    if (!request || !(await this.assessmentReads.findAssessment(requestId, tx))) throw new AccessRequestNotFoundError();

    return request;
  }

  /** Throws AssessmentRefusedError for the person who asked, the person it is for, or a request that is not being assessed. */
  requireAssessor(actor: AuthenticatedPrincipal, request: AccessRequestRecord): void {
    const refusal = checkAssessor({
      actorEmployeeId: actor.employeeId,
      requesterEmployeeId: request.requesterEmployeeId,
      beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
      requestState: request.state,
    });
    if (refusal) throw new AssessmentRefusedError(refusal);
  }

  async requireAssessment(requestId: string, tx?: DbTx): Promise<AssessmentRecord> {
    const assessment = await this.assessmentReads.findAssessment(requestId, tx);
    if (!assessment) throw new Error(`The proposal ${requestId} has no assessment.`);

    return assessment;
  }

  /** The assessment and the proposal of a request that has them; AccessRequestNotFoundError for one that has not. */
  async requireProposalFacts(
    tx: DbTx,
    requestId: string,
  ): Promise<{ assessment: AssessmentRecord; proposal: ProposalRecord }> {
    const assessment = await this.assessmentReads.findAssessment(requestId, tx);
    const proposal = await this.assessmentReads.findProposal(requestId, tx);
    if (!assessment || !proposal) throw new AccessRequestNotFoundError();

    return { assessment, proposal };
  }

  /**
   * Whether a short proposal names internal software, whose plans are all free (`K5`; `QĐ-111d`): the assessment of such a plan is rejected, not
   * completed. False for a proposal that names no application (software that is new).
   */
  async namesInternalApplication(tx: DbTx, proposal: Pick<ProposalRecord, 'existingApplicationId'>): Promise<boolean> {
    if (proposal.existingApplicationId === null) return false;
    const [application] = await this.catalog.getCollectorApplications([proposal.existingApplicationId], tx);

    return application?.kind === 'INTERNAL';
  }

  /** Whether the actor works the step in the place of the person it was given to (the audit says so). */
  async standsIn(tx: DbTx, requestId: string, actor: AuthenticatedPrincipal): Promise<boolean> {
    return actsForAssignee(await this.steps.find(requestId, tx), actor.employeeId);
  }

  /** Ends the step of the assessment, if there is one (a step nobody held is taken by the person who ends it); says whether they stood in. */
  async finishStep(
    tx: DbTx,
    requestId: string,
    actor: AuthenticatedPrincipal,
    ended: { now: Date; outcome?: 'APPROVED' | 'REJECTED' | 'CLOSED' },
  ): Promise<boolean> {
    const step = await this.steps.find(requestId, tx);
    if (step) await this.steps.finish(tx, step.id, actor.employeeId, ended.now, ended.outcome);

    return actsForAssignee(step, actor.employeeId);
  }

  /**
   * The answers of the checklist of the step of the assessment judged against the policy in force (`QĐ-111ap`, step 1.3): the verdict, and the reason
   * typed or, when none is typed, the one filled in from the questions answered No. Throws what the checklist refuses (`PolicyVersionChangedError`,
   * `PolicyChecklistIncompleteError`, `PolicyChecklistHasNoError` for a completion, `PolicyDecisionReasonRequiredError`).
   */
  judgeChecklist(
    tx: DbTx,
    request: AccessRequestRecord,
    input: { decision: 'COMPLETE' | 'REJECT' | 'RETURN'; checklist: ChecklistBody; reason?: string },
  ): Promise<{ verdict: ChecklistVerdict; reason: string | null }> {
    // A request the head sent has no step of the head: the question about their approval is not one the system checked (`QĐ-103b`).
    const context = { oneStep: request.routing?.mode === 'ONE_STEP' };

    return this.checklists.judge(tx, { organizationId: request.organizationId, stepCode: '1.3', context, ...input });
  }

  /** The same for a refusal or a return, which always has its reason: the checklist throws `PolicyDecisionReasonRequiredError` when it has none. */
  async judgeRefusal(
    tx: DbTx,
    request: AccessRequestRecord,
    input: { decision: 'REJECT' | 'RETURN'; checklist: ChecklistBody; reason?: string },
  ): Promise<{ verdict: ChecklistVerdict; reason: string }> {
    const { verdict, reason } = await this.judgeChecklist(tx, request, input);
    if (reason === null) throw new Error(`The ${input.decision} of ${request.id} was judged with no reason.`);

    return { verdict, reason };
  }

  /** Keeps the answers with the decision that was written (the same transaction). */
  keepChecklist(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    kept: { verdict: ChecklistVerdict; decision: 'COMPLETE' | 'REJECT' | 'RETURN'; decidedAt: Date },
  ): Promise<void> {
    return this.checklists.record(tx, {
      organizationId: request.organizationId,
      verdict: kept.verdict,
      decision: kept.decision,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: kept.decidedAt,
      subjects: [{ kind: 'ACCESS_REQUEST', id: request.id }],
    });
  }
}
