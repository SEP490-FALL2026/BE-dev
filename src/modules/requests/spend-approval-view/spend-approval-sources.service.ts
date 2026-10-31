import { Injectable } from '@nestjs/common';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { AssessmentRecord } from '../access-request/assessment-record.types';
import { BudgetInformationViewService } from '../budget-information/budget-information-view.service';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import type { ApprovalDetailWire } from './spend-approval.dto';

/** What was decided, concluded and asked about one request, read for its spend step (`US-06-01` AC-9, AC-10, AC-14). */
export interface SpendApprovalSources {
  decision: Awaited<ReturnType<SpendDecisionRepo['latest']>>;
  /** Only software that was not in the catalog has an assessment and a proposal. */
  assessment: AssessmentRecord | null;
  proposal: Awaited<ReturnType<AssessmentReadRepo['findProposal']>>;
  latestBudgetInformation: ApprovalDetailWire['latestBudgetInformation'];
}

/** Reads, concurrently, the decision on the spend, the assessment and proposal of new software, and the last question of budget. */
@Injectable()
export class SpendApprovalSourcesService {
  constructor(
    private readonly decisions: SpendDecisionRepo,
    private readonly assessments: AssessmentReadRepo,
    private readonly information: BudgetInformationViewService,
  ) {}

  async load(requestId: string, branch: string): Promise<SpendApprovalSources> {
    const newSoftware = branch === 'NEW_SOFTWARE';
    const [decision, assessment, proposal, latestBudgetInformation] = await Promise.all([
      this.decisions.latest(requestId),
      newSoftware ? this.assessments.findAssessment(requestId) : Promise.resolve(null),
      newSoftware ? this.assessments.findProposal(requestId) : Promise.resolve(null),
      this.information.latestOfRequest(requestId),
    ]);

    return { decision, assessment, proposal, latestBudgetInformation };
  }
}
