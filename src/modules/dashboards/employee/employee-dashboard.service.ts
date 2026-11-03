import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { assertHoldsRole, counted, notAvailable, type DashboardSection } from '../section/dashboard-section.policy';

export interface EmployeeDashboard {
  asOf: BusinessDate;
  sections: {
    softwareRights: DashboardSection;
    expiringRights: DashboardSection;
    requests: DashboardSection;
    saasIssues: DashboardSection;
  };
}

/**
 * The overview of an Employee (`US-12-15` AC-2): the software granted to them (K4 included), the time-limited rights about to end, their
 * requests waiting and their results, and their SaaS error reports, each about the caller only. The rights and reports are counted from
 * the lists that show them ("my software", the reports the person sent); the list of the person's own submitted requests is not delivered
 * yet, so that section says so and shows no number. No cost, no seat count of a subscription and nobody else's data is read.
 */
@Injectable()
export class EmployeeDashboardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly requests: RequestsDashboardApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the Employee role. */
  async overview(actor: AuthenticatedPrincipal): Promise<EmployeeDashboard> {
    assertHoldsRole(actor.roles, 'EMPLOYEE');
    const today = await this.organizationReads.businessToday();
    const [facts, openRequests] = await Promise.all([
      this.licensing.employeeFacts(actor.employeeId, today),
      this.requests.openRequestsSentBy(actor),
    ]);

    return {
      asOf: today,
      sections: {
        softwareRights: counted(facts.currentRights, 'meSoftwareRightList'),
        expiringRights: counted(facts.expiringRights, 'meSoftwareRightList'),
        requests: openRequests === null ? notAvailable('NO_DATA_SOURCE') : counted(openRequests, 'meAccessRequestList'),
        saasIssues: counted(facts.openSaasIssues, 'saasIssueList'),
      },
    };
  }
}
