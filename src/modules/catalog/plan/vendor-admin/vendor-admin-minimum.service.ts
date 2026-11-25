import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { PlanFactsService } from '../plan-facts.service';
import { WorkspaceRepo } from '../../workspace/workspace.repo';
import { PlanRepo } from '../plan.repo';
import { MIN_VENDOR_ADMINS } from '../plan-vendor-admins.policy';
import { workingAdminCount } from './plan-vendor-admin.policy';

/**
 * How many plans in use are short of admins at the vendor (`QĐ-110k`, SPEC P21, R5 E9): the plans that need admins and have a subscription in use whose
 * profile names fewer than two who still work as IT Admins now, or no profile at all (a plan older than the rule). The same judgement as the flag
 * `vendorAdminsBelowMinimum` a reader of the subscriptions sees, counted once for each plan. Read only.
 */
@Injectable()
export class VendorAdminMinimumService {
  constructor(
    private readonly plans: PlanRepo,
    private readonly facts: PlanFactsService,
    private readonly workspaces: WorkspaceRepo,
  ) {}

  /**
   * How many workspaces that hold a subscription in use are short of administrators who work now (`QĐ-110k`, W3-12): fewer than two of those
   * recorded in the workspace. The same judgment as the flag `ADMINS_BELOW_MINIMUM` of the workspace, counted once for each workspace. Read only.
   */
  async countWorkspacesBelowMinimum(tx?: DbTx): Promise<number> {
    const workspaces = await this.workspaces.findInUse(tx);
    if (workspaces.length === 0) return 0;
    const everyone = [...new Set(workspaces.flatMap((workspace) => workspace.admins.map((admin) => admin.employeeId)))];
    const working = await this.facts.workingAdminsAmong(everyone, tx);

    return workspaces.filter((workspace) => workingAdminCount(workspace.admins, working) < MIN_VENDOR_ADMINS).length;
  }

  async countPlansBelowMinimum(tx?: DbTx): Promise<number> {
    const planIds = await this.plans.findIdsNeedingVendorAdminsInUse(tx);
    if (planIds.length === 0) return 0;
    const profiles = await this.plans.findProfilesOf(planIds, tx);
    const everyone = [
      ...new Set([...profiles.values()].flatMap((profile) => profile.members.map((member) => member.employeeId))),
    ];
    const working = await this.facts.workingAdminsAmong(everyone, tx);

    return planIds.filter(
      (planId) => workingAdminCount(profiles.get(planId)?.members ?? [], working) < MIN_VENDOR_ADMINS,
    ).length;
  }
}
