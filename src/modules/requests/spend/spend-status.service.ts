import { Injectable } from '@nestjs/common';
import { hasSpendStep } from '../access-request/access-request.policy';
import type { AccessRequestRecord, SpendStage } from '../access-request/access-request.types';
import { BudgetCheckRepo, type CheckRecord } from './budget-check.repo';
import { FinanceReviewRepo, type FinanceReviewRecord } from './finance-review.repo';
import { SpendDecisionRepo } from './spend-decision.repo';
import { SpendStepRepo } from './spend-step.repo';

/** The two problems of the data a head or the IT Admin can mend; the figures of the budget are not among them. */
export type BlockedReason = 'STALE_COST_EVIDENCE' | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD';

export interface SpendStatusView {
  stage: SpendStage;
  blockedReason: BlockedReason | null;
  /** What Finance wrote when it gave the request back to the head. */
  financeReturnReason: string | null;
  /** What the spending approver wrote when they refused it. */
  refusalReason: string | null;
}

/** Where a request in the queue of the head stands, from its newest check and the newest way a review of it ended. */
export function queuedStatus(
  check: Pick<CheckRecord, 'route' | 'staleCostEvidence' | 'ranAt'> | null,
  review: Pick<FinanceReviewRecord, 'outcome' | 'reason' | 'decidedAt'> | null,
): SpendStatusView {
  if (review?.outcome === 'RETURNED_TO_HEAD' && (!check || review.decidedAt >= check.ranAt)) {
    return {
      stage: 'RETURNED_BY_FINANCE',
      blockedReason: null,
      financeReturnReason: review.reason,
      refusalReason: null,
    };
  }
  if (check?.route === 'BLOCKED') {
    return {
      stage: 'BLOCKED',
      blockedReason: check.staleCostEvidence ? 'STALE_COST_EVIDENCE' : 'CLOSED_OR_EXPIRED_BUDGET_PERIOD',
      financeReturnReason: null,
      refusalReason: null,
    };
  }

  return { stage: 'NOT_SUBMITTED', blockedReason: null, financeReturnReason: null, refusalReason: null };
}

@Injectable()
export class SpendStatusService {
  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly reviews: FinanceReviewRepo,
    private readonly steps: SpendStepRepo,
    private readonly decisions: SpendDecisionRepo,
  ) {}

  async of(request: AccessRequestRecord): Promise<SpendStatusView | null> {
    if (!hasSpendStep(request.policy)) return null;
    const status = (stage: SpendStage, refusalReason: string | null = null) => ({
      stage,
      blockedReason: null,
      financeReturnReason: null,
      refusalReason,
    });

    switch (request.state) {
      case 'AWAITING_SPEND_SUBMISSION': {
        const [check, review] = await Promise.all([this.checks.latest(request.id), this.reviews.latest(request.id)]);

        return queuedStatus(check, review);
      }
      case 'AWAITING_FINANCE_REVIEW':
        return status('WAITING_FINANCE_REVIEW');
      case 'AWAITING_BUDGET':
        return status('WAITING_BUDGET');
      case 'AWAITING_SPEND_DECISION':
        return status('WAITING_SPEND_DECISION');
      case 'WAITING_CONTROLLED': {
        if (await this.steps.findOpen(request.id, 'FINANCE_REVIEW')) return status('WAITING_FINANCE_REVIEW');

        return (await this.steps.findOpen(request.id, 'SPEND_APPROVAL')) ? status('WAITING_SPEND_DECISION') : null;
      }
      case 'REJECTED': {
        // A refusal of the need is the head's, and is read from the need step; this is the one of the spending approver.
        const decided = await this.decisions.latest(request.id);

        return decided?.decision === 'REJECTED' ? status('REFUSED', decided.reason) : null;
      }
      default:
        return null;
    }
  }
}
