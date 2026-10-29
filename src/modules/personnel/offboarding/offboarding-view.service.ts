import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { EmployeeRecord } from '../../organization/public/organization.types';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { readAccessOf, type ReadAccess } from '../policies/personnel-self-action.policy';
import { RoleDutiesService } from '../role-duties/role-duties.service';
import { OffboardingSources } from './offboarding-sources.service';
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
 * What is read of the departures (F12): the list, one case in full with its checklist, what keeps it open and what needs a person,
 * the rights the person still holds with the confirmation of each, and the log of what was done. The Super Admin reads everything;
 * the IT Admin reads the technical case of the departments they are in charge of or stand in for (one with no usable IT Admin named
 * is every IT Admin's), without the basis, the handover of the head or the reason of a cancellation, and the rest do not exist for
 * them (404); nobody else reads them. The log carries reasons, so it is the
 * Super Admin's alone. A page costs the same statements whatever its size (`LD-07`): the names, the seats, the confirmations and the
 * counts are each read once for the page.
 */
@Injectable()
export class OffboardingViewService {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly lists: OffboardingListRepo,
    private readonly organization: OrganizationApi,
    private readonly licensing: LicensingApi,
    private readonly catalog: CatalogApi,
    private readonly sources: OffboardingSources,
    private readonly roleDuties: RoleDutiesService,
    private readonly identity: IdentityAccessApi,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    filter: Omit<OffboardingListFilter, 'today' | 'departmentIds'>,
  ): Promise<Paged<OffboardingSummaryWire>> {
    const { departmentIds } = await this.scopeOf(actor);
    const today = await this.organization.businessToday();
    const { items, total } = await this.lists.list({ ...filter, ...(departmentIds ? { departmentIds } : {}), today });
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

  async get(actor: AuthenticatedPrincipal, id: string): Promise<OffboardingDetailWire> {
    const { access, departmentIds } = await this.scopeOf(actor);
    const record = await this.repo.find(id);
    if (!record || (departmentIds && !departmentIds.includes(record.departmentId)))
      throw new OffboardingRefusedError('NOT_FOUND');

    return this.detailOf(record, access);
  }

  /** The case in full: for a case that is not cancelled, what the person still holds, the four steps and what keeps it open. */
  async detailOf(record: OffboardingRecord, access: ReadAccess = 'FULL'): Promise<OffboardingDetailWire> {
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
    const registered = live ? await this.sources.blockersOf(record.employeeId) : {};
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
      live ? this.sources.warningsOf(record.employeeId) : Promise.resolve({}),
    ]);

    return toDetail(
      record,
      employees,
      department ?? undefined,
      {
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
      },
      access,
    );
  }

  /** One page of the rights the person still holds, oldest first, each with the confirmation of its handover and its task. */
  async rights(
    actor: AuthenticatedPrincipal,
    id: string,
    page: { page: number; pageSize: number },
  ): Promise<Paged<OffboardingRightWire>> {
    const { departmentIds } = await this.scopeOf(actor);
    const record = await this.repo.find(id);
    if (!record || (departmentIds && !departmentIds.includes(record.departmentId)))
      throw new OffboardingRefusedError('NOT_FOUND');
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

  async changes(
    actor: AuthenticatedPrincipal,
    id: string,
    page: { page: number; pageSize: number },
  ): Promise<Paged<OffboardingChangeWire>> {
    if (readAccessOf(actor) !== 'FULL') throw new PersonnelAccessRefusedError('FORBIDDEN');
    if (!(await this.repo.find(id))) throw new OffboardingRefusedError('NOT_FOUND');
    const { items, total } = await this.repo.listChanges(id, page);

    return paged(items.map(toChange), total, page);
  }

  /** What the caller may read: everything, or the departments they are in charge of or stand in for and the minimal projection; nothing is a refusal. */
  private async scopeOf(actor: AuthenticatedPrincipal): Promise<{ access: ReadAccess; departmentIds?: string[] }> {
    const access = readAccessOf(actor);
    if (access === 'NONE') throw new PersonnelAccessRefusedError('FORBIDDEN');

    return access === 'FULL'
      ? { access }
      : {
          access,
          departmentIds: await this.organization.getItAdminScope(actor.employeeId, (ids) =>
            this.identity.findUsableItAdminEmployeeIds(ids),
          ),
        };
  }

  private async employeesOf(ids: readonly string[]): Promise<Map<string, EmployeeRecord>> {
    const unique = [...new Set(ids)];

    return new Map((await this.organization.getEmployees(unique)).map((employee) => [employee.id, employee]));
  }
}
