import { Injectable, Logger } from '@nestjs/common';
import { monthBoundsOf } from '../../../../core/business-date';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../../infrastructure/observability/operator-error';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import { BudgetFactsService } from '../../budget/budget-facts.service';
import { SharedPoolLineAlertService } from '../../shared-pool-line/shared-pool-line-alert.service';
import { BudgetReviewExplanationReminderService } from '../budget-review-explanation-reminder.service';
import { BudgetReviewPoolWatchService } from '../budget-review-pool-watch.service';
import { reviewReminderFor } from '../budget-review.policy';
import { BudgetReviewRepo } from '../budget-review.repo';

/**
 * What the hourly pass of the review does for Finance and pool owners (`RV-1`, `QĐ-111ae`, R-47, `QĐ-104i`, `W3-06`):
 * asks Finance to close the previous month on the fifth working day, warns Finance when cumulative shared-pool
 * unallocated spend exceeds reserve, reminds heads about overdue explanations, and warns subscription IT Admins when
 * ended-month excess idle seat cost exceeds 10% of paid cost. Each notice carries an idempotent event key.
 */
@Injectable()
export class BudgetReviewReminderService {
  private readonly logger = new Logger(BudgetReviewReminderService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly repo: BudgetReviewRepo,
    private readonly parameters: OperatingParametersApi,
    private readonly notifications: NotificationsApi,
    private readonly poolWatch: BudgetReviewPoolWatchService,
    private readonly explanations: BudgetReviewExplanationReminderService,
    private readonly poolLineAlert: SharedPoolLineAlertService,
  ) {}

  /** One pass for the day `now` is in the calendar of the organization; the number of notices written. `now` is a parameter for tests. */
  async noticeDue(now: Date = new Date()): Promise<{ notices: number }> {
    const today = await this.facts.today(now);
    const { start, nextStart } = monthBoundsOf(today);
    const due = reviewReminderFor(today, await this.parameters.getNonWorkingDates(start, nextStart));
    let notices = 0;
    if (due !== null) notices += await this.askToClose(due);
    notices += await this.warnAboutPool(today);
    notices += await this.warnIdleRatio(today);
    notices += await this.explanations.remind(today);

    return { notices };
  }

  /** Asks Finance to close the month, when it is not closed and Finance is there to be asked. */
  private async askToClose(due: { year: number; month: number }): Promise<number> {
    const organizationId = await this.facts.organizationId();
    if (await this.repo.findByMonth(organizationId, due.year, due.month)) return 0;
    const finance = await this.facts.financeEmployeeId();
    if (finance === null) return 0;

    return this.runner.run(async (tx) =>
      (await this.notifications.notifyInApp(tx, {
        organizationId,
        recipientEmployeeId: finance,
        code: 'BUDGET_REVIEW_DUE',
        subject: null,
        params: { year: due.year, month: due.month },
        eventKey: `budgetReviewDue:${due.year}-${String(due.month).padStart(2, '0')}`,
      }))
        ? 1
        : 0,
    );
  }

  /** Warns Finance when the line of the pool of the year, up to the month that ended last, is above the reserve of the cycle. */
  private async warnAboutPool(today: string): Promise<number> {
    const [lastYear, lastMonth] = lastEndedMonthParts(today);
    try {
      const organizationId = await this.facts.organizationId();
      const figures = await this.poolWatch.figuresOf(organizationId, lastYear, lastMonth);
      if (figures.overReserve !== true) return 0;

      return await this.runner.run(async (tx) =>
        (await this.poolWatch.tellFinance(tx, organizationId, lastYear, lastMonth, figures)) ? 1 : 0,
      );
    } catch (error) {
      this.logger.error(`Shared pool reserve check failed: ${describeForOperator(error)}`, traceForOperator(error));

      return 0;
    }
  }

  /** Warns subscription IT Admins (or Super Admin fallback) when last ended month's idle ratio exceeds 10%. */
  private async warnIdleRatio(today: string): Promise<number> {
    const [lastYear, lastMonth] = lastEndedMonthParts(today);
    const endedMonth = `${lastYear}-${String(lastMonth).padStart(2, '0')}-01`;
    try {
      return await this.poolLineAlert.warnIdleRatioForMonth(endedMonth);
    } catch (error) {
      this.logger.error(`Idle seat ratio check failed: ${describeForOperator(error)}`, traceForOperator(error));

      return 0;
    }
  }
}

function lastEndedMonthParts(today: string): [number, number] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  return month === 1 ? [year - 1, 12] : [year, month - 1];
}
