import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import {
  assertHoldsRole,
  atSource,
  counted,
  notAvailable,
  type DashboardSection,
} from '../section/dashboard-section.policy';

export interface ItAdminDashboard {
  asOf: BusinessDate;
  scope: { departments: number };
  sections: {
    grantTasks: DashboardSection;
    revocationTasks: DashboardSection;
    discrepancies: DashboardSection;
    cancellationDeadlines: DashboardSection;
    licenseKeys: DashboardSection;
    termsToReview: DashboardSection;
    offboardingHandovers: DashboardSection;
    unconfirmedDevices: DashboardSection;
    saasIssues: DashboardSection;
  };
}

/**
 * The overview of an IT Admin (`US-12-15` AC-4), in the scope the IT Admin works: the departments that name them in charge (and every
 * active one while nobody usable is named), the tasks and SaaS reports they are in charge of by default, as the queues call them "mine".
 * The open grant and revocation tasks, the open SaaS reports, the departures still handing over and the keys in the vault are counted;
 * the plan terms to review are listed by their own operation. `cancellationDeadlines` points at `subscriptionList`, which lists every
 * subscription and cannot filter by notice deadline: the client keeps the ones whose `noticeDeadline` is near (an open decision, see
 * `a10-it-admin-dashboard`); `subscriptionRenewalList` lists only the cases already proposed, so it is not the source either. The discrepancies
 * between sources (usage data) and the company machines without a confirmation (device registry) have no source yet: each says so and
 * never shows zero.
 */
@Injectable()
export class ItAdminDashboardService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly personnel: PersonnelDashboardApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the IT Admin role. */
  async overview(actor: AuthenticatedPrincipal): Promise<ItAdminDashboard> {
    assertHoldsRole(actor.roles, 'IT_ADMIN');
    const today = await this.organization.businessToday();
    const departmentIds = await this.organization.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    const work = await this.licensing.itAdminFacts(actor.employeeId);
    const handovers = await this.personnel.handingOverCases(departmentIds);

    return {
      asOf: today,
      scope: { departments: departmentIds.length },
      sections: {
        grantTasks: counted(work.openGrantTasks, 'provisioningTaskList'),
        revocationTasks: counted(work.openRevocationTasks, 'provisioningTaskList'),
        discrepancies: notAvailable('USAGE_DATA_NOT_DELIVERED'),
        // All the subscriptions; the client filters by `noticeDeadline`. No deadline filter exists on the list (A-10 follow-up).
        cancellationDeadlines: atSource('subscriptionList'),
        licenseKeys: counted(work.keysInStore, 'licenseKeyList'),
        termsToReview: atSource('planWarningList'),
        offboardingHandovers: counted(handovers, 'offboardingCaseList'),
        unconfirmedDevices: notAvailable('DEVICE_REGISTRY_NOT_DELIVERED'),
        saasIssues: counted(work.openSaasIssues, 'saasIssueList'),
      },
    };
  }
}
