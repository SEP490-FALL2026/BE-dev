import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import type { BusinessDate } from '../../../../core/business-date';
import type {
  GrantCompletion,
  GrantedSeatOfRequest,
  OpenGrantTask,
  SeatRootsOfRequests,
} from '../../public/licensing-open-grants.types';
import { OpenGrantTaskRepo } from './open-grant-task.repo';

/**
 * The grants of a person that are not finished, with the plan of each (`US-03-04` AC-24): what the IT Admin sees beside the record of a
 * departure. Nothing here changes a task; closing the request the grant answers for is the one thing that cancels it. The names are read
 * once for the page, so the cost is the same whatever its size.
 */
@Injectable()
export class OpenGrantTaskService {
  constructor(
    private readonly repo: OpenGrantTaskRepo,
    private readonly catalog: CatalogApi,
  ) {}

  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenGrantTask[]; total: number }> {
    const { items, total } = await this.repo.pageOf(employeeId, page, tx);
    const plans = new Map(
      (await this.catalog.getPlanSummaries([...new Set(items.map((item) => item.planId))])).map((plan) => [
        plan.planId,
        plan,
      ]),
    );

    return {
      items: items.flatMap((item) => {
        const plan = plans.get(item.planId);

        return plan
          ? [
              {
                taskId: item.taskId,
                status: item.status,
                requestId: item.requestId,
                assignmentId: item.assignmentId,
                plan: {
                  planId: plan.planId,
                  planName: plan.planName,
                  applicationId: plan.applicationId,
                  applicationName: plan.applicationName,
                },
                createdAt: item.createdAt,
              },
            ]
          : [];
      }),
      total,
    };
  }

  /** The seats of these requests still held on `onDate`, along their chains (`BR-MF1-09e`): what the commitment of 01/01 counts. */
  heldSeatsOfRequests(roots: SeatRootsOfRequests, onDate: BusinessDate, tx?: DbTx): Promise<GrantedSeatOfRequest[]> {
    return this.repo.heldSeatsOfRequests(roots, onDate, tx);
  }

  grantCompletionsOf(requestIds: readonly string[], tx?: DbTx): Promise<Map<string, GrantCompletion>> {
    return this.repo.grantCompletionsOf(requestIds, tx);
  }
}
