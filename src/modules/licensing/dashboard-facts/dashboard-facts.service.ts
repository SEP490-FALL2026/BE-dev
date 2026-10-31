import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AssignmentDepartmentRepo } from '../assignment/assignment-department.repo';
import { isExpiringSoon, rightStatusOf } from '../my-software/my-software.policy';
import type {
  DepartmentLicensingFacts,
  EmployeeLicensingFacts,
  ItAdminLicensingFacts,
} from '../public/licensing-dashboard.types';
import { DashboardFactsRepo } from './dashboard-facts.repo';

/**
 * The counts of licensing that the role overviews show (`US-12-15` AC-2, AC-3, AC-4), each the count of what an existing list answers
 * in the same scope: "my software" and the reporter's SaaS reports, the tools a department uses, and the queues an IT Admin calls "mine".
 * A right is about to end by the same rule as "my software" says so, so the two never disagree. Reads only.
 */
@Injectable()
export class DashboardFactsService {
  constructor(
    private readonly repo: DashboardFactsRepo,
    private readonly departments: AssignmentDepartmentRepo,
    private readonly organization: OrganizationApi,
  ) {}

  async employee(employeeId: string, today: BusinessDate): Promise<EmployeeLicensingFacts> {
    const { currentRights, nearEnd, openSaasIssues } = await this.repo.employee(employeeId, today);
    const expiringRights = nearEnd.filter((facts) => isExpiringSoon(facts, rightStatusOf(facts, today), today)).length;

    return { currentRights, expiringRights, openSaasIssues };
  }

  /** The seats the department uses on the business day, counted as the tools it uses are listed; null when it does not exist. */
  async department(departmentId: string, today: BusinessDate): Promise<DepartmentLicensingFacts | null> {
    const memberIds = await this.organization.getDepartmentMemberIds(departmentId, today);
    if (!memberIds) return null;
    const { total } = await this.departments.toolsOfDepartment({ memberIds, departmentId }, today, 0, 0);

    return { seatsInUse: total };
  }

  itAdmin(employeeId: string): Promise<ItAdminLicensingFacts> {
    return this.repo.itAdmin(employeeId);
  }
}
