import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDashboardApi } from '../../licensing/public/licensing-dashboard.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelDashboardApi } from '../../personnel/public/personnel-dashboard.api';
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
 * department is granted or manages and the open reviews after a transfer are counted from the lists that show them; the queue of
 * requests ready to be submitted for spending, the budget proposals and the lines of the approved version are listed by their own
 * operations, which keep the head to their department. The requests waiting for the head's need decision, the ghost seats (usage) and
 * the actual cost and commitments of the department (finance figures) have no source yet: each says so and never shows zero. Nothing
 * here reads a remaining budget, a budget check result, a company total or a measure of usage.
 */
@Injectable()
export class ManagerDashboardService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly licensing: LicensingDashboardApi,
    private readonly personnel: PersonnelDashboardApi,
  ) {}

  /** Throws DashboardRefusedError for a caller without the head role or who heads no department on the business day. */
  async overview(actor: AuthenticatedPrincipal): Promise<ManagerDashboard> {
    assertHoldsRole(actor.roles, 'MANAGER');
    const today = await this.organization.businessToday();
    const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);
    if (!headed) throw new DashboardRefusedError();
    const department = await this.organization.getDepartmentBrief(headed.departmentId);
    const software = await this.licensing.departmentFacts(headed.departmentId, today);
    if (!department || !software) throw new DashboardRefusedError();
    const reviews = await this.personnel.openTransferReviews(department.id);

    return {
      asOf: today,
      department: { id: department.id, code: department.code, name: department.name },
      sections: {
        needApprovals: notAvailable('REQUEST_QUEUE_NOT_DELIVERED'),
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
