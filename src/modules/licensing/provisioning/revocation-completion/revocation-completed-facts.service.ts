import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import type { PlanRevocationInfo } from '../../../catalog/public/catalog.types';
import { AssignmentChainRepo } from '../../assignment/assignment-chain.repo';
import { SeatTargetNotFoundError } from '../../public/licensing.errors';
import type { RevocationCompletedFacts } from '../../public/licensing.types';
import { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';

/**
 * What the listeners of the end of a revocation are told of the right that was taken back: the plan that says how it is taken away, and,
 * once the work is done, the request that made the right, the day it ends and what is paid for it, so the money held for it can be given
 * back by the day (`RV-07`, spec `qd103-commitment-release-on-revocation`). Reads only.
 */
@Injectable()
export class RevocationCompletedFactsReader {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly chains: AssignmentChainRepo,
    private readonly reasons: ProvisioningTaskReasonRepo,
  ) {}

  /** How the seat of this plan is taken away. Throws SeatTargetNotFoundError. */
  async planOf(tx: DbTx, planId: string): Promise<PlanRevocationInfo> {
    const [plan] = await this.catalog.getPlanRevocationInfo([planId], tx);
    if (!plan) throw new SeatTargetNotFoundError('PLAN');

    return plan;
  }

  async completedOf(
    tx: DbTx,
    task: { id: string; assignmentId: string },
    done: Pick<RevocationCompletedFacts, 'endedOn' | 'paidThroughOn'> & {
      provisioningType: RevocationCompletedFacts['provisioningType'];
    },
  ): Promise<RevocationCompletedFacts> {
    return {
      grantRequestId: await this.chains.grantRequestOfChain(tx, task.assignmentId),
      chainAssignmentIds: await this.chains.chainOf(tx, task.assignmentId),
      provisioningType: done.provisioningType,
      endedOn: done.endedOn,
      paidThroughOn: done.paidThroughOn,
      sources: (await this.reasons.listOf([task.id], tx)).map((reason) => reason.source),
    };
  }
}
