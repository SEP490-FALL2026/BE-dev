import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { WorkspaceDuty } from '../../catalog/catalog.types';
import { CatalogService } from '../../catalog/catalog.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import type { RoleFlag, RoleFlagMap } from '../personnel.types';
import { flagMap, flagsOf } from './role-duties.policy';

/** A person to read the roles of; whether they head the department they leave is told by their case. */
export interface RoleDutyInput {
  employeeId: string;
  headsDepartment: boolean;
}

/** The roles a person holds: the flags and what the alert names (the departments they are IT Admin in charge of, the workspaces). */
export interface RoleView {
  flags: RoleFlag[];
  /** The same flags as the wire gives them: every flag with whether the person holds it. */
  map: RoleFlagMap;
  itAdminDepartmentCodes: string[];
  workspaces: WorkspaceDuty[];
}

/**
 * Which roles the people who leave hold (`US-03-04` AC-11, AC-27, AC-28): read from the facades of the identity, the organization and
 * the catalog, a fixed number of statements for any number of people (`LD-07`), in the caller's transaction when it has one. Reads only:
 * the alert and the snapshot are written by the hook, and nothing here changes a role, a step or an account.
 */
@Injectable()
export class RoleDutiesService {
  constructor(
    private readonly identity: IdentityAccessService,
    private readonly organization: OrganizationHistoryService,
    private readonly catalog: CatalogService,
  ) {}

  async rolesOf(people: readonly RoleDutyInput[], tx?: DbTx): Promise<Map<string, RoleView>> {
    const ids = [...new Set(people.map((person) => person.employeeId))];
    if (ids.length === 0) return new Map();
    const grants = await this.identity.listRoleHoldersAmong(ids, tx);
    const approval = await this.identity.getApprovalRoleHolders(tx);
    const departments = await this.organization.getDepartmentsInChargeOf(ids, tx);
    const duties = await this.catalog.getWorkspaceDutiesOf(ids, tx);
    const heads = new Set(people.filter((person) => person.headsDepartment).map((person) => person.employeeId));

    return new Map(
      ids.map((employeeId) => {
        const held = grants.get(employeeId) ?? [];
        const inCharge = departments.get(employeeId) ?? [];
        const workspaces = duties.filter((duty) => duty.employeeId === employeeId);
        const flags = flagsOf({
          superAdmin: held.includes('SUPER_ADMIN'),
          finance: held.includes('FINANCE'),
          spendingApprover: approval.spendingApproverEmployeeId === employeeId,
          substituteApprover: approval.conflictSubstituteEmployeeId === employeeId,
          fallbackApprover: approval.fallbackApproverEmployeeId === employeeId,
          itAdminDepartments: inCharge.length,
          headsDepartment: heads.has(employeeId),
          workspaces: workspaces.length,
        });

        return [
          employeeId,
          {
            flags,
            map: flagMap(flags),
            itAdminDepartmentCodes: inCharge.map((department) => department.code),
            workspaces,
          },
        ];
      }),
    );
  }

  /** The same for the wire: every flag with whether the person holds it. */
  async flagMapsOf(people: readonly RoleDutyInput[], tx?: DbTx): Promise<Map<string, RoleFlagMap>> {
    const roles = await this.rolesOf(people, tx);

    return new Map([...roles].map(([employeeId, view]) => [employeeId, view.map]));
  }

  /** How many workspaces of K2 plans the person still owns or administers: what keeps their departure from closing. */
  async workspaceCountOf(employeeId: string, tx?: DbTx): Promise<number> {
    return (await this.catalog.getWorkspaceDutiesOf([employeeId], tx)).length;
  }
}
