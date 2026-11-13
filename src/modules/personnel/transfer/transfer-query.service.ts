import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { readAccessOf, type ReadAccess } from '../personnel-self-action.policy';
import { TransferOldRightsService } from '../transfer-grace/transfer-old-rights.service';
import { TransferRefusedError } from './transfer.errors';
import type { TransferChangeWire, TransferDetailWire, TransferRecordedWire, TransferSummaryWire } from './transfer.dto';
import {
  toChange,
  toDetail,
  toRecorded,
  toSummary,
  type TransferDetailExtras,
  type TransferNames,
} from './transfer.mapper';
import { TransferRepo, type TransferFactRow } from './transfer.repo';
import type { TransferListFilter, TransferRecord } from './transfer.types';

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
 * Reads transfers: the Super Admin reads all of them in full; the IT Admin only the minimal projection of the transfers that
 * leave or enter a department they are in charge of or stand in for (one with no usable IT Admin named is every IT Admin's), and the
 * rest do not exist for them (404); nobody else reads them. The log of
 * moves and cancellations carries the reasons and the basis, so it is the Super Admin's alone.
 */
@Injectable()
export class TransferQueryService {
  constructor(
    private readonly transfers: TransferRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly oldRights: TransferOldRightsService,
  ) {}

  /** The transfers of these people that have taken effect on `onDate` and are not closed (`getTransfersInOverlap`). */
  overlapOf(employeeIds: readonly string[], onDate: BusinessDate): Promise<TransferFactRow[]> {
    return this.transfers.inOverlap(employeeIds, onDate);
  }

  /** The transfers with these ids, whatever their state (`getTransfersByIds`). */
  factsOf(transferIds: readonly string[]): Promise<TransferFactRow[]> {
    return this.transfers.factsOf(transferIds);
  }

  /** One page of summaries; the names of the page are read in one statement each, whatever the page size. */
  async list(actor: AuthenticatedPrincipal, filter: TransferListFilter): Promise<Paged<TransferSummaryWire>> {
    const { departmentIds } = await this.scopeOf(actor);
    const { items, total } = await this.transfers.list({ ...filter, ...(departmentIds ? { departmentIds } : {}) });
    const today = await this.organizationReads.businessToday();
    const names = await this.namesOf(
      items.map((item) => ({
        employeeIds: [item.employeeId],
        departmentIds: [item.fromDepartmentId, item.toDepartmentId],
      })),
    );

    return paged(
      items.map((item) => toSummary(item, names, today)),
      total,
      filter,
    );
  }

  async get(actor: AuthenticatedPrincipal, id: string): Promise<TransferDetailWire> {
    const { access, departmentIds } = await this.scopeOf(actor);
    const record = await this.transfers.find(id);
    if (
      !record ||
      (departmentIds &&
        !departmentIds.includes(record.fromDepartmentId) &&
        !departmentIds.includes(record.toDepartmentId))
    )
      throw new TransferRefusedError('NOT_FOUND');

    return this.detailOf(record, access);
  }

  async detailOf(record: TransferRecord, access: ReadAccess = 'FULL'): Promise<TransferDetailWire> {
    return toDetail(record, await this.namesOfRecord(record), access, await this.extrasOf(record));
  }

  async recordedOf(record: TransferRecord): Promise<TransferRecordedWire> {
    return toRecorded(record, await this.namesOfRecord(record), await this.extrasOf(record));
  }

  /** The day and the old rights of a transfer that took effect (none before it did, and none for one that was cancelled). */
  private async extrasOf(record: TransferRecord): Promise<TransferDetailExtras> {
    const today = await this.organizationReads.businessToday();

    return {
      today,
      oldRights:
        record.status === 'EFFECTIVE'
          ? await this.oldRights.of({
              employeeId: record.employeeId,
              effectiveOn: record.effectiveOn,
              closed: record.closedAt !== null,
              snapshot: record.snapshotBefore,
              today,
            })
          : [],
    };
  }

  async listChanges(
    actor: AuthenticatedPrincipal,
    id: string,
    page: { page: number; pageSize: number },
  ): Promise<Paged<TransferChangeWire>> {
    if (readAccessOf(actor) !== 'FULL') throw new PersonnelAccessRefusedError('FORBIDDEN');
    if (!(await this.transfers.find(id))) throw new TransferRefusedError('NOT_FOUND');
    const { items, total } = await this.transfers.listChanges(id, page);

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
          departmentIds: await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
            this.identity.findUsableItAdminEmployeeIds(ids),
          ),
        };
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
      this.organizationReads.getEmployees(unique((row) => row.employeeIds)),
      this.organizationReads.getDepartmentBriefs(unique((row) => row.departmentIds)),
    ]);

    return {
      employees: new Map(employees.map((employee) => [employee.id, employee])),
      departments: new Map(departments.map((department) => [department.id, department])),
    };
  }
}
