import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetNotYourCostCenterError } from '../budget/budget.errors';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import type { ExplainLineBodyDto, ExplainedLineWire } from './budget-review-explanation.dto';
import { explanationViewOf } from './budget-review-explanation.mapper';
import {
  BudgetReviewLineNotFoundError,
  BudgetReviewNotAskedError,
  BudgetReviewNotAwaitingError,
  BudgetReviewNotFoundError,
} from './budget-review.errors';
import { BudgetReviewRepo, type ReviewLineRecord } from './budget-review.repo';

/**
 * The head of a department explains a Cost Center of a quarterly review that is yellow, red or under what it should have used (`RV-3`, `QĐ-111ah`): the cause,
 * whether it happened once or goes on, the action, and what the department already knows it will need to the end of the year. Only the head of the department of
 * that Cost Center explains it; the quarter must still wait for explanations and the line must have been asked. The explanation can be written again until Finance signs.
 * It is never refused for being late: the deadline of five working days only reminds (`B-7`).
 */
@Injectable()
export class BudgetReviewExplanationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly repo: BudgetReviewRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Throws BudgetNotYourCostCenterError (403), BudgetReviewNotFoundError, BudgetReviewNotAwaitingError, BudgetReviewLineNotFoundError, BudgetReviewNotAskedError. */
  async explain(
    actor: AuthenticatedPrincipal,
    periodId: string,
    costCenterId: string,
    body: ExplainLineBodyDto,
    now: Date = new Date(),
  ): Promise<ExplainedLineWire> {
    const today = await this.facts.today(now);
    if (!(await this.facts.headedCostCenters(actor.employeeId, today)).includes(costCenterId)) {
      throw new BudgetNotYourCostCenterError();
    }
    const currency = await this.facts.reportingCurrency();
    const needsAmountMinor =
      body.knownNeedsToYearEnd.amount === undefined
        ? null
        : await this.facts.positiveMoney(body.knownNeedsToYearEnd.amount, currency);
    const written = await this.runner.run(async (tx) => {
      const period = await this.repo.findSharedLocked(tx, periodId);
      if (!period) throw new BudgetReviewNotFoundError();
      if (period.state !== 'AWAITING_EXPLANATIONS') throw new BudgetReviewNotAwaitingError(period.state);
      const line = await this.repo.findLine(tx, periodId, costCenterId);
      if (!line) throw new BudgetReviewLineNotFoundError();
      if (line.explanationStatus !== 'PENDING' && line.explanationStatus !== 'EXPLAINED') {
        throw new BudgetReviewNotAskedError(line.explanationStatus);
      }
      await this.repo.explain(tx, line.id, {
        cause: body.cause,
        persistence: body.persistence,
        action: body.action,
        needsAmountMinor,
        needsNote: body.knownNeedsToYearEnd.note,
        explainedByEmployeeId: actor.employeeId,
        at: now,
      });
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          period.organizationId,
          'BUDGET_REVIEW.LINE_EXPLAINED',
          'BudgetReviewLine',
          line.id,
          { periodId, costCenterId, persistence: body.persistence, again: line.explanationStatus === 'EXPLAINED' },
          { explanationStatus: line.explanationStatus },
        ),
      );

      return (await this.repo.findLine(tx, periodId, costCenterId)) ?? line;
    });

    return this.wireOf(periodId, costCenterId, written, currency);
  }

  private async wireOf(
    periodId: string,
    costCenterId: string,
    line: ReviewLineRecord,
    currency: string,
  ): Promise<ExplainedLineWire> {
    const [money, people] = await Promise.all([
      this.facts.formatter(currency),
      this.facts.people(line.explanation ? [line.explanation.explainedByEmployeeId] : []),
    ]);

    return {
      periodId,
      costCenterId,
      explanationStatus: line.explanationStatus,
      explanation: explanationViewOf(line.explanation, money, people),
    };
  }
}
