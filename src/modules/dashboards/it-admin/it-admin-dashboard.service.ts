import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DevicesApi } from '../../devices/public/devices.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OptimizationApi } from '../../optimization/public/optimization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { UsageEvidenceApi } from '../../usage/public/usage-evidence.api';
import { assertHoldsRole, atSource, counted, type DashboardSection } from '../section/dashboard-section.policy';

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
    ghostSeats: DashboardSection;
  };
}

/**
 * The overview of an IT Admin (`US-12-15` AC-4), in the scope the IT Admin works: the departments that name them in charge (and every
 * active one while nobody usable is named), the tasks and SaaS reports they are in charge of by default, as the queues call them "mine".
 * The open grant and revocation tasks, the open SaaS reports, the departures still handing over and the keys in the vault are counted;
 * the plan terms to review are listed by their own operation. `cancellationDeadlines` points at `subscriptionList`, which lists every
 * subscription and cannot filter by notice deadline: the client keeps the ones whose `noticeDeadline` is near (an open decision, see
 * `a10-it-admin-dashboard`); `subscriptionRenewalList` lists only the cases already proposed, so it is not the source either. The discrepancies
 * (people active in a vendor with no seat to cover the day, `FR-4.8`) are the open findings of the vendor usage import; the company machines whose holder has not
 * acknowledged the notice are counted from the register of the organization (`unconfirmedDevices`, the total `deviceList` answers for that state). The recommendations of wasted seats are counted as the `G2` not closed plus the `G1` open of the whole organization (`ghostSeats`).
 */
@Injectable()
export class ItAdminDashboardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly personnel: PersonnelDashboardApi,
    private readonly optimization: OptimizationApi,
    private readonly usage: UsageEvidenceApi,
    private readonly devices: DevicesApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the IT Admin role. */
  async overview(actor: AuthenticatedPrincipal): Promise<ItAdminDashboard> {
    assertHoldsRole(actor.roles, 'IT_ADMIN');
    const today = await this.organizationReads.businessToday();
    const departmentIds = await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    const work = await this.licensing.itAdminFacts(actor.employeeId);
    const handovers = await this.personnel.handingOverCases(departmentIds);
    const wastedSeats = await this.optimization.getSummary();
    const withoutSeat = await this.usage.openFindingCount();
    // US-09-01 AC-2: the machines whose holder has not acknowledged the notice, the same number `GET /devices?state=AWAITING_ACKNOWLEDGEMENT` lists.
    const organization = await this.organizationReads.getOrganization();
    const unconfirmedDevices = organization
      ? await this.devices.countByCollectionState(organization.id, 'AWAITING_ACKNOWLEDGEMENT')
      : 0;

    return {
      asOf: today,
      scope: { departments: departmentIds.length },
      sections: {
        grantTasks: counted(work.openGrantTasks, 'provisioningTaskList'),
        revocationTasks: counted(work.openRevocationTasks, 'provisioningTaskList'),
        discrepancies: counted(withoutSeat, 'usageNoAssignmentFindingList'),
        // All the subscriptions; the client filters by `noticeDeadline`. No deadline filter exists on the list (A-10 follow-up).
        cancellationDeadlines: atSource('subscriptionList'),
        licenseKeys: counted(work.keysInStore, 'licenseKeyList'),
        termsToReview: atSource('planWarningList'),
        offboardingHandovers: counted(handovers, 'offboardingCaseList'),
        unconfirmedDevices: counted(unconfirmedDevices, 'deviceList'),
        saasIssues: counted(work.openSaasIssues, 'saasIssueList'),
        ghostSeats: counted(wastedSeats.counted, 'ghostSeatRecommendationList'),
      },
    };
  }
}
