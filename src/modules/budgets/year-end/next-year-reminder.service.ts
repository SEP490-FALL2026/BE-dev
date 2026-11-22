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
 * Sends the reminder that budgets for the target year are not approved yet: on 01/12 and every Monday thereafter until every
 * Cost Center in use has an approved budget, Finance and the spending approver each receive one aggregated inbox notification per pass
 * (`subject` null, reporting the target year and how many Cost Centers still lack an approved budget, never a monetary figure).
 * In December the target year is the next year; from 01/01 it becomes the running year. The event key contains the year and the day,
 * so retries or concurrent workers write nothing twice. Each recipient has its own transaction so one failure never blocks the others.
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
    for (const recipientEmployeeId of recipients) {
      try {
        const isNew = await this.runner.run((tx) =>
          this.notifications.notifyInApp(tx, {
            organizationId,
            recipientEmployeeId,
            code: 'BUDGET_NEXT_YEAR_MISSING',
            subject: null,
            params: { year: due.year, costCenterCount: missing.length },
            eventKey: `nextYearBudget:${due.year}:${day}`,
          }),
        );
        if (isNew) notices += 1;
      } catch (error) {
        this.logger.error(
          `Next year budget reminder for recipient ${recipientEmployeeId} (${due.year}) failed: ${describeForOperator(error)}`,
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
