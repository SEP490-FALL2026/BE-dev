import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { readAccessOf, type ReadAccess } from '../personnel-self-action.policy';
import { NoticeRefusedError } from './notice.errors';
import type { NoticeDetailWire, NoticeSummaryWire } from './notice.dto';
import { toDetail, toSummary } from './notice.mapper';
import { NoticeRepo } from './notice.repo';
import type { NoticeRecord } from '../personnel-notice.types';

export interface NoticePage {
  items: NoticeSummaryWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * Reads notices (`SoD-2`): the Super Admin reads the queue of every notice with how it was verified; the IT Admin reads only the
 * minimal projection (no record of the check) of the notices about people in the departments they are in charge of or stand in for
 * (one with no usable IT Admin named is every IT Admin's); a department head
 * reads only the notices they sent; one outside that does not exist for the reader. The names of a page are read in one statement
 * whatever its size.
 */
@Injectable()
export class NoticeQueryService {
  constructor(
    private readonly notices: NoticeRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    filter: {
      status?: NoticeRecord['status'] | undefined;
      kind?: NoticeRecord['kind'] | undefined;
      employeeId?: string | undefined;
      overdue?: boolean | undefined;
      priority?: boolean | undefined;
      page: number;
      pageSize: number;
    },
  ): Promise<NoticePage> {
    const today = await this.organizationReads.businessToday();
    const scope = await this.scopeOf(actor);
    const { items, total } = await this.notices.list({
      ...filter,
      ...(scope.employeeIds ? { employeeIds: scope.employeeIds } : {}),
      ...(scope.senderEmployeeId ? { senderEmployeeId: scope.senderEmployeeId } : {}),
      today,
    });
    const employees = await this.employeesOf(items.map((item) => item.employeeId));

    return {
      items: items.map((item) => toSummary(item, employees, today)),
      pagination: {
        page: filter.page,
        pageSize: filter.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / filter.pageSize),
      },
    };
  }

  async get(actor: AuthenticatedPrincipal, id: string): Promise<NoticeDetailWire> {
    const scope = await this.scopeOf(actor);
    const record = await this.notices.find(id);
    if (
      !record ||
      (scope.senderEmployeeId && record.senderEmployeeId !== scope.senderEmployeeId) ||
      (scope.employeeIds && !scope.employeeIds.includes(record.employeeId))
    )
      throw new NoticeRefusedError('NOT_FOUND');

    return this.detailOf(actor, record);
  }

  async detailOf(actor: AuthenticatedPrincipal, record: NoticeRecord): Promise<NoticeDetailWire> {
    const today = await this.organizationReads.businessToday();
    const [employees, target, verification] = await Promise.all([
      this.employeesOf([record.employeeId, record.senderEmployeeId]),
      record.targetDepartmentId ? this.organizationReads.getDepartmentBrief(record.targetDepartmentId) : null,
      readAccessOf(actor) === 'FULL' ? this.notices.findVerification(record.id) : null,
    ]);

    return toDetail(record, { employees, target, verification, today });
  }

  /**
   * What the caller reads: everything (the Super Admin), the notices about people in the departments they are in charge of (the IT
   * Admin, in charge of or standing in), or the notices they sent (a head); a caller with none of these is refused.
   */
  private async scopeOf(
    actor: AuthenticatedPrincipal,
  ): Promise<{ access: ReadAccess; employeeIds?: string[]; senderEmployeeId?: string }> {
    const access = readAccessOf(actor);
    if (access === 'FULL') return { access };
    if (access === 'MINIMAL') {
      const departments = await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
        this.identity.findUsableItAdminEmployeeIds(ids),
      );
      const members = await Promise.all(departments.map((id) => this.organizationReads.getDepartmentMemberIds(id)));

      return { access, employeeIds: members.flatMap((ids) => ids ?? []) };
    }
    if (!actor.roles.includes('MANAGER')) throw new PersonnelAccessRefusedError('FORBIDDEN');

    return { access, senderEmployeeId: actor.employeeId };
  }

  private async employeesOf(ids: string[]) {
    const employees = await this.organizationReads.getEmployees([...new Set(ids)]);

    return new Map(employees.map((employee) => [employee.id, employee]));
  }
}
