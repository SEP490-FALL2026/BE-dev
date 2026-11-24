import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ActingItAdminsResult } from '../../organization/public/organization.types';
import { DeviceReturnTaskNotFoundError } from './device-return-task.errors';
import { toReturnTaskItem, type DepartmentBrief, type EmployeeBrief } from './device-return-task.mapper';
import { DeviceReturnTaskRepo } from './device-return-task.repo';
import type { ReturnTaskListRow } from './device-return-task.types';

export interface DeviceReturnTaskListInput {
  scope: 'MINE' | 'ALL';
  state: 'OPEN' | 'CLOSED' | 'ALL';
  overdue?: boolean | undefined;
  page: number;
  pageSize: number;
}

/**
 * Reads paged offboarding device return tasks and enriches each page with batched department, employee, and
 * current acting IT Admin lookups (always excluding the departing employee from acting for their own task).
 */
@Injectable()
export class DeviceReturnTaskQueryService {
  constructor(
    private readonly repo: DeviceReturnTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async list(actor: AuthenticatedPrincipal, input: DeviceReturnTaskListInput, now: Date = new Date()) {
    const organization = await this.requireOrganization();
    const today = await this.organizationReads.businessToday(now);
    const scopeFilter = await this.resolveScopeFilter(actor, input.scope);

    const { rows, total } = await this.repo.page(
      {
        organizationId: organization.id,
        ...scopeFilter,
        state: input.state,
        overdue: input.overdue,
        today,
      },
      (input.page - 1) * input.pageSize,
      input.pageSize,
    );

    const context = await this.loadEnrichment(rows);

    return {
      items: rows.map((row) => toReturnTaskItem(row, { today, ...context })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  async get(id: string, now: Date = new Date()) {
    const organization = await this.requireOrganization();
    const today = await this.organizationReads.businessToday(now);
    const row = await this.repo.findDetailById(organization.id, id);
    if (!row) throw new DeviceReturnTaskNotFoundError();
    const context = await this.loadEnrichment([row]);

    return toReturnTaskItem(row, { today, ...context });
  }

  private async resolveScopeFilter(
    actor: AuthenticatedPrincipal,
    scope: 'MINE' | 'ALL',
  ): Promise<{ departmentIds?: readonly string[]; includeTaskIds?: readonly string[]; excludeEmployeeId?: string }> {
    if (actor.roles.includes('SUPER_ADMIN')) return {};
    const usableAmong = (ids: readonly string[]) => this.identity.findUsableItAdminEmployeeIds(ids);
    const [departmentIds, unplacedTaskIds] = await Promise.all([
      scope === 'MINE'
        ? this.organizationReads.getItAdminActingScope(actor.employeeId, usableAmong)
        : this.organizationReads.getItAdminScope(actor.employeeId, usableAmong),
      this.organizationReads.findActiveUnplacedWorkIdsForDesignee(actor.employeeId, 'DEVICE_RETURN_TASK'),
    ]);

    return {
      departmentIds,
      ...(unplacedTaskIds.length > 0 ? { includeTaskIds: unplacedTaskIds } : {}),
      ...(scope === 'MINE' ? { excludeEmployeeId: actor.employeeId } : {}),
    };
  }

  private async loadEnrichment(rows: readonly ReturnTaskListRow[]): Promise<{
    employees: Map<string, EmployeeBrief>;
    departments: Map<string, DepartmentBrief>;
    actingByDepartment: Map<string, ActingItAdminsResult>;
    unplacedDesignees: Map<string, string | null>;
  }> {
    const departmentIds = [...new Set(rows.map((row) => row.departmentId).filter((id): id is string => id !== null))];
    const unplacedRefs = rows
      .filter((row) => row.departmentId === null)
      .map((row) => ({
        workKind: 'DEVICE_RETURN_TASK' as const,
        workId: row.id,
        employeeId: row.employeeId,
      }));
    const [briefs, actingByDepartment, unplacedDesignees] = await Promise.all([
      departmentIds.length > 0 ? this.organizationReads.getDepartmentBriefs(departmentIds) : Promise.resolve([]),
      departmentIds.length > 0
        ? this.organizationReads.itAdminsActingFor(departmentIds, (ids) =>
            this.identity.findUsableItAdminEmployeeIds(ids),
          )
        : Promise.resolve(new Map<string, ActingItAdminsResult>()),
      unplacedRefs.length > 0
        ? this.organizationReads.itAdminsActingForUnplacedWork(unplacedRefs, (ids) =>
            this.identity.findUsableItAdminEmployeeIds(ids),
          )
        : Promise.resolve(new Map<string, string | null>()),
    ]);

    const employeeIds = [
      ...new Set([
        ...rows.map((row) => row.employeeId),
        ...[...actingByDepartment.values()].flatMap((acting) => acting.actors),
        ...[...unplacedDesignees.values()].filter((id): id is string => id !== null),
      ]),
    ];
    const employeeRecords = employeeIds.length > 0 ? await this.organizationReads.getEmployees(employeeIds) : [];

    return {
      employees: new Map(
        employeeRecords.map((emp) => [emp.id, { id: emp.id, employeeCode: emp.employeeCode, fullName: emp.fullName }]),
      ),
      departments: new Map(briefs.map((dept) => [dept.id, { id: dept.id, name: dept.name }])),
      actingByDepartment,
      unplacedDesignees,
    };
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of return tasks was read before installation');

    return organization;
  }
}
