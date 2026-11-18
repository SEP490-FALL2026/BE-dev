import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { ThresholdAlert } from './threshold.repo';

/**
 * Who is told that the use of a budget went over a threshold (`QĐ-111af`, `RV-2`): the head of the department of the Cost Center and Finance, in the transaction of the change that crossed it. The notice
 * says the Cost Center, the year and the threshold, never a figure. Each crossing has one event key (with its number), so a crossing that was told is never told twice to the same person and the use that
 * goes over again after going back under is told again; a department with no head today tells Finance alone.
 */
@Injectable()
export class ThresholdNotifierService {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly facts: BudgetFactsService,
  ) {}

  async told(tx: DbTx, alerts: readonly ThresholdAlert[], now: Date): Promise<void> {
    if (alerts.length === 0) return;
    const organizationId = await this.facts.organizationId(tx);
    const today = await this.facts.today(now, tx);
    const finance = await this.facts.financeEmployeeId(tx);
    const departments = await this.facts.departmentsOf([...new Set(alerts.map((alert) => alert.costCenterId))], tx);
    for (const alert of alerts) {
      const departmentId = departments.get(alert.costCenterId);
      const head = departmentId === undefined ? null : await this.facts.currentHeadOf(departmentId, today, tx);
      for (const recipientEmployeeId of new Set([head, finance])) {
        if (recipientEmployeeId === null) continue;
        await this.notifications.notifyInApp(tx, {
          organizationId,
          recipientEmployeeId,
          code: 'BUDGET_THRESHOLD_REACHED',
          subject: null,
          params: { costCenterId: alert.costCenterId, year: alert.year, threshold: alert.threshold },
          eventKey: `budgetThreshold:${alert.costCenterId}:${alert.year}:${alert.threshold}:${alert.episode}`,
        });
      }
    }
  }
}
