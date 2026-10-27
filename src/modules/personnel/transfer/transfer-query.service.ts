import { Injectable } from '@nestjs/common';
import { OrganizationService } from '../../organization/organization.service';
import { TransferRefusedError } from './transfer.errors';
import type { TransferChangeWire, TransferDetailWire, TransferRecordedWire, TransferSummaryWire } from './transfer.dto';
import { toChange, toDetail, toRecorded, toSummary, type TransferNames } from './transfer.mapper';
import { TransferRepo } from './transfer.repo';
import type { TransferListFilter, TransferRecord, TransferWarning } from './transfer.types';

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

/** Reads transfers for the IT Admin: the list, one transfer in full, and the log of its moves and cancellation. */
@Injectable()
export class TransferQueryService {
  constructor(
    private readonly transfers: TransferRepo,
    private readonly organization: OrganizationService,
  ) {}

  /** One page of summaries; the names of the page are read in one statement each, whatever the page size (`LD-07`). */
  async list(filter: TransferListFilter): Promise<Paged<TransferSummaryWire>> {
    const { items, total } = await this.transfers.list(filter);
    const names = await this.namesOf(
      items.map((item) => ({
        employeeIds: [item.employeeId],
        departmentIds: [item.fromDepartmentId, item.toDepartmentId],
      })),
    );

    return paged(
      items.map((item) => toSummary(item, names)),
      total,
      filter,
    );
  }

  async get(id: string): Promise<TransferDetailWire> {
    const record = await this.transfers.find(id);
    if (!record) throw new TransferRefusedError('NOT_FOUND');

    return this.detailOf(record);
  }

  async detailOf(record: TransferRecord): Promise<TransferDetailWire> {
    return toDetail(record, await this.namesOfRecord(record));
  }

  async recordedOf(record: TransferRecord, warnings: TransferWarning[]): Promise<TransferRecordedWire> {
    return toRecorded(record, await this.namesOfRecord(record), warnings);
  }

  async listChanges(id: string, page: { page: number; pageSize: number }): Promise<Paged<TransferChangeWire>> {
    if (!(await this.transfers.find(id))) throw new TransferRefusedError('NOT_FOUND');
    const { items, total } = await this.transfers.listChanges(id, page);

    return paged(items.map(toChange), total, page);
  }

  private namesOfRecord(record: TransferRecord): Promise<TransferNames> {
    return this.namesOf([
      {
        employeeIds: [
          record.employeeId,
          ...(record.headHandover?.successorEmployeeId ? [record.headHandover.successorEmployeeId] : []),
        ],
        departmentIds: [record.fromDepartmentId, record.toDepartmentId],
      },
    ]);
  }

  private async namesOf(rows: { employeeIds: string[]; departmentIds: string[] }[]): Promise<TransferNames> {
    const unique = (pick: (row: (typeof rows)[number]) => string[]) => [...new Set(rows.flatMap(pick))];
    const [employees, departments] = await Promise.all([
      this.organization.getEmployees(unique((row) => row.employeeIds)),
      this.organization.getDepartmentBriefs(unique((row) => row.departmentIds)),
    ]);

    return {
      employees: new Map(employees.map((employee) => [employee.id, employee])),
      departments: new Map(departments.map((department) => [department.id, department])),
    };
  }
}
