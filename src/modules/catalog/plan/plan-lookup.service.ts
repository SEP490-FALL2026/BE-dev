import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PlanSummary } from '../catalog.types';
import { PlanRepo } from './plan.repo';
import type { PlanLookup } from './plan.types';

export type LockedPlan = PlanLookup;

/** What the subscriptions and the terms of a plan need to know about it. */
@Injectable()
export class PlanLookupService {
  constructor(private readonly plans: PlanRepo) {}

  /** The plan, locked `FOR SHARE` until the transaction ends so its kind cannot change meanwhile; null if absent. */
  lockShared(tx: DbTx, id: string): Promise<LockedPlan | null> {
    return this.plans.lockSharedLookup(tx, id);
  }

  /** The plans with these ids by name, with their application: for the views that list seats. */
  summaries(ids: readonly string[]): Promise<PlanSummary[]> {
    return this.plans.findSummaries(ids);
  }

  /** The plans declared under an application: for the rules and the views that look at a software through its plans. */
  plansOfApplication(
    applicationId: string,
  ): Promise<{ id: string; name: string; provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5' }[]> {
    return this.plans.findOfApplication(applicationId);
  }

  /** The plans of an application locked until the transaction ends: nothing is granted under them meanwhile. */
  lockPlansOfApplication(tx: DbTx, applicationId: string): Promise<void> {
    return this.plans.lockOfApplication(tx, applicationId);
  }

  /** How many plans the catalog holds. */
  count(): Promise<number> {
    return this.plans.count();
  }

  /** The plan without a lock, for a read; null if absent. */
  find(id: string): Promise<PlanLookup | null> {
    return this.plans.findLookup(id);
  }
}
