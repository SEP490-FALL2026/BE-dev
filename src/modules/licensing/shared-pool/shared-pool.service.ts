import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SharedPoolAvoidedCostRepo } from './shared-pool-avoided-cost.repo';
import { SharedPoolCapacityRepo } from './shared-pool-capacity.repo';
import { avoidedCostOf, judgePurchase, type PoolStock, type PurchaseDecision } from './shared-pool.policy';

type ProvisioningType = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/**
 * The shared pool of a plan (`QĐ-103d`): what is free in it, whether a purchase may be recorded with a grant, and the cost avoided by a
 * grant taken from it. Reads run in the transaction of the grant, after the subscription and plan locks of the grant are taken, so the
 * count cannot change between the check and the write. Throws the errors of the purchase policy.
 */
@Injectable()
export class SharedPoolService {
  constructor(
    private readonly catalog: CatalogApi,
    private readonly capacityRepo: SharedPoolCapacityRepo,
    private readonly avoidedCosts: SharedPoolAvoidedCostRepo,
  ) {}

  /** What the subscriptions of the plan hold today: free seats are the seats bought less the assignments in force. */
  async stockOf(tx: DbTx, planId: string, today: BusinessDate): Promise<PoolStock> {
    const subscriptions = await this.catalog.getGrantableSubscriptions(planId, today, tx);
    const occupancy = await this.capacityRepo.occupancyOf(
      tx,
      subscriptions.map((subscription) => subscription.subscriptionId),
      today,
    );
    let free = 0;
    let inRevocation = 0;
    const freeSubscriptionIds: string[] = [];
    for (const subscription of subscriptions) {
      const taken = occupancy.get(subscription.subscriptionId);
      const left = Math.max(0, (subscription.purchasedQuantity ?? 0) - (taken?.occupied ?? 0));
      free += left;
      inRevocation += taken?.inRevocation ?? 0;
      if (left > 0) freeSubscriptionIds.push(subscription.subscriptionId);
    }

    return { free, inRevocation, freeSubscriptionIds };
  }

  /**
   * Whether the purchase the IT Admin asks for with a grant may be recorded (`BR-MF1-09a`, `BR-MF1-09b`). A grant with no purchase reads
   * nothing and is not judged here: the seats of its subscription are guarded by the database.
   */
  async judgePurchase(
    tx: DbTx,
    input: {
      planId: string;
      provisioningType: ProvisioningType;
      today: BusinessDate;
      purchase: { reason?: string } | undefined;
    },
  ): Promise<PurchaseDecision> {
    const countable =
      input.purchase !== undefined && (input.provisioningType === 'K2' || input.provisioningType === 'K4');
    const stock = countable ? await this.stockOf(tx, input.planId, input.today) : null;

    return judgePurchase({ provisioningType: input.provisioningType, purchase: input.purchase, stock });
  }

  /**
   * Records the cost avoided when the task of a grant taken from the pool is completed (`BR-MF1-09c`): only when nothing was bought for
   * it, once for the task, and only for a plan of the K2 or K4 kind whose subscription has a price. Changes no commitment or budget.
   */
  async recordAvoided(
    tx: DbTx,
    input: {
      organizationId: string;
      completedOn: BusinessDate;
      task: {
        id: string;
        assignmentId: string;
        requestId: string;
        planId: string;
        subscriptionId: string | null;
        purchased: boolean;
      };
    },
  ): Promise<void> {
    const { task } = input;
    if (task.purchased || task.subscriptionId === null) return;
    const target = await this.catalog.findSeatTarget({ planId: task.planId });
    if (target?.provisioningType !== 'K2' && target?.provisioningType !== 'K4') return;

    const cost = avoidedCostOf({
      provisioningType: target.provisioningType,
      completedOn: input.completedOn,
      price: await this.catalog.getSubscriptionPrice(task.subscriptionId, tx),
    });
    if (cost === null) return;

    await this.avoidedCosts.record(tx, {
      organizationId: input.organizationId,
      provisioningTaskId: task.id,
      assignmentId: task.assignmentId,
      requestId: task.requestId,
      planId: task.planId,
      recordedOn: input.completedOn,
      cost,
    });
  }
}
