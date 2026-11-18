import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { AdjustmentRecord } from './budget-adjustment.repo';

/**
 * Who hears of an adjustment of the budget in the year, in the transaction that made or decided it (`QĐ-111ag`): the spending approver is asked to decide it when Finance makes
 * it; when it is decided Finance who made it hears, and so does the head of each Cost Center it gives to or takes from, when it was approved (their budget changed). The notices
 * say the adjustment, the year, the kind and the decision, never a figure; one for each person and adjustment.
 */
@Injectable()
export class BudgetAdjustmentNotifierService {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly facts: BudgetFactsService,
  ) {}

  /** The spending approver who works is asked to decide; nobody is told when nobody holds the role (the adjustment waits for one). */
  async requested(tx: DbTx, adjustment: AdjustmentRecord): Promise<void> {
    const approver = await this.facts.usableSpendingApproverEmployeeId(tx);
    if (approver === null) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: adjustment.organizationId,
      recipientEmployeeId: approver,
      code: 'BUDGET_ADJUSTMENT_REQUESTED',
      subject: { type: 'BUDGET_ADJUSTMENT', id: adjustment.id },
      params: { adjustmentId: adjustment.id, year: adjustment.year, kind: adjustment.kind },
      eventKey: `budgetAdjustmentRequested:${adjustment.id}`,
    });
  }

  async decided(tx: DbTx, adjustment: AdjustmentRecord, today: BusinessDate): Promise<void> {
    const decision = adjustment.state === 'APPROVED' ? 'APPROVE' : 'REJECT';
    const costCenterIds = [adjustment.fromCostCenterId, adjustment.toCostCenterId].filter(
      (id): id is string => id !== null,
    );
    const recipients = new Map<string, string | null>([[adjustment.createdByEmployeeId, costCenterIds[0] ?? null]]);
    if (adjustment.state === 'APPROVED' && costCenterIds.length > 0) {
      const departments = await this.facts.departmentsOf(costCenterIds, tx);
      for (const costCenterId of costCenterIds) {
        const departmentId = departments.get(costCenterId);
        const head = departmentId === undefined ? null : await this.facts.currentHeadOf(departmentId, today, tx);
        if (head !== null && !recipients.has(head)) recipients.set(head, costCenterId);
      }
    }
    for (const [recipientEmployeeId, costCenterId] of recipients) {
      await this.notifications.notifyInApp(tx, {
        organizationId: adjustment.organizationId,
        recipientEmployeeId,
        code: 'BUDGET_ADJUSTMENT_DECIDED',
        subject: { type: 'BUDGET_ADJUSTMENT', id: adjustment.id },
        params: { adjustmentId: adjustment.id, year: adjustment.year, kind: adjustment.kind, decision, costCenterId },
        eventKey: `budgetAdjustmentDecided:${adjustment.id}:${recipientEmployeeId}`,
      });
    }
  }
}
