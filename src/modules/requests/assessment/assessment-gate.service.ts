import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
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
 * is assessed, the person who may assess it, the assessment it must have, and the step of the IT Admin that a completion or a
 * refusal ends. Says nothing about what is written.
 */
@Injectable()
export class AssessmentGate {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly assessmentReads: AssessmentReadRepo,
    private readonly steps: AssessmentStepRepo,
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

  /** Whether the actor works the step in the place of the person it was given to (the audit says so). */
  async standsIn(tx: DbTx, requestId: string, actor: AuthenticatedPrincipal): Promise<boolean> {
    return actsForAssignee(await this.steps.find(requestId, tx), actor.employeeId);
  }

  /** Ends the step of the assessment, if there is one (a step nobody held is taken by the person who ends it); says whether they stood in. */
  async finishStep(
    tx: DbTx,
    requestId: string,
    actor: AuthenticatedPrincipal,
    ended: { now: Date; outcome?: 'APPROVED' | 'REJECTED' },
  ): Promise<boolean> {
    const step = await this.steps.find(requestId, tx);
    if (step) await this.steps.finish(tx, step.id, actor.employeeId, ended.now, ended.outcome);

    return actsForAssignee(step, actor.employeeId);
  }
}
