import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { BudgetReviewExplanationReminderService } from './budget-review-explanation-reminder.service';
import { BudgetReviewFiguresService } from './budget-review-figures.service';
import { BudgetReviewPoolWatchService, type SharedPoolFigures } from './budget-review-pool-watch.service';
import { BudgetReviewExistsError } from './budget-review.errors';
import { reviewKindOf } from './budget-review.policy';
import { BudgetReviewRepo, type NewReviewLine, type ReviewPeriodRecord } from './budget-review.repo';

/** What the close of one month is made from, read before the transaction opens. */
export interface CloseInput {
  organizationId: string;
  year: number;
  month: number;
  currency: string;
  pool: SharedPoolFigures;
  companyMinor: bigint;
  /** The day the heads are asked to explain a quarter by; null for a month. */
  explanationsDueOn: BusinessDate | null;
  /** The day of the close by the calendar of the organization: the day the heads are the heads of. */
  today: BusinessDate;
  now: Date;
}

/**
 * Writes the picture of a month that is closed, in one transaction (`RV-1`, `RV-3`): the period with its lines, the audit event that says who closed it, the request that goes to the heads of the
 * Cost Centers a quarter asks to explain, and the notice to Finance when the shared pool is over its reserve.
 */
@Injectable()
export class BudgetReviewPeriodWriterService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: BudgetReviewRepo,
    private readonly figures: BudgetReviewFiguresService,
    private readonly poolWatch: BudgetReviewPoolWatchService,
    private readonly explanations: BudgetReviewExplanationReminderService,
    private readonly audit: AuditApi,
  ) {}

  /** Throws BudgetReviewExistsError when the month was closed already, by this call's check or by the unique key of the month. */
  async write(actor: AuthenticatedPrincipal, input: CloseInput): Promise<ReviewPeriodRecord> {
    try {
      return await this.runner.run(async (tx) => {
        if (await this.repo.findByMonth(input.organizationId, input.year, input.month, tx)) {
          throw new BudgetReviewExistsError(input.year, input.month);
        }
        const lines = await this.figures.linesOf(tx, input.year, input.month, input.currency);
        const period = await this.insert(tx, actor, input, lines);
        // A quarter asks the heads of the Cost Centers it needs explained the day it opens, not only when the due day comes (US-12-21 AC-4).
        await this.explanations.request(tx, period, input.today);
        await this.poolWatch.tellFinance(tx, input.organizationId, input.year, input.month, input.pool);

        return period;
      });
    } catch (error) {
      // Two closings of the same month at the same moment: the database keeps one, the other answers what the check before the write answers.
      if (isUniqueViolation(error, 'BudgetReviewPeriod', '"year"', 'budget_review_periods')) {
        throw new BudgetReviewExistsError(input.year, input.month);
      }
      throw error;
    }
  }

  /** The period with its lines, and the audit event that says who closed what. */
  private async insert(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: CloseInput,
    lines: readonly NewReviewLine[],
  ): Promise<ReviewPeriodRecord> {
    const period = await this.repo.insert(
      tx,
      {
        organizationId: input.organizationId,
        year: input.year,
        month: input.month,
        kind: reviewKindOf(input.month),
        currency: input.currency,
        snapshotByEmployeeId: actor.employeeId,
        snapshotAt: input.now,
        companySpentMinor: input.companyMinor,
        sharedPoolUnallocatedMinor: input.pool.unallocatedMinor,
        sharedPoolReserveMinor: input.pool.reserveMinor,
        annualCeilingMinor: input.pool.annualCeilingMinor,
        explanationsDueOn: input.explanationsDueOn,
      },
      lines,
    );
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'BUDGET_REVIEW.PERIOD_CLOSED', 'BudgetReviewPeriod', period.id, {
        year: input.year,
        month: input.month,
        kind: period.kind,
        lines: lines.length,
        companySpentMinor: input.companyMinor.toString(),
        sharedPoolUnallocatedMinor: input.pool.unallocatedMinor.toString(),
      }),
    );

    return period;
  }
}
