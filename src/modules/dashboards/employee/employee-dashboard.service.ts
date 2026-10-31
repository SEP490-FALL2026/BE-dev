import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationApi } from '../../organization/public/organization.api';
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
    private readonly organization: OrganizationApi,
    private readonly licensing: LicensingDashboardApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the Employee role. */
  async overview(actor: AuthenticatedPrincipal): Promise<EmployeeDashboard> {
    assertHoldsRole(actor.roles, 'EMPLOYEE');
    const today = await this.organization.businessToday();
    const facts = await this.licensing.employeeFacts(actor.employeeId, today);

    return {
      asOf: today,
      sections: {
        softwareRights: counted(facts.currentRights, 'meSoftwareRightList'),
        expiringRights: counted(facts.expiringRights, 'meSoftwareRightList'),
        requests: notAvailable('REQUEST_QUEUE_NOT_DELIVERED'),
        saasIssues: counted(facts.openSaasIssues, 'saasIssueList'),
      },
    };
  }
}
