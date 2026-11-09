import { Injectable } from '@nestjs/common';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { AssessmentRecord } from '../access-request/assessment-record.types';
import {
  ReserveConfirmationRepo,
  type ReserveConfirmationRecord,
} from '../reserve-confirmation/reserve-confirmation.repo';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';

/** What was decided and concluded about one request, read for its spend step (`US-06-01` AC-9, AC-10, AC-14). */
export interface SpendApprovalSources {
  decision: Awaited<ReturnType<SpendDecisionRepo['latest']>>;
  /** Only software that was not in the catalog has an assessment and a proposal. */
  assessment: AssessmentRecord | null;
  proposal: Awaited<ReturnType<AssessmentReadRepo['findProposal']>>;
  /** What the head confirmed when they sent a request that uses the reserve on; null when the step was opened within the base. */
  confirmation: ReserveConfirmationRecord | null;
}

/** Reads, concurrently, the decision on the spend, the assessment and proposal of new software, and the confirmation of the reserve of the step. */
@Injectable()
export class SpendApprovalSourcesService {
  constructor(
    private readonly decisions: SpendDecisionRepo,
    private readonly assessments: AssessmentReadRepo,
    private readonly confirmations: ReserveConfirmationRepo,
  ) {}

  async load(requestId: string, branch: string, stepId: string): Promise<SpendApprovalSources> {
    const newSoftware = branch === 'NEW_SOFTWARE';
    const [decision, assessment, proposal, confirmation] = await Promise.all([
      this.decisions.latest(requestId),
      newSoftware ? this.assessments.findAssessment(requestId) : Promise.resolve(null),
      newSoftware ? this.assessments.findProposal(requestId) : Promise.resolve(null),
      this.confirmations.ofStep(stepId),
    ]);

    return { decision, assessment, proposal, confirmation };
  }
}
