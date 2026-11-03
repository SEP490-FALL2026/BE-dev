import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { LicensingApi } from '../../../licensing/public/licensing.api';
import { LicensingHandoverApi } from '../../../licensing/public/licensing-handover.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { EmployeeRecord } from '../../../organization/public/organization.types';
import type { ReadAccess } from '../../personnel-self-action.policy';
import { RoleDutiesService } from '../../role-duties/role-duties.service';
import type { OffboardingDetailWire } from '../offboarding.dto';
import { toDetail } from '../offboarding.mapper';
import { OffboardingRepo } from '../offboarding.repo';
import type { OffboardingRecord } from '../offboarding.types';
import { OffboardingSources } from '../offboarding-sources.service';
import { departureDetailFacts } from './offboarding-detail.policy';

const nonZero = (counts: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));

/**
 * One departure in full (`US-03-04` AC-7, AC-20): for a case that is not cancelled, what the person still holds with the
 * confirmation of each handover, the four steps, what keeps the case open and what needs a person; the minimal projection for the IT Admin.
 */
@Injectable()
export class OffboardingDetailService {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingApi,
    private readonly licensingHandovers: LicensingHandoverApi,
    private readonly catalog: CatalogApi,
    private readonly sources: OffboardingSources,
    private readonly roleDuties: RoleDutiesService,
  ) {}

  /** The case in full: for a case that is not cancelled, what the person still holds, the four steps and what keeps it open. */
  async detailOf(record: OffboardingRecord, access: ReadAccess = 'FULL'): Promise<OffboardingDetailWire> {
    const today = await this.organizationReads.businessToday();
    const live = record.state !== 'CANCELLED';
    const seats = live ? await this.licensing.listPersonalSeatsOf(record.employeeId, today) : [];
    const terminating = new Set(
      live
        ? (await this.licensing.listTerminatingAccess([record.employeeId])).map((access) => access.assignmentId)
        : [],
    );
    const duties = await this.licensingHandovers.getHandoverDutiesOf(seats.map((seat) => seat.assignmentId));
    const opened = live ? await this.repo.openedAssignmentIds(record.id) : [];
    const registered = live ? await this.sources.blockersOf(record.employeeId) : {};
    const facts = departureDetailFacts(record, { live, seats, terminating, duties, opened, registered });

    const roles = await this.rolesOf(record, live);
    const [employees, department, owned, warnings] = await this.othersOf(record, live);

    return toDetail(
      record,
      employees,
      department ?? undefined,
      {
        today,
        heldRights: facts.heldRights,
        roleFlags: roles?.map,
        workspaces: Object.fromEntries(
          (roles?.workspaces ?? []).map((duty) => [duty.planId, `${duty.applicationName} / ${duty.planName}`]),
        ),
        checklist: facts.checklist,
        blockers: facts.blockers,
        businessOwnerApplications: owned.total,
        registeredWarnings: nonZero(warnings),
      },
      access,
    );
  }

  /** What the person is for the roles they hold in the company: the flags the case shows and the workspaces they answer for. */
  private async rolesOf(record: OffboardingRecord, live: boolean) {
    if (!live) return undefined;
    const roles = await this.roleDuties.rolesOf([
      { employeeId: record.employeeId, headsDepartment: record.headHandover !== null },
    ]);

    return roles.get(record.employeeId);
  }

  /** The names, the department, whether the person owns applications and what the flows that come after warn of. */
  private othersOf(record: OffboardingRecord, live: boolean) {
    return Promise.all([
      this.employeesOf([
        record.employeeId,
        ...(record.headHandover?.successorEmployeeId ? [record.headHandover.successorEmployeeId] : []),
      ]),
      record.departmentId ? this.organizationReads.getDepartmentBrief(record.departmentId) : Promise.resolve(null),
      live ? this.catalog.getApplicationsOwnedBy(record.employeeId, 1) : Promise.resolve({ total: 0 }),
      live ? this.sources.warningsOf(record.employeeId) : Promise.resolve({}),
    ]);
  }

  private async employeesOf(ids: readonly string[]): Promise<Map<string, EmployeeRecord>> {
    const unique = [...new Set(ids)];

    return new Map((await this.organizationReads.getEmployees(unique)).map((employee) => [employee.id, employee]));
  }
}
