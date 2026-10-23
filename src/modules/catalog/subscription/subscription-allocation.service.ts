import { Injectable } from '@nestjs/common';
import { Page } from '../../../core/application/pagination';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FinanceService } from '../../finance/finance.service';
import type { AllocationLineInput, CostAllocationView } from '../../finance/finance.types';
import { PlanLookupService } from '../plan/plan-lookup.service';
import { SubscriptionNotFoundError, SubscriptionPlanNotFoundError } from './subscription.errors';
import { SubscriptionRepo } from './subscription.repo';
import {
  allocationApplicability,
  assertAllocatable,
  type AllocationApplicability,
} from './subscription-allocation.policy';

export interface SubscriptionAllocationView {
  subscriptionId: string;
  applicability: AllocationApplicability;
  status: 'DECLARED' | 'MISSING';
  allocation: CostAllocationView | null;
}

/**
 * The cost allocation of a subscription as the catalog routes serve it (`US-04-08`): the subscription and its plan are
 * checked here (they are catalog tables), the allocation itself, its Cost Centers and its history come from finance.
 */
@Injectable()
export class SubscriptionAllocationService {
  constructor(
    private readonly subscriptions: SubscriptionRepo,
    private readonly plans: PlanLookupService,
    private readonly finance: FinanceService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws SubscriptionNotFoundError. A subscription with no allocation is `MISSING`, not an error. */
  async get(subscriptionId: string): Promise<SubscriptionAllocationView> {
    const subscription = await this.require(subscriptionId);
    const { status, allocation } = await this.finance.costAllocationOf(subscriptionId);

    return {
      subscriptionId,
      applicability: allocationApplicability(subscription.planPricingModel),
      status,
      allocation,
    };
  }

  /**
   * Throws SubscriptionNotFoundError, SubscriptionCostAllocationNotApplicableError (a per-seat plan, or a pricing
   * model not declared) and the allocation errors of finance. An allocation equal to the current one is `changed: false`.
   * The plan is held `FOR SHARE` and the pricing model read after that, in the transaction that writes the allocation,
   * so a change of the pricing model cannot slip in between the check and the write (DB-10).
   */
  async declare(
    actor: AuthenticatedPrincipal,
    subscriptionId: string,
    input: { lines: AllocationLineInput[] },
  ): Promise<{ allocation: CostAllocationView; changed: boolean }> {
    return this.runner.run(async (tx) => {
      const found = await this.require(subscriptionId, tx);
      if (!(await this.plans.lockShared(tx, found.planId))) throw new SubscriptionPlanNotFoundError();
      const subscription = await this.require(subscriptionId, tx);
      assertAllocatable(subscription.planPricingModel);

      return this.finance.declareCostAllocation(actor, subscriptionId, input, tx);
    });
  }

  async history(subscriptionId: string, query: { page: number; pageSize: number }): Promise<Page<CostAllocationView>> {
    await this.require(subscriptionId);

    return this.finance.costAllocationHistory(subscriptionId, query);
  }

  private async require(subscriptionId: string, tx?: DbTx) {
    const subscription = await this.subscriptions.find(subscriptionId, tx);
    if (!subscription) throw new SubscriptionNotFoundError();

    return subscription;
  }
}
