import { Injectable } from '@nestjs/common';
import { Page, cutHistory, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { normalizeDisplayName } from '../../../core/display-name';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeTechnicalView } from '../public/organization.types';
import { OrganizationContextService } from '../organization-context.service';
import { DepartmentRecordService } from '../department/department-record.service';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import {
  DepartmentForbiddenError,
  DepartmentNotFoundError,
  DepartmentOutOfScopeError,
} from '../department/department.errors';
import {
  DepartmentReadVerdict,
  departmentListScope,
  departmentReadVerdict,
  memberReadVerdict,
  technicalReadVerdict,
} from '../department/department.policy';
import { DepartmentRepo } from '../department/department.repo';
import { DepartmentTechnicalMembersRepo } from './department-technical-members.repo';
import {
  DEPARTMENT_HEAD_HISTORY_LIMIT,
  DepartmentHeadRecord,
  DepartmentMemberRecord,
  DepartmentProfileView,
  DepartmentRecord,
  DepartmentView,
  DepartmentWarning,
  DepartmentWarningItem,
} from '../department/department.types';
import { DepartmentStatus, HeadPeriodRecord } from '../organization-structure.types';

/** The person named to take over from a day after `today`: the earliest head period that has not begun, if there is one. */
function pendingSuccessor(periods: readonly HeadPeriodRecord[], today: BusinessDate): DepartmentHeadRecord | null {
  const pending = periods
    .filter((period) => period.validFrom > today)
    .sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0];

  return pending
    ? {
        employeeId: pending.employeeId,
        employeeCode: pending.employeeCode,
        fullName: pending.fullName,
        since: pending.validFrom,
      }
    : null;
}

/**
 * What the department profiles show (`US-03-06`, `US-01-11`): the list, one profile, its people and the warnings. The Super Admin
 * reads every department in full (`QĐ-87b(4)`); an IT Admin only those they are in charge of or stand in for, and the technical
 * minimum of their people; a department head the one they head (AC-17). Every rule of who reads what is in
 * `department.policy.ts`, run here whatever the route let through. Nothing here writes.
 */
@Injectable()
export class DepartmentQueryService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly technical: DepartmentTechnicalMembersRepo,
    private readonly context: OrganizationContextService,
    private readonly departments: DepartmentRecordService,
    private readonly employeeAccounts: EmployeeAccountsHook,
  ) {}

  /** The Super Admin reads all; an IT Admin the departments in their scope. Throws DepartmentForbiddenError for any other role. */
  async list(
    principal: AuthenticatedPrincipal,
    query: { status?: DepartmentStatus; search?: string; page: number; pageSize: number },
  ): Promise<Page<DepartmentView>> {
    const scope = departmentListScope(principal.roles) === 'ALL' ? undefined : await this.scopeOf(principal);
    const search = query.search ? normalizeDisplayName(query.search) : '';
    const { items, total } = await this.repo.list({
      ...(scope ? { ids: [...scope] } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { search } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.toViews(items), total, query.page, query.pageSize);
  }

  /** The profile of one department. Throws DepartmentNotFoundError (also for an IT Admin outside their scope), DepartmentOutOfScopeError or DepartmentForbiddenError. */
  async profile(principal: AuthenticatedPrincipal, id: string): Promise<DepartmentProfileView> {
    this.requireAReadingRole(principal);
    const record = await this.repo.findById(id);
    if (!record) throw new DepartmentNotFoundError();
    this.enforce(
      departmentReadVerdict({
        roles: principal.roles,
        headsThisDepartment: await this.headsThisDepartment(principal, id),
        inItAdminScope: await this.inItAdminScope(principal, id),
      }),
    );

    const [view] = await this.toViews([record]);
    const today = await this.context.businessToday();
    const heads = cutHistory(
      await this.departments.headHistory(undefined, id, DEPARTMENT_HEAD_HISTORY_LIMIT + 1),
      DEPARTMENT_HEAD_HISTORY_LIMIT,
    );

    return {
      ...view,
      headHistory: heads.items,
      headHistoryHasMore: heads.hasMore,
      successor: pendingSuccessor(heads.items, today),
    };
  }

  /** The people of the department in full, for the Super Admin and for the head of that department. */
  async members(
    principal: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<DepartmentMemberRecord>> {
    this.requireAReadingRole(principal);
    if (!(await this.repo.findById(id))) throw new DepartmentNotFoundError();
    this.enforce(
      memberReadVerdict({ roles: principal.roles, headsThisDepartment: await this.headsThisDepartment(principal, id) }),
    );

    const today = await this.context.businessToday();
    const { items, total } = await this.repo.members(undefined, id, today, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * What an IT Admin may read of the people of a department in their scope: code, name, work state and since when, and no more
   *. A department outside their scope is answered as if it did not exist.
   */
  async technicalMembers(
    principal: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<EmployeeTechnicalView>> {
    this.requireAReadingRole(principal);
    if (!principal.roles.includes('IT_ADMIN')) throw new DepartmentForbiddenError();
    if (!(await this.repo.findById(id))) throw new DepartmentNotFoundError();
    this.enforce(
      technicalReadVerdict({ roles: principal.roles, inItAdminScope: await this.inItAdminScope(principal, id) }),
    );

    const today = await this.context.businessToday();
    const { items, total } = await this.technical.page(id, today, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /**
   * One page of the active departments that need attention, for the Super Admin, who gives them a head and an IT Admin (US-03-06
   * AC-9, AC-15), and for an IT Admin, those in their scope. By code then warning. Whether an IT Admin is usable is the identity
   * capability's to say, so the warnings of all active departments are worked out from two light reads of the same moment and the
   * page is cut from them.
   */
  async warnings(
    principal: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<DepartmentWarningItem>> {
    const scope = departmentListScope(principal.roles) === 'ALL' ? undefined : await this.scopeOf(principal);
    const today = await this.context.businessToday();
    const [withoutHead, withItAdmin] = await Promise.all([
      this.repo.activeDepartmentsWithoutHead(today),
      this.repo.activeDepartmentsWithItAdmin(),
    ]);
    const usable = await this.employeeAccounts
      .get()
      .findUsableItAdminEmployeeIds(
        withItAdmin.flatMap((department) => (department.itAdminEmployeeId ? [department.itAdminEmployeeId] : [])),
      );
    const visible = (id: string) => scope === undefined || scope.has(id);
    const items: DepartmentWarningItem[] = [
      ...withoutHead
        .filter((department) => visible(department.id))
        .map((department) => ({
          departmentId: department.id,
          code: department.code,
          name: department.name,
          warning: 'MISSING_HEAD' as const,
        })),
      ...withItAdmin
        .filter(
          (department) =>
            visible(department.id) &&
            (department.itAdminEmployeeId === null ||
              department.itAdminStatus !== 'ACTIVE' ||
              !usable.has(department.itAdminEmployeeId)),
        )
        .map((department) => ({
          departmentId: department.id,
          code: department.code,
          name: department.name,
          warning: 'MISSING_IT_ADMIN' as const,
        })),
    ];

    items.sort((a, b) => (a.code === b.code ? a.warning.localeCompare(b.warning) : a.code < b.code ? -1 : 1));
    const start = (query.page - 1) * query.pageSize;

    return pageOf(items.slice(start, start + query.pageSize), items.length, query.page, query.pageSize);
  }

  // --- who may read ---------------------------------------------------------------------

  /** A caller with none of the three roles reads nothing of departments, before anything is looked up. */
  private requireAReadingRole(principal: AuthenticatedPrincipal): void {
    if (!['SUPER_ADMIN', 'IT_ADMIN', 'MANAGER'].some((role) => principal.roles.includes(role))) {
      throw new DepartmentForbiddenError();
    }
  }

  private enforce(verdict: DepartmentReadVerdict): void {
    if (verdict === 'NOT_FOUND') throw new DepartmentNotFoundError();
    if (verdict === 'OUT_OF_SCOPE') throw new DepartmentOutOfScopeError();
    if (verdict === 'FORBIDDEN') throw new DepartmentForbiddenError();
  }

  private async headsThisDepartment(principal: AuthenticatedPrincipal, departmentId: string): Promise<boolean> {
    if (!principal.roles.includes('MANAGER')) return false;
    const headed = await this.departments.headedDepartment(principal.employeeId, await this.context.businessToday());

    return headed?.departmentId === departmentId;
  }

  private async inItAdminScope(principal: AuthenticatedPrincipal, departmentId: string): Promise<boolean> {
    if (!principal.roles.includes('IT_ADMIN')) return false;

    return (await this.scopeOf(principal)).has(departmentId);
  }

  /**
   * The departments an IT Admin may read: those they are named in charge of (retired ones too), and the active ones nobody usable is
   * in charge of, whose technical work falls to every IT Admin.
   */
  private async scopeOf(principal: AuthenticatedPrincipal): Promise<ReadonlySet<string>> {
    return new Set(
      await this.departments.itAdminScopeOf(principal.employeeId, (ids) =>
        this.employeeAccounts.get().findUsableItAdminEmployeeIds(ids),
      ),
    );
  }

  private async toViews(records: DepartmentRecord[]): Promise<DepartmentView[]> {
    const today = await this.context.businessToday();
    const ids = records.map((record) => record.id);
    const [heads, counts] = await Promise.all([
      this.departments.headsOn(ids, today),
      this.repo.memberCounts(ids, today),
    ]);
    const itAdminIds = records.flatMap((record) => (record.itAdmin ? [record.itAdmin.employeeId] : []));
    const usable = await this.employeeAccounts.get().findUsableItAdminEmployeeIds(itAdminIds);

    return records.map((record) => {
      const head = heads.get(record.id) ?? null;
      const itAdminUsable =
        record.itAdmin !== null && record.itAdmin.employeeStatus === 'ACTIVE' && usable.has(record.itAdmin.employeeId);
      // A department with no Cost Center in use yet is still a department: its finance configuration is incomplete (`QĐ-87d(1)`).
      const warnings: DepartmentWarning[] =
        record.status === 'ACTIVE'
          ? [
              ...(head ? [] : (['MISSING_HEAD'] as const)),
              ...(itAdminUsable ? [] : (['MISSING_IT_ADMIN'] as const)),
              ...(record.costCenter ? [] : (['MISSING_COST_CENTER'] as const)),
            ]
          : [];

      return { ...record, head, memberCount: counts.get(record.id) ?? 0, warnings, itAdminUsable };
    });
  }
}
