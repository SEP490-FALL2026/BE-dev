import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetFactsRepo } from '../budget/budget-facts.repo';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { nextYearReminderOn } from './next-year-reminder.policy';

/** What a pass wrote: how many notices were new (a notice written before is not written again). */
export interface NextYearReminderResult {
  notices: number;
}

/**
 * The reminder that the budget of the year after is not approved (`QĐ-111am`, B-4): on 01/12 and then every Monday, Finance and the
 * spending approver are told, for each Cost Center in use that has no approved budget of the next year, that it has none. A Cost Center
 * whose budget is approved is told no more; nothing is told from 01/01 (the year after has become the year that runs, and a request waits
 * for a budget as `QĐ-30b` says). The notice says the Cost Center and the year, never a figure. Its event key is the Cost Center and the
 * day, so a pass that runs again, or on another instance, writes nothing new. Each Cost Center is told in a transaction of its own, so one
 * that fails does not stop the others and is tried again at the next pass of the same day. Reminders only: nothing is decided or changed.
 */
@Injectable()
export class NextYearReminderService {
  private readonly logger = new Logger(NextYearReminderService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly budgets: BudgetFactsRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
  ) {}

  /** One pass for the day `now` is in the calendar of the organization. `now` is a parameter for tests. */
  async noticeDue(now: Date = new Date()): Promise<NextYearReminderResult> {
    const day = await this.facts.today(now);
    const due = nextYearReminderOn(day);
    if (due === null) return { notices: 0 };

    const missing = await this.costCentersWithoutBudget(due.year);
    if (missing.length === 0) return { notices: 0 };
    const organizationId = await this.facts.organizationId();
    const recipients = [
      await this.facts.financeEmployeeId(),
      await this.facts.usableSpendingApproverEmployeeId(),
    ].filter((id): id is string => id !== null);
    let notices = 0;
    for (const costCenterId of missing) {
      try {
        notices += await this.runner.run(async (tx) => {
          let written = 0;
          for (const recipientEmployeeId of recipients) {
            const isNew = await this.notifications.notifyInApp(tx, {
              organizationId,
              recipientEmployeeId,
              code: 'BUDGET_NEXT_YEAR_MISSING',
              subject: { type: 'COST_CENTER', id: costCenterId },
              params: { costCenterId, year: due.year },
              eventKey: `nextYearBudget:${costCenterId}:${day}`,
            });
            if (isNew) written += 1;
          }

          return written;
        });
      } catch (error) {
        this.logger.error(
          `Next year budget reminder of Cost Center ${costCenterId} (${due.year}) failed: ${describeForOperator(error)}`,
          traceForOperator(error),
        );
      }
    }

    return { notices };
  }

  /** The Cost Centers in use of the departments of the year that have no approved budget of it, in order of id. */
  private async costCentersWithoutBudget(year: number): Promise<string[]> {
    const departmentIds = await this.organizationReads.getActiveDepartmentIds(year);
    const costCenterIds = [...new Set((await this.organizationReads.getUnitCostCenterIds(departmentIds)).values())];
    const approved = await this.budgets.approvedOfCostCenters(costCenterIds, year);

    return costCenterIds.filter((id) => !approved.has(id)).sort();
  }
}
