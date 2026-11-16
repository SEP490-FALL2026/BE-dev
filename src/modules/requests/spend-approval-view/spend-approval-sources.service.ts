import { Injectable } from '@nestjs/common';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { AssessmentRecord } from '../access-request/assessment-record.types';
import {
  ReserveConfirmationRepo,
  type ReserveConfirmationRecord,
} from '../reserve-confirmation/reserve-confirmation.repo';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import { NextYearBudgetService } from './next-year-budget.service';
import type { NextYearBudgetWire } from './spend-approval.dto';

/** What was decided and concluded about one request, read for its spend step (`US-06-01` AC-9, AC-10, AC-14). */
export interface SpendApprovalSources {
  decision: Awaited<ReturnType<SpendDecisionRepo['latest']>>;
  /** Only software that was not in the catalog has an assessment and a proposal. */
  assessment: AssessmentRecord | null;
  proposal: Awaited<ReturnType<AssessmentReadRepo['findProposal']>>;
  /** What the head confirmed when they sent a request that uses the reserve on; null when the step was opened within the base. */
  confirmation: ReserveConfirmationRecord | null;
  /** What is left of the budget of the year after with the part of it this request keeps (`QĐ-111al`); null when it keeps nothing of that year. */
  nextYearBudget: NextYearBudgetWire;
}

/**
 * Reads, concurrently, the decision on the spend, the assessment and proposal of new software, the confirmation of the reserve of the step,
 * and the budget of the year after against the part of it the request keeps. Only the person who holds the step reads them: the route asks
 * this after it has checked that.
 */
@Injectable()
export class SpendApprovalSourcesService {
  constructor(
    private readonly decisions: SpendDecisionRepo,
    private readonly assessments: AssessmentReadRepo,
    private readonly confirmations: ReserveConfirmationRepo,
    private readonly nextYear: NextYearBudgetService,
  ) {}

  async load(request: AccessRequestRecord, stepId: string): Promise<SpendApprovalSources> {
    const newSoftware = request.branch === 'NEW_SOFTWARE';
    const { pricing } = request;
    const [decision, assessment, proposal, confirmation, nextYear] = await Promise.all([
      this.decisions.latest(request.id),
      newSoftware ? this.assessments.findAssessment(request.id) : Promise.resolve(null),
      newSoftware ? this.assessments.findProposal(request.id) : Promise.resolve(null),
      this.confirmations.ofStep(stepId),
      this.nextYear.of([
        {
          requestId: request.id,
          costCenterId: request.costCenterId,
          budgetYear: pricing.budgetYear,
          nextYearAmountMinor: pricing.nextYearAmount?.amountMinor ?? null,
          currency: pricing.nextYearAmount?.currency ?? null,
        },
      ]),
    ]);

    return { decision, assessment, proposal, confirmation, nextYearBudget: nextYear.get(request.id) ?? null };
  }
}
