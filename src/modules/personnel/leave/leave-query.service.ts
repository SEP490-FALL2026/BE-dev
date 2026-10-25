import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { OrganizationService } from '../../organization/organization.service';
import { LeaveRefusedError } from './leave.errors';
import type { LeaveChangeWire, LeaveDetailWire, LeaveSummaryWire } from './leave.dto';
import { toChange, toDetail, toSummary } from './leave.mapper';
import { LeaveRepo } from './leave.repo';
import type { LeaveInterval } from '../personnel.types';
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

/** Reads long leaves for the IT Admin: the list (also the list of the late returns), one leave in full, and its log. */
@Injectable()
export class LeaveQueryService {
  constructor(
    private readonly leaves: LeaveRepo,
    private readonly organization: OrganizationService,
  ) {}

  /** One page of summaries; the names of the page are read in one statement whatever the page size (`LD-07`). */
  async list(filter: {
    status?: 'ACTIVE' | 'ENDED';
    employeeId?: string;
    overdueReturn?: boolean;
    page: number;
    pageSize: number;
  }): Promise<Paged<LeaveSummaryWire>> {
    const today = await this.organization.businessToday();
    const { items, total } = await this.leaves.list({ ...filter, today });
    const employees = await this.employeesOf(items.map((item) => item.employeeId));

    return paged(
      items.map((item) => toSummary(item, employees, today)),
      total,
      filter,
    );
  }

  async get(id: string): Promise<LeaveDetailWire> {
    const record = await this.leaves.find(id);
    if (!record) throw new LeaveRefusedError('NOT_FOUND');

    return this.detailOf(record);
  }

  async detailOf(record: LeaveRecord): Promise<LeaveDetailWire> {
    const today = await this.organization.businessToday();

    return toDetail(record, await this.employeesOf([record.employeeId]), today);
  }

  async listChanges(id: string, page: { page: number; pageSize: number }): Promise<Paged<LeaveChangeWire>> {
    if (!(await this.leaves.find(id))) throw new LeaveRefusedError('NOT_FOUND');
    const { items, total } = await this.leaves.listChanges(id, page);

    return paged(items.map(toChange), total, page);
  }

  /** The leaves of the people that overlap the days `from` to `to`, read in one statement whatever the number of people. */
  intervalsOf(employeeIds: readonly string[], from: BusinessDate, to: BusinessDate): Promise<LeaveInterval[]> {
    return this.leaves.intervals(employeeIds, from, to);
  }

  private async employeesOf(ids: string[]) {
    const employees = await this.organization.getEmployees([...new Set(ids)]);

    return new Map(employees.map((employee) => [employee.id, employee]));
  }
}
