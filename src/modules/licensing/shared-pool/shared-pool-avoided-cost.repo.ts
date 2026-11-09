import { Injectable } from '@nestjs/common';
import { toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AvoidedCost } from './shared-pool.policy';

/** The one writer of `pool_grant_avoided_costs`: one row for each task that granted from the pool, never changed (`QĐ-106e`). */
@Injectable()
export class SharedPoolAvoidedCostRepo {
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
