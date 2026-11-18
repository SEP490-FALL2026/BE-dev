import { Injectable } from '@nestjs/common';
import { businessDateAt, monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import { instantAtWallClock } from '../../../core/working-days';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentDepartmentRepo } from '../assignment/assignment-department.repo';
import { isExpiringSoon, rightStatusOf } from '../my-software/my-software.policy';
import type {
  DepartmentLicensingFacts,
  EmployeeLicensingFacts,
  ItAdminLicensingFacts,
  RevocationTaskFacts,
  SeatsReturnedFacts,
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
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async employee(employeeId: string, today: BusinessDate): Promise<EmployeeLicensingFacts> {
    const { currentRights, nearEnd, openSaasIssues } = await this.repo.employee(employeeId, today);
    const expiringRights = nearEnd.filter((facts) => isExpiringSoon(facts, rightStatusOf(facts, today), today)).length;

    return { currentRights, expiringRights, openSaasIssues };
  }

  /** The seats the department uses on the business day, counted as the tools it uses are listed; null when it does not exist. */
  async department(departmentId: string, today: BusinessDate): Promise<DepartmentLicensingFacts | null> {
    const memberIds = await this.organizationReads.getDepartmentMemberIds(departmentId, today);
    if (!memberIds) return null;
    const { total } = await this.departments.toolsOfDepartment({ memberIds, departmentId }, today, 0, 0);

    return { seatsInUse: total };
  }

  itAdmin(employeeId: string): Promise<ItAdminLicensingFacts> {
    return this.repo.itAdmin(employeeId);
  }

  /** The seats of the shared pools taken back for a departure or a transfer and handed out again from the first of this month to `today` (SPEC P21). */
  async seatsReturned(today: BusinessDate, responsibleEmployeeId?: string): Promise<SeatsReturnedFacts> {
    const zone = (await this.organizationReads.getOrganization())?.timeZone ?? 'UTC';
    const { start, nextStart } = monthBoundsOf(today);

    return this.repo.seatsReturned({
      from: instantAtWallClock({ date: start, msOfDay: 0 }, zone),
      to: instantAtWallClock({ date: nextStart, msOfDay: 0 }, zone),
      fromDay: start,
      toDay: nextStart,
      responsibleEmployeeId,
    });
  }

  /** The tasks of revocation a departure or a transfer asked for, with the day each was completed in the calendar of the organization (SPEC P22). */
  async revocationTasksOf(
    referenceKind: 'OFFBOARDING_CASE' | 'DEPARTMENT_TRANSFER',
    referenceIds: readonly string[],
  ): Promise<RevocationTaskFacts[]> {
    if (referenceIds.length === 0) return [];
    const zone = (await this.organizationReads.getOrganization())?.timeZone ?? 'UTC';

    return (await this.repo.revocationTasksOf(referenceKind, referenceIds)).map((row) => ({
      referenceId: row.referenceId,
      status: row.status,
      completedOn: row.completedAt ? businessDateAt(row.completedAt, zone) : null,
      responsibleEmployeeId: row.responsibleEmployeeId,
    }));
  }
}
