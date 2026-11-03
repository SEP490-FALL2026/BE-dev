import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
import { RequestsDashboardApi } from '../../requests/public/requests-dashboard.api';
import { DashboardRefusedError } from '../section/dashboard-section.errors';
import {
  assertHoldsRole,
  atSource,
  counted,
  notAvailable,
  type DashboardSection,
} from '../section/dashboard-section.policy';

export interface ManagerDashboard {
  asOf: BusinessDate;
  department: { id: string; code: string; name: string };
  sections: {
    needApprovals: DashboardSection;
    departmentSoftware: DashboardSection;
    transferReviews: DashboardSection;
    ghostSeats: DashboardSection;
    spending: DashboardSection;
    spendQueue: DashboardSection;
    budgetProposals: DashboardSection;
    approvedBudgetLines: DashboardSection;
  };
}

/**
 * The overview of a head (`US-12-15` AC-3), for the one department they head on the business day and no other. The software the
 * department is granted or manages, the open reviews after a transfer and the need steps waiting for the head are counted from the lists
 * that show them; the queue of requests ready to be submitted for spending, the budget proposals and the lines of the approved version
 * are listed by their own operations, which keep the head to their department. The ghost seats (usage) and the actual cost and
 * commitments of the department (finance figures) have no source yet: each says so and never shows zero. Nothing
 * here reads a remaining budget, a budget check result, a company total or a measure of usage.
 */
@Injectable()
export class ManagerDashboardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly personnel: PersonnelDashboardApi,
    private readonly requests: RequestsDashboardApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the head role or who heads no department on the business day. */
  async overview(actor: AuthenticatedPrincipal): Promise<ManagerDashboard> {
    assertHoldsRole(actor.roles, 'MANAGER');
    const today = await this.organizationReads.businessToday();
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId, today);
    if (!headed) throw new DashboardRefusedError();
    const department = await this.organizationReads.getDepartmentBrief(headed.departmentId);
    const software = await this.licensing.departmentFacts(headed.departmentId, today);
    if (!department || !software) throw new DashboardRefusedError();
    const [reviews, needApprovals] = await Promise.all([
      this.personnel.openTransferReviews(department.id),
      this.requests.needDecisionsHeldBy(actor.employeeId),
    ]);

    return {
      asOf: today,
      department: { id: department.id, code: department.code, name: department.name },
      sections: {
        needApprovals: counted(needApprovals, 'needDecisionList'),
        departmentSoftware: counted(software.seatsInUse, 'departmentToolsInUse'),
        transferReviews: counted(reviews, 'transferReviewList'),
        ghostSeats: notAvailable('USAGE_DATA_NOT_DELIVERED'),
        spending: notAvailable('FINANCE_FIGURES_NOT_DELIVERED'),
        spendQueue: atSource('spendQueueList'),
        budgetProposals: atSource('budgetProposalList'),
        approvedBudgetLines: atSource('budgetMineLineList'),
      },
    };
  }
}
