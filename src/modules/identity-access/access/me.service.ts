import { Injectable } from '@nestjs/common';
import { businessDateAt, toDateColumn, type BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccountRecordService } from '../accounts/account-record.service';
import type { AppRole } from '../public/identity-access.types';

export interface MeView {
  appUserId: string;
  loginEmail: string;
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    department: { code: string; name: string } | null;
    unplaced: boolean;
    jobTitle: string | null;
  };
  /** The roles granted to the account and still in force (US-01-01 AC-17). */
  roles: AppRole[];
  /** The department the caller heads today when they hold MANAGER; null otherwise. */
  managerScope: { departmentId: string; departmentCode: string; departmentName: string } | null;
}

@Injectable()
export class MeService {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The caller's own identity, granted roles and Manager scope. Roles come from the principal resolved this request. */
  async get(principal: AuthenticatedPrincipal): Promise<MeView> {
    const [loginEmail, organization] = await Promise.all([
      this.accounts.findLoginEmail(principal.appUserId),
      this.organizationReads.getOrganization(),
    ]);
    // The placement in force today, in the organization's own calendar.
    const day = businessDateAt(new Date(), organization?.timeZone ?? 'UTC');
    const profile = await this.organizationReads.getEmployeeProfile(principal.employeeId, toDateColumn(day));
    if (loginEmail === null || profile === null) {
      throw new Error('An authenticated principal lost its account or employee record');
    }

    const roles = [...principal.directRoles] as AppRole[];

    return {
      appUserId: principal.appUserId,
      loginEmail,
      employee: profile,
      roles,
      managerScope: await this.managerScopeOf(principal, day),
    };
  }

  /**
   * The department the caller heads on the business day of the profile, when the roles that authorize them include MANAGER (the grant and a head
   * period that contains today); null for everyone else, and then nothing is read.
   */
  private async managerScopeOf(principal: AuthenticatedPrincipal, day: BusinessDate): Promise<MeView['managerScope']> {
    if (!principal.roles.includes('MANAGER')) return null;
    const headed = await this.organizationReads.getHeadedDepartment(principal.employeeId, day);
    const brief = headed ? await this.organizationReads.getDepartmentBrief(headed.departmentId) : null;

    return brief ? { departmentId: brief.id, departmentCode: brief.code, departmentName: brief.name } : null;
  }
}
