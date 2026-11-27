import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { VendorAdminRole } from '../../public/catalog-responsibility.types';
import { PlanFactsService } from '../plan-facts.service';
import { PlanRepo } from '../plan.repo';
import { othersWorking } from './plan-vendor-admin.policy';

/**
 * The plans one person administers at the vendor and what is left of them without the person (`QĐ-110k`, SPEC P23, X-IT.6): read from the
 * workspace profiles, with the other admins of each plan judged by whether they still work as IT Admins now. Read only, in the caller's
 * transaction when it has one; a person who administers nothing has no role.
 */
@Injectable()
export class VendorAdminRolesService {
  constructor(
    private readonly plans: PlanRepo,
    private readonly facts: PlanFactsService,
  ) {}

  async of(employeeId: string, tx?: DbTx): Promise<VendorAdminRole[]> {
    // One entry for each workspace the person administers: the other administrators are those of that workspace.
    const duties = (await this.plans.findWorkspaceDuties([employeeId], tx)).filter(
      (duty): duty is typeof duty & { workspace: NonNullable<typeof duty.workspace> } => duty.workspace !== undefined,
    );
    if (duties.length === 0) return [];
    const planIds = [...new Set(duties.map((duty) => duty.planId))];
    const lookups = new Map((await this.plans.findLookups(planIds, tx)).map((plan) => [plan.id, plan]));
    const everyone = [...new Set(duties.flatMap((duty) => duty.workspace.members.map((m) => m.employeeId)))];
    const usable = await this.facts.workingAdminsAmong(everyone, tx);

    return duties.map((duty) => ({
      planId: duty.planId,
      planName: duty.planName,
      applicationId: lookups.get(duty.planId)?.applicationId ?? '',
      applicationName: duty.applicationName,
      role: duty.role === 'ADMIN' ? 'ADMIN' : 'OWNER',
      othersWorking: othersWorking(duty.workspace.members, usable, employeeId),
      workspaceId: duty.workspace.id,
      workspaceName: duty.workspace.name,
      vendorId: duty.workspace.vendorId,
      responsibleItAdminEmployeeId: duty.workspace.responsibleItAdminEmployeeId,
    }));
  }
}
