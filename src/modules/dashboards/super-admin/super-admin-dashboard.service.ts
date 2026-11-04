import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import {
  assertHoldsRole,
  atSource,
  counted,
  notAvailable,
  type DashboardSection,
} from '../section/dashboard-section.policy';

export interface SuperAdminDashboard {
  asOf: BusinessDate;
  sections: {
    congestion: DashboardSection;
    backgroundJobs: DashboardSection;
    approverConfiguration: DashboardSection;
    superAdminRole: DashboardSection;
    departmentsWithoutHead: DashboardSection;
    departmentsWithoutItAdmin: DashboardSection;
    accountCandidates: DashboardSection;
    personnelNotices: DashboardSection;
  };
}

/**
 * The overview of the Super Admin (`US-12-15` AC-7): the operation of the system and the organization, never a seat, an approval or a
 * total of spending. The departments without a head or without a usable IT Admin in charge (the same judgement as the warnings of the
 * departments) and the notices of heads waiting to be handled are counted; the congestion board, the configuration of the approvers,
 * the state of the Super Admin role and the people who can get an account are read by their own operations. Background tasks have no
 * record to read yet: the section says so and never shows zero.
 */
@Injectable()
export class SuperAdminDashboardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly personnel: PersonnelDashboardApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the Super Admin role. */
  async overview(actor: AuthenticatedPrincipal): Promise<SuperAdminDashboard> {
    assertHoldsRole(actor.roles, 'SUPER_ADMIN');
    const today = await this.organizationReads.businessToday();
    const facts = await this.organizationReads.getOnboardingFacts();
    const usable = await this.identity.findUsableItAdminEmployeeIds(
      facts.departmentsByItAdmin.flatMap((department) =>
        department.itAdminEmployeeId ? [department.itAdminEmployeeId] : [],
      ),
    );
    const withoutItAdmin = facts.departmentsByItAdmin.filter(
      (department) =>
        department.itAdminEmployeeId === null ||
        department.itAdminStatus !== 'ACTIVE' ||
        !usable.has(department.itAdminEmployeeId),
    ).length;
    const notices = await this.personnel.noticesAwaitingHandling();

    return {
      asOf: today,
      sections: {
        congestion: atSource('stepCongestionList'),
        backgroundJobs: notAvailable('NO_DATA_SOURCE'),
        approverConfiguration: atSource('appUserList'),
        superAdminRole: atSource('superAdminWatchGet'),
        departmentsWithoutHead: counted(facts.departmentsWithoutHead.length, 'departmentWarningList'),
        departmentsWithoutItAdmin: counted(withoutItAdmin, 'departmentWarningList'),
        accountCandidates: atSource('accountCandidatesList'),
        personnelNotices: counted(notices, 'personnelNoticeList'),
      },
    };
  }
}
