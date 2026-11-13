import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ApplicationPlans } from '../catalog-entry/application-plans.types';
import type { BusinessDate } from '../../../core/business-date';
import type { PlanRevocationInfo, PlanSummary, PlanUsageRate, WorkspaceDuty } from '../public/catalog.types';
import { kpi3Percent } from './plan.policy';
import { PlanRepo } from './plan.repo';
import { PlanUsageRepo } from './plan-usage.repo';
import { notYetBlocked } from './vendor-admin-roles.policy';
import type { PlanLookup, WorkspaceMemberRecord } from './plan.types';

export type LockedPlan = PlanLookup;

/** Who administers a plan at the vendor as its profile records them (`QĐ-110k`, `QĐ-110u`): the people with their roles, the email of the company account and the note. */
export interface VendorAdminsRecord {
  members: WorkspaceMemberRecord[];
  ownerAccountEmail: string | null;
  adminNote: string | null;
}

/** What the subscriptions and the terms of a plan need to know about it, and what the application needs to know of its plans. */
@Injectable()
export class PlanFactsService implements ApplicationPlans {
  constructor(
    private readonly plans: PlanRepo,
    private readonly usage: PlanUsageRepo,
    private readonly identity: IdentityAccessApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Replaces what is known of the usage of the plans of the organization with what one pass of the usage rules found (`KPI-3`). */
  replaceUsageRates(
    tx: DbTx,
    organizationId: string,
    assessedOn: BusinessDate,
    rates: readonly PlanUsageRate[],
  ): Promise<void> {
    return this.usage.replaceAll(tx, organizationId, assessedOn, rates);
  }

  /** `KPI-3` in percent of each of these plans that has one (priced per seat, judged by the last pass, seats bought); the others are absent. */
  async kpi3Of(planIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    const figures = new Map<string, number>();
    for (const row of await this.usage.activeAndPurchased(planIds, tx)) {
      const kpi3 = kpi3Percent(row.activeSeats, row.purchasedSeats);
      if (kpi3 !== null) figures.set(row.planId, kpi3);
    }

    return figures;
  }

  /** The plan, locked `FOR SHARE` until the transaction ends so its kind cannot change meanwhile; null if absent. */
  lockShared(tx: DbTx, id: string): Promise<LockedPlan | null> {
    return this.plans.lockSharedLookup(tx, id);
  }

  /** The plan, locked `FOR UPDATE` until the transaction ends; null if absent. */
  lockExclusive(tx: DbTx, id: string): Promise<LockedPlan | null> {
    return this.plans.lockExclusiveLookup(tx, id);
  }

  /**
   * Which of these people work now as IT Admins at the vendor (`QĐ-110k`): an account that can act whose person a departure does not already refuse
   * (the flag of a plan falls "from the block", before the person has left). One read of the accounts and one of the blocks, whatever the number.
   */
  async workingAdminsAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const usable = await this.identity.findUsableItAdminEmployeeIds(employeeIds, tx);
    if (usable.size === 0) return usable;
    const blocks = await this.identity.findDepartureBlocks([...usable]);
    const today = await this.organizationReads.businessToday(new Date(), tx);

    return notYetBlocked(
      usable,
      new Map([...blocks].map(([employeeId, block]) => [employeeId, block.blockedFrom])),
      today,
    );
  }

  /** Who administers each of these plans at the vendor, in one read, by plan; a plan whose profile was never recorded is absent. */
  async vendorAdminsOf(planIds: readonly string[], tx?: DbTx): Promise<Map<string, VendorAdminsRecord>> {
    const profiles = await this.plans.findProfilesOf(planIds, tx);

    return new Map(
      [...profiles].map(([planId, profile]) => [
        planId,
        { members: profile.members, ownerAccountEmail: profile.ownerAccountEmail, adminNote: profile.adminNote },
      ]),
    );
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

  /** The vendor of the application of each of the plans, in one read: for a page of rows that each show whose software it is. */
  vendorIdsOf(planIds: readonly string[]): Promise<Map<string, string | null>> {
    return this.plans.findVendorIds(planIds);
  }

  /** The IT Admin responsible for the application of the plan now (`QĐ-111g`); a person the organization may since have lost. */
  responsibleItAdminIdOf(planId: string, tx?: DbTx): Promise<string | null> {
    return this.plans.findResponsibleItAdminId(planId, tx);
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
