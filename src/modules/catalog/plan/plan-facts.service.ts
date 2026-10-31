import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ApplicationPlans } from '../catalog-entry/application-plans.types';
import type { PlanRevocationInfo, PlanSummary, WorkspaceDuty } from '../public/catalog.types';
import { PlanRepo } from './plan.repo';
import type { PlanLookup } from './plan.types';

export type LockedPlan = PlanLookup;

/** What the subscriptions and the terms of a plan need to know about it, and what the application needs to know of its plans. */
@Injectable()
export class PlanFactsService implements ApplicationPlans {
  constructor(private readonly plans: PlanRepo) {}

  /** The plan, locked `FOR SHARE` until the transaction ends so its kind cannot change meanwhile; null if absent. */
  lockShared(tx: DbTx, id: string): Promise<LockedPlan | null> {
    return this.plans.lockSharedLookup(tx, id);
  }

  /** The plans with these ids as `LockedPlan`s without a lock, in one read. */
  lookups(ids: readonly string[], tx?: DbTx): Promise<LockedPlan[]> {
    return this.plans.findLookups(ids, tx);
  }

  /** How the seats of these plans are taken away: the kind of provisioning and the note of the removal. */
  revocationInfos(ids: readonly string[], tx?: DbTx): Promise<PlanRevocationInfo[]> {
    return this.plans.findRevocationInfos(ids, tx);
  }

  /** The plans with these ids by name, with their application: for the views that list seats. */
  summaries(ids: readonly string[]): Promise<PlanSummary[]> {
    return this.plans.findSummaries(ids);
  }

  /** The plans of the other applications of the same functional group (`US-05-04` AC-3): bounded, empty with no group. */
  similarIds(planId: string, limit: number, tx?: DbTx): Promise<string[]> {
    return this.plans.findSimilarIds(planId, limit, tx);
  }

  /** Whose software the plan is: the vendor of its application, for the tax estimate of a price. */
  vendorIdOf(planId: string, tx?: DbTx): Promise<string | null> {
    return this.plans.findVendorId(planId, tx);
  }

  /** Who owns the application of the plan now: a person the organization may since have lost (`INV-06`). */
  businessOwnerIdOf(planId: string, tx?: DbTx): Promise<string | null> {
    return this.plans.findBusinessOwnerId(planId, tx);
  }

  /** The plans declared under an application: for the rules and the views that look at a software through its plans. */
  plansOfApplication(
    applicationId: string,
    tx?: DbTx,
  ): Promise<{ id: string; name: string; provisioningType: 'K1' | 'K2' | 'K3' | 'K4' | 'K5' }[]> {
    return this.plans.findOfApplication(applicationId, tx);
  }

  /** The plans of an application locked until the transaction ends: nothing is granted under them meanwhile. */
  lockPlansOfApplication(tx: DbTx, applicationId: string): Promise<void> {
    return this.plans.lockOfApplication(tx, applicationId);
  }

  /** The workspaces these employees own or administer, with the plan and application by name (one read, `US-03-04` AC-28). */
  workspaceDutiesOf(employeeIds: readonly string[], tx?: DbTx): Promise<WorkspaceDuty[]> {
    return this.plans.findWorkspaceDuties(employeeIds, tx);
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
