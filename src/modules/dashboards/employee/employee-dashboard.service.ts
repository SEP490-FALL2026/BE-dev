import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { counted, type DashboardSection } from '../section/dashboard-section.policy';

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
 * requests that are not over, and their SaaS error reports, each about the caller only. The rights, requests and reports are counted from
 * the lists that show them ("my software", "my requests" with the `open` view, the reports the person sent); every signed-in account can read it, with zero when no request is open. No cost, no seat count of a subscription and nobody else's data is read.
 */
@Injectable()
export class EmployeeDashboardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly requests: RequestsDashboardApi,
  ) {}

  async overview(actor: AuthenticatedPrincipal): Promise<EmployeeDashboard> {
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
        requests: counted(openRequests, 'meAccessRequestList'),
        saasIssues: counted(facts.openSaasIssues, 'saasIssueList'),
      },
    };
  }
}
