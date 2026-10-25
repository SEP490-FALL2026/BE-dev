import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { CatalogService } from '../../catalog/catalog.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import type { EmployeeRecord } from '../../organization/organization.types';
import { RoleDutiesService } from '../role-duties/role-duties.service';
import { OffboardingBlockerRegistry } from './offboarding-blocker.registry';
import type {
  OffboardingChangeWire,
  OffboardingDetailWire,
  OffboardingRightWire,
  OffboardingSummaryWire,
} from './offboarding.dto';
import { OffboardingRefusedError } from './offboarding.errors';
import { toChange, toDetail, toRight, toSummary } from './offboarding.mapper';
import { blockersOf, checklistOf } from './offboarding.policy';
import { OffboardingListRepo } from './offboarding-list.repo';
import { OffboardingRepo } from './offboarding.repo';
import type { OffboardingListFilter, OffboardingRecord } from './offboarding.types';

export interface Paged<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const paged = <T>(items: T[], total: number, page: { page: number; pageSize: number }): Paged<T> => ({
  items,
  pagination: {
    page: page.page,
    pageSize: page.pageSize,
    totalItems: total,
    totalPages: Math.ceil(total / page.pageSize),
  },
});

const nonZero = (counts: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));

/**
 * What the IT Admin reads of the departures: the list, one case in full with its checklist, what keeps it open and what needs a
 * person, the rights the person still holds with the confirmation of each, and the log of what was done. A page costs the same
 * statements whatever its size (`LD-07`): the names, the seats, the confirmations and the counts are each read once for the page.
 */
@Injectable()
export class OffboardingViewService {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly lists: OffboardingListRepo,
    private readonly organization: OrganizationService,
    private readonly licensing: LicensingService,
    private readonly catalog: CatalogService,
    private readonly registry: OffboardingBlockerRegistry,
    private readonly roleDuties: RoleDutiesService,
  ) {}

  async list(filter: Omit<OffboardingListFilter, 'today'>): Promise<Paged<OffboardingSummaryWire>> {
    const today = await this.organization.businessToday();
    const { items, total } = await this.lists.list({ ...filter, today });
    const employees = await this.employeesOf(items.map((item) => item.employeeId));
    const held = await this.licensing.countPersonalSeatsOf(
      items.filter((item) => item.state !== 'CANCELLED').map((item) => item.employeeId),
      today,
    );

    const roles = await this.roleDuties.flagMapsOf(items.filter((item) => item.state !== 'CANCELLED'));

    return paged(
      items.map((item) =>
        toSummary(item, employees, {
          today,
          heldRights: held.get(item.employeeId) ?? 0,
          roleFlags: roles.get(item.employeeId),
        }),
      ),
      total,
      filter,
    );
  }

  async get(id: string): Promise<OffboardingDetailWire> {
    const record = await this.repo.find(id);
    if (!record) throw new OffboardingRefusedError('NOT_FOUND');

    return this.detailOf(record);
  }

  /** The case in full: for a case that is not cancelled, what the person still holds, the four steps and what keeps it open. */
  async detailOf(record: OffboardingRecord): Promise<OffboardingDetailWire> {
    const today = await this.organization.businessToday();
    const live = record.state !== 'CANCELLED';
    const seats = live ? await this.licensing.listPersonalSeatsOf(record.employeeId, today) : [];
    const terminating = new Set(
      live
        ? (await this.licensing.listTerminatingAccess([record.employeeId])).map((access) => access.assignmentId)
        : [],
    );
    const duties = await this.licensing.getHandoverDutiesOf(seats.map((seat) => seat.assignmentId));
    const opened = live ? await this.repo.openedAssignmentIds(record.id) : [];
    const held = new Set(seats.map((seat) => seat.assignmentId));
    const closed = record.closedAt !== null;
    const registered = live ? await this.registry.blockersOf(record.employeeId) : {};
    const accessRunsOn = seats.filter((seat) => terminating.has(seat.assignmentId)).length;
    const openRights = seats.length - accessRunsOn;

    const roles = live
      ? (
          await this.roleDuties.rolesOf([
            { employeeId: record.employeeId, headsDepartment: record.headHandover !== null },
          ])
        ).get(record.employeeId)
      : undefined;
    const [employees, department, owned, warnings] = await Promise.all([
      this.employeesOf([
        record.employeeId,
        ...(record.headHandover?.successorEmployeeId ? [record.headHandover.successorEmployeeId] : []),
      ]),
      this.organization.getDepartmentBrief(record.departmentId),
      live ? this.catalog.getApplicationsOwnedBy(record.employeeId, 1) : Promise.resolve({ total: 0 }),
      live ? this.registry.warningsOf(record.employeeId) : Promise.resolve({}),
    ]);

    return toDetail(record, employees, department ?? undefined, {
      today,
      heldRights: seats.length,
      roleFlags: roles?.map,
      workspaces: Object.fromEntries(
        (roles?.workspaces ?? []).map((duty) => [duty.planId, `${duty.applicationName} / ${duty.planName}`]),
      ),
      checklist: live
        ? checklistOf({
            abrupt: record.abrupt,
            lockRecorded: record.accountLockAt !== null,
            pendingDuties: duties.filter((duty) => duty.status === 'OPEN' && !duty.flaggedUnconfirmed).length,
            heldRights: seats.length,
            withoutTask: seats.filter((seat) => seat.revocation === null).length,
            accessRunsOn,
            opened: opened.length,
            released: opened.filter((assignmentId) => !held.has(assignmentId)).length,
          })
        : null,
      blockers: blockersOf({
        state: record.state,
        closed,
        lockRecorded: record.accountLockAt !== null,
        openRights,
        accessRunsOn,
        registered,
      }),
      businessOwnerApplications: owned.total,
      registeredWarnings: nonZero(warnings),
    });
  }

  /** One page of the rights the person still holds, oldest first, each with the confirmation of its handover and its task. */
  async rights(id: string, page: { page: number; pageSize: number }): Promise<Paged<OffboardingRightWire>> {
    const record = await this.repo.find(id);
    if (!record) throw new OffboardingRefusedError('NOT_FOUND');
    const today = await this.organization.businessToday();
    const seats =
      record.state === 'CANCELLED' ? [] : await this.licensing.listPersonalSeatsOf(record.employeeId, today);
    const slice = seats.slice((page.page - 1) * page.pageSize, page.page * page.pageSize);
    const [duties, terminating] = await Promise.all([
      this.licensing.getHandoverDutiesOf(slice.map((seat) => seat.assignmentId)),
      slice.length > 0 ? this.licensing.listTerminatingAccess([record.employeeId]) : Promise.resolve([]),
    ]);
    const employees = await this.employeesOf(
      duties.flatMap((duty) => (duty.confirmerEmployeeId ? [duty.confirmerEmployeeId] : [])),
    );
    const dutyOf = new Map(duties.map((duty) => [duty.assignmentId, duty]));
    const runsOn = new Map<string, BusinessDate>(
      terminating.map((access) => [access.assignmentId, access.accessUntil]),
    );

    return paged(
      slice.map((seat) =>
        toRight(seat, {
          duty: dutyOf.get(seat.assignmentId),
          accessRunsOnUntil: runsOn.get(seat.assignmentId),
          employees,
        }),
      ),
      seats.length,
      page,
    );
  }

  async changes(id: string, page: { page: number; pageSize: number }): Promise<Paged<OffboardingChangeWire>> {
    if (!(await this.repo.find(id))) throw new OffboardingRefusedError('NOT_FOUND');
    const { items, total } = await this.repo.listChanges(id, page);

    return paged(items.map(toChange), total, page);
  }

  private async employeesOf(ids: readonly string[]): Promise<Map<string, EmployeeRecord>> {
    const unique = [...new Set(ids)];

    return new Map((await this.organization.getEmployees(unique)).map((employee) => [employee.id, employee]));
  }
}
