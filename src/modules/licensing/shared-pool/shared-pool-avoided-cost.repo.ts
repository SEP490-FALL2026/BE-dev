import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AvoidedCost } from './shared-pool.policy';

/** The one writer of `pool_grant_avoided_costs`: one row for each task that granted from the pool, never changed (`QĐ-106e`). */
@Injectable()
export class SharedPoolAvoidedCostRepo {
  /** Records the pre-computed avoided cost of a pool grant task (`W3-09`, idempotent per task). */
  async recordForTask(tx: DbTx, taskId: string, amount: { amountMinor: bigint; currency: string }): Promise<void> {
    const task = await tx.provisioningTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        organizationId: true,
        assignmentId: true,
        requestId: true,
        assignment: {
          select: {
            planId: true,
            validFrom: true,
            plan: { select: { provisioningType: true } },
          },
        },
      },
    });
    const kind = task?.assignment.plan.provisioningType;
    if (!task || task.requestId === null || (kind !== 'K2' && kind !== 'K4')) return;

    await this.record(tx, {
      organizationId: task.organizationId,
      provisioningTaskId: task.id,
      assignmentId: task.assignmentId,
      requestId: task.requestId,
      planId: task.assignment.planId,
      recordedOn: fromDateColumn(task.assignment.validFrom),
      cost: {
        provisioningType: kind,
        months: null,
        unitMinor: amount.amountMinor,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
      },
    });
  }

  /** Records the cost avoided by the task; a task already recorded is left as it is, so completing it twice adds nothing. */
  async record(
    tx: DbTx,
    input: {
      organizationId: string;
      provisioningTaskId: string;
      assignmentId: string;
      requestId: string;
      planId: string;
      recordedOn: BusinessDate;
      cost: AvoidedCost;
    },
  ): Promise<void> {
    await tx.poolGrantAvoidedCost.createMany({
      data: [
        {
          organizationId: input.organizationId,
          provisioningTaskId: input.provisioningTaskId,
          assignmentId: input.assignmentId,
          requestId: input.requestId,
          planId: input.planId,
          provisioningType: input.cost.provisioningType,
          months: input.cost.months,
          unitMinor: input.cost.unitMinor,
          amountMinor: input.cost.amountMinor,
          currency: input.cost.currency,
          recordedOn: toDateColumn(input.recordedOn),
        },
      ],
      skipDuplicates: true,
    });
  }
}
