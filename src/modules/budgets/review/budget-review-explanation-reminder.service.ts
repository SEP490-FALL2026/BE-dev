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

  /** The head each of the Cost Centers has on `today`, or null when its department has none: who a quarter can ask the day it opens (US-12-21 AC-12). */
  async headsOf(tx: DbTx, costCenterIds: readonly string[], today: BusinessDate): Promise<Map<string, string | null>> {
    const departments = await this.facts.departmentsOf(costCenterIds, tx);
    const heads = new Map<string, string | null>();
    for (const costCenterId of costCenterIds) {
      const departmentId = departments.get(costCenterId);
      heads.set(
        costCenterId,
        departmentId === undefined ? null : await this.facts.currentHeadOf(departmentId, today, tx),
      );
    }

    return heads;
  }

  /**
   * The request that goes to the head of each Cost Center the quarter asks (`heads`, read when it opens), in the transaction that opens it: the period, the Cost Center, the due day and the
   * light, never a figure. One notice for a Cost Center and a quarter (`review:<period>:<Cost Center>:open`, `D12`). Only the lines that are PENDING are asked, and a department with no head
   * is not PENDING. Returns how many were written.
   */
  async request(tx: DbTx, period: ReviewPeriodRecord, heads: ReadonlyMap<string, string | null>): Promise<number> {
    if (period.explanationsDueOn === null) return 0;
    const asked = await this.repo.pendingLines(tx, period.id);
    let written = 0;
    for (const { costCenterId, light } of asked) {
      const head = heads.get(costCenterId) ?? null;
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
