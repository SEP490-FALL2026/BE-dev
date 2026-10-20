import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { normalizeDisplayName } from '../../../core/display-name';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationService } from '../organization.service';
import { ProjectService } from '../project/project.service';
import { DepartmentNotFoundError, DepartmentOutOfScopeError } from './department.errors';
import { DepartmentRepo } from './department.repo';
import {
  DEPARTMENT_HEAD_HISTORY_LIMIT,
  DepartmentMemberRecord,
  DepartmentProfileView,
  DepartmentRecord,
  DepartmentStatus,
  DepartmentView,
  DepartmentWarning,
  DepartmentWarningItem,
} from './department.types';

/**
 * What the department profiles show (`US-03-06`, `US-01-11`): the list, one profile, its people and the warnings. An IT
 * Admin reads every department; a department head reads only the one they head (AC-17). Nothing here writes.
 */
@Injectable()
export class DepartmentQueryService {
  constructor(
    private readonly repo: DepartmentRepo,
    private readonly organization: OrganizationService,
    private readonly projects: ProjectService,
    private readonly identity: IdentityAccessService,
  ) {}

  async list(query: {
    status?: DepartmentStatus;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<DepartmentView>> {
    const search = query.search ? normalizeDisplayName(query.search) : '';
    const { items, total } = await this.repo.list({
      ...(query.status ? { status: query.status } : {}),
      ...(search ? { search } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.toViews(items), total, query.page, query.pageSize);
  }

  /** The profile of one department. A department head sees only their own (US-03-06 AC-17). */
  async profile(principal: AuthenticatedPrincipal, id: string): Promise<DepartmentProfileView> {
    const record = await this.repo.findById(id);
    if (!record) throw new DepartmentNotFoundError();
    await this.assertMayRead(principal, id);

    const [view] = await this.toViews([record]);

    return {
      ...view,
      headHistory: await this.organization.getDepartmentHeadHistory(id, DEPARTMENT_HEAD_HISTORY_LIMIT),
      projects: await this.projects.list(id),
    };
  }

  async members(
    principal: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<DepartmentMemberRecord>> {
    if (!(await this.repo.findById(id))) throw new DepartmentNotFoundError();
    await this.assertMayRead(principal, id);

    const today = await this.organization.businessToday();
    const { items, total } = await this.repo.members(undefined, id, today, {
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Every active department that needs attention, for the IT Admin and the Super Admin (US-03-06 AC-9, AC-15). */
  async warnings(): Promise<DepartmentWarningItem[]> {
    const today = await this.organization.businessToday();
    const [withoutHead, withItAdmin] = await Promise.all([
      this.repo.activeDepartmentsWithoutHead(today),
      this.repo.activeDepartmentsWithItAdmin(),
    ]);
    const usable = await this.identity.findUsableItAdminEmployeeIds(
      withItAdmin.flatMap((department) => (department.itAdminEmployeeId ? [department.itAdminEmployeeId] : [])),
    );
    const items: DepartmentWarningItem[] = [
      ...withoutHead.map((department) => ({
        departmentId: department.id,
        code: department.code,
        name: department.name,
        warning: 'MISSING_HEAD' as const,
      })),
      ...withItAdmin
        .filter(
          (department) =>
            department.itAdminEmployeeId === null ||
            department.itAdminStatus !== 'ACTIVE' ||
            !usable.has(department.itAdminEmployeeId),
        )
        .map((department) => ({
          departmentId: department.id,
          code: department.code,
          name: department.name,
          warning: 'MISSING_IT_ADMIN' as const,
        })),
    ];

    return items.sort((a, b) => (a.code === b.code ? a.warning.localeCompare(b.warning) : a.code < b.code ? -1 : 1));
  }

  /** IT Admin sees any department; a department head sees only the one they head (AC-17). */
  private async assertMayRead(principal: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    if (principal.roles.includes('IT_ADMIN')) return;

    const today = await this.organization.businessToday();
    const headed = await this.organization.getHeadedDepartment(principal.employeeId, today);
    if (headed?.departmentId !== departmentId) throw new DepartmentOutOfScopeError();
  }

  private async toViews(records: DepartmentRecord[]): Promise<DepartmentView[]> {
    const today = await this.organization.businessToday();
    const ids = records.map((record) => record.id);
    const [heads, counts] = await Promise.all([
      this.organization.getDepartmentHeads(ids, today),
      this.repo.memberCounts(ids, today),
    ]);
    const itAdminIds = records.flatMap((record) => (record.itAdmin ? [record.itAdmin.employeeId] : []));
    const usable = await this.identity.findUsableItAdminEmployeeIds(itAdminIds);

    return records.map((record) => {
      const head = heads.get(record.id) ?? null;
      const itAdminUsable =
        record.itAdmin !== null && record.itAdmin.employeeStatus === 'ACTIVE' && usable.has(record.itAdmin.employeeId);
      const warnings: DepartmentWarning[] =
        record.status === 'ACTIVE'
          ? [...(head ? [] : (['MISSING_HEAD'] as const)), ...(itAdminUsable ? [] : (['MISSING_IT_ADMIN'] as const))]
          : [];

      return { ...record, head, memberCount: counts.get(record.id) ?? 0, warnings, itAdminUsable };
    });
  }
}
