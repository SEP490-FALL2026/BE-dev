import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { explanationReminderDay } from './budget-review-explanation.policy';
import { BudgetReviewRepo, type ReviewPeriodRecord } from './budget-review.repo';

/**
 * Asks the head of a department to explain a Cost Center of a quarterly review the day the quarter opens (`RV-3`, US-12-21 AC-4), and reminds them (`B-7`): on the day the explanation is due, and then every Monday, until
 * the head explains or Finance signs the quarter. It only reminds: nothing is refused for being late. Each notice carries the key `review:<period>:<Cost Center>:<day>`, so two
 * instances, or a pass run again the same day, write each notice once (`D12`); a department with no head has nobody to remind (it becomes NO_HEAD when Finance signs).
 */
@Injectable()
export class BudgetReviewExplanationReminderService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly repo: BudgetReviewRepo,
    private readonly notifications: NotificationsApi,
  ) {}

  /**
   * The request that goes to the head of each Cost Center the quarter asks, in the transaction that opens it: the period, the Cost Center, the due day and the light, never a figure. One notice for a Cost
   * Center and a quarter (`review:<period>:<Cost Center>:open`, `D12`); a department with no head has nobody to ask. Returns how many were written.
   */
  async request(tx: DbTx, period: ReviewPeriodRecord, today: BusinessDate): Promise<number> {
    if (period.explanationsDueOn === null) return 0;
    const asked = await this.repo.pendingLines(tx, period.id);
    const departments = await this.facts.departmentsOf(
      asked.map((line) => line.costCenterId),
      tx,
    );
    let written = 0;
    for (const { costCenterId, light } of asked) {
      const departmentId = departments.get(costCenterId);
      const head = departmentId === undefined ? null : await this.facts.currentHeadOf(departmentId, today, tx);
      if (head === null) continue;
      const told = await this.notifications.notifyInApp(tx, {
        organizationId: period.organizationId,
        recipientEmployeeId: head,
        code: 'BUDGET_REVIEW_EXPLANATION_REQUESTED',
        subject: { type: 'BUDGET_REVIEW_PERIOD', id: period.id },
        params: {
          periodId: period.id,
          costCenterId,
          year: period.year,
          month: period.month,
          dueOn: period.explanationsDueOn,
          light,
        },
        eventKey: `review:${period.id}:${costCenterId}:open`,
      });
      if (told) written += 1;
    }

    return written;
  }

  /** One pass for `today`; the number of notices written. */
  async remind(today: BusinessDate): Promise<number> {
    const awaiting = (await this.repo.awaitingUntil(today)).filter(
      ({ period }) => period.explanationsDueOn !== null && explanationReminderDay(today, period.explanationsDueOn),
    );
    let notices = 0;
    for (const { period, pendingCostCenterIds } of awaiting) {
      notices += await this.runner.run(async (tx) => {
        let written = 0;
        const departments = await this.facts.departmentsOf(pendingCostCenterIds, tx);
        for (const costCenterId of pendingCostCenterIds) {
          const departmentId = departments.get(costCenterId);
          const head = departmentId === undefined ? null : await this.facts.currentHeadOf(departmentId, today, tx);
          if (head === null) continue;
          const told = await this.notifications.notifyInApp(tx, {
            organizationId: period.organizationId,
            recipientEmployeeId: head,
            code: 'BUDGET_REVIEW_EXPLANATION_DUE',
            subject: { type: 'BUDGET_REVIEW_PERIOD', id: period.id },
            params: {
              periodId: period.id,
              costCenterId,
              year: period.year,
              month: period.month,
              dueOn: period.explanationsDueOn,
            },
            eventKey: `review:${period.id}:${costCenterId}:${today}`,
          });
          if (told) written += 1;
        }

        return written;
      });
    }

    return notices;
  }
}
