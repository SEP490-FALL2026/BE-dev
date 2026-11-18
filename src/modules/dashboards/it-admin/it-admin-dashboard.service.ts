import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { ItAdminDashboardFactsService } from './it-admin-dashboard-facts.service';
import type { DashboardProgress } from '../progress/dashboard-progress.policy';
import { DashboardProgressService } from '../progress/dashboard-progress.service';
import { assertHoldsRole, atSource, counted, type DashboardSection } from '../section/dashboard-section.policy';

export interface ItAdminDashboard {
  asOf: BusinessDate;
  scope: { departments: number };
  calendar: DashboardProgress['calendar'];
  sections: Omit<DashboardProgress, 'calendar'> & {
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
    missingInvoicePeriods: DashboardSection;
    outOfProcessRevocationsDue: DashboardSection;
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
 * The periods of a right paid by the month or the year whose invoice is five working days late are counted in the requests of the departments in scope and the subscriptions the caller answers for (`missingInvoicePeriods`, `PI-2`).
 * The cases outside the process on a company asset whose revocation is due now (nobody to wait for, or the ten working days of the wait passed) are counted for the whole
 * organization (`outOfProcessRevocationsDue`, `US-13-05` AC-23); the cases are not of a department.
 * The progress of the departures and the transfers of those departments (`departures`, `transfers`), the seats of the shared pools got back in the tasks
 * the IT Admin is in charge of (`seatsReturned`) and the plans short of admins at the vendor (`plansBelowVendorAdminMinimum`) come from `DashboardProgressService`
 * (SPEC P21); `offboardingHandovers` stays one release beside them (the cases still handing over, as before) and is dropped after.
 */
@Injectable()
export class ItAdminDashboardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly personnel: PersonnelDashboardApi,
    private readonly progress: DashboardProgressService,
    private readonly facts: ItAdminDashboardFactsService,
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
    // The progress of the departures and the transfers of the departments in scope; the seats counted are the tasks this IT Admin is in charge of (SPEC P21).
    const { calendar, ...progress } = await this.progress.read(today, {
      departmentIds,
      responsibleEmployeeId: actor.employeeId,
    });
    const organization = await this.organizationReads.getOrganization();
    const counts = await this.facts.read({
      organizationId: organization?.id ?? null,
      employeeId: actor.employeeId,
      departmentIds,
    });

    return {
      asOf: today,
      scope: { departments: departmentIds.length },
      calendar,
      sections: {
        ...progress,
        grantTasks: counted(work.openGrantTasks, 'provisioningTaskList'),
        revocationTasks: counted(work.openRevocationTasks, 'provisioningTaskList'),
        discrepancies: counted(counts.withoutSeat, 'usageNoAssignmentFindingList'),
        // All the subscriptions; the client filters by `noticeDeadline`. No deadline filter exists on the list (A-10 follow-up).
        cancellationDeadlines: atSource('subscriptionList'),
        licenseKeys: counted(work.keysInStore, 'licenseKeyList'),
        termsToReview: atSource('planWarningList'),
        offboardingHandovers: counted(handovers, 'offboardingCaseList'),
        unconfirmedDevices: counted(counts.unconfirmedDevices, 'deviceList'),
        saasIssues: counted(work.openSaasIssues, 'saasIssueList'),
        ghostSeats: counted(counts.wastedSeats, 'ghostSeatRecommendationList'),
        missingInvoicePeriods: counted(counts.missingInvoicePeriods, 'purchaseInvoiceMissingPeriodList'),
        // No list answers this number alone: the cases are listed by `outOfProcessCaseList`, each saying in `revocation` whether it is due.
        outOfProcessRevocationsDue: counted(counts.outOfProcessRevocationsDue, null),
      },
    };
  }
}
