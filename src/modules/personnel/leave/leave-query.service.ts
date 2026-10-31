import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { readAccessOf, type ReadAccess } from '../personnel-self-action.policy';
import { LeaveRefusedError } from './leave.errors';
import type { LeaveChangeWire, LeaveDetailWire, LeaveSummaryWire } from './leave.dto';
import { toChange, toDetail, toSummary } from './leave.mapper';
import { LeaveRepo } from './leave.repo';
import type { LeaveInterval } from '../public/personnel.types';
import type { LeaveRecord } from './leave.types';

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

/**
 * Reads long leaves: the Super Admin reads all of them in full; the IT Admin only the minimal projection (no basis) of the
 * leaves of people in the departments they are in charge of or stand in for (one with no usable IT Admin named is every IT
 * Admin's), and the rest do not exist for them (404); nobody else reads them. The
 * log carries the basis of every day, so it is the Super Admin's alone.
 */
@Injectable()
export class LeaveQueryService {
  constructor(
    private readonly leaves: LeaveRepo,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** One page of summaries; the names of the page are read in one statement whatever the page size. */
  async list(
    actor: AuthenticatedPrincipal,
    filter: {
      status?: 'ACTIVE' | 'ENDED';
      employeeId?: string;
      overdueReturn?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<Paged<LeaveSummaryWire>> {
    const { employeeIds } = await this.scopeOf(actor);
    const today = await this.organization.businessToday();
    const { items, total } = await this.leaves.list({ ...filter, ...(employeeIds ? { employeeIds } : {}), today });
    const employees = await this.employeesOf(items.map((item) => item.employeeId));

    return paged(
      items.map((item) => toSummary(item, employees, today)),
      total,
      filter,
    );
  }

  async get(actor: AuthenticatedPrincipal, id: string): Promise<LeaveDetailWire> {
    const { access, employeeIds } = await this.scopeOf(actor);
    const record = await this.leaves.find(id);
    if (!record || (employeeIds && !employeeIds.includes(record.employeeId))) throw new LeaveRefusedError('NOT_FOUND');

    return this.detailOf(record, access);
  }

  async detailOf(record: LeaveRecord, access: ReadAccess = 'FULL'): Promise<LeaveDetailWire> {
    const today = await this.organization.businessToday();

    return toDetail(record, await this.employeesOf([record.employeeId]), today, access);
  }

  async listChanges(
    actor: AuthenticatedPrincipal,
    id: string,
    page: { page: number; pageSize: number },
  ): Promise<Paged<LeaveChangeWire>> {
    if (readAccessOf(actor) !== 'FULL') throw new PersonnelAccessRefusedError('FORBIDDEN');
    if (!(await this.leaves.find(id))) throw new LeaveRefusedError('NOT_FOUND');
    const { items, total } = await this.leaves.listChanges(id, page);

    return paged(items.map(toChange), total, page);
  }

  /** The leaves of the people that overlap the days `from` to `to`, read in one statement whatever the number of people. */
  intervalsOf(employeeIds: readonly string[], from: BusinessDate, to: BusinessDate): Promise<LeaveInterval[]> {
    return this.leaves.intervals(employeeIds, from, to);
  }

  /**
   * What the caller may read: everything, or the people in the departments they are in charge of or stand in for today and the minimal projection;
   * a caller who reads nothing is refused.
   */
  private async scopeOf(actor: AuthenticatedPrincipal): Promise<{ access: ReadAccess; employeeIds?: string[] }> {
    const access = readAccessOf(actor);
    if (access === 'NONE') throw new PersonnelAccessRefusedError('FORBIDDEN');
    if (access === 'FULL') return { access };
    const departments = await this.organization.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    const members = await Promise.all(departments.map((id) => this.organization.getDepartmentMemberIds(id)));

    return { access, employeeIds: members.flatMap((ids) => ids ?? []) };
  }

  private async employeesOf(ids: string[]) {
    const employees = await this.organization.getEmployees([...new Set(ids)]);

    return new Map(employees.map((employee) => [employee.id, employee]));
  }
}
