import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../../organization/organization.service';
import { NoticeRefusedError } from './notice.errors';
import type { NoticeDetailWire, NoticeSummaryWire } from './notice.dto';
import { toDetail, toSummary } from './notice.mapper';
import { NoticeRepo } from './notice.repo';
import type { NoticeRecord } from './notice.types';

export interface NoticePage {
  items: NoticeSummaryWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const isItAdmin = (actor: AuthenticatedPrincipal): boolean => actor.roles.includes('IT_ADMIN');

/**
 * Reads notices (`SoD-2`): the IT Admin reads the queue of every notice with how it was verified; a department head reads only the
 * notices they sent, and one of another head does not exist for them. The names of a page are read in one statement whatever its size.
 */
@Injectable()
export class NoticeQueryService {
  constructor(
    private readonly notices: NoticeRepo,
    private readonly organization: OrganizationService,
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
    const today = await this.organization.businessToday();
    const { items, total } = await this.notices.list({
      ...filter,
      ...(isItAdmin(actor) ? {} : { senderEmployeeId: actor.employeeId }),
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
    const record = await this.notices.find(id);
    if (!record || (!isItAdmin(actor) && record.senderEmployeeId !== actor.employeeId))
      throw new NoticeRefusedError('NOT_FOUND');

    return this.detailOf(actor, record);
  }

  async detailOf(actor: AuthenticatedPrincipal, record: NoticeRecord): Promise<NoticeDetailWire> {
    const today = await this.organization.businessToday();
    const [employees, target, verification] = await Promise.all([
      this.employeesOf([record.employeeId, record.senderEmployeeId]),
      record.targetDepartmentId ? this.organization.getDepartmentBrief(record.targetDepartmentId) : null,
      isItAdmin(actor) ? this.notices.findVerification(record.id) : null,
    ]);

    return toDetail(record, { employees, target, verification, today });
  }

  private async employeesOf(ids: string[]) {
    const employees = await this.organization.getEmployees([...new Set(ids)]);

    return new Map(employees.map((employee) => [employee.id, employee]));
  }
}
