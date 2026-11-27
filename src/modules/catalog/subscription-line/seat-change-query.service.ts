import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatLedgerService } from './ledger/seat-ledger.service';
import { SubscriptionLineNotFoundError } from './subscription-line.errors';
import { toSeatChangeItem, type SeatChangeItemView } from './subscription-line.mapper';

/** Reads paged seat-ledger changes for a subscription line within a RepeatableRead snapshot. */
@Injectable()
export class SeatChangeQueryService {
  constructor(
    private readonly seatLedger: SeatLedgerService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async listByLine(lineId: string, query: { page: number; pageSize: number }): Promise<Page<SeatChangeItemView>> {
    const result = await this.seatLedger.listPagedByLine(lineId, query.page, query.pageSize);
    if (!result) throw new SubscriptionLineNotFoundError();

    const employeeIds = [
      ...new Set(
        result.items.flatMap((row) =>
          [row.beneficiaryEmployeeId, row.recordedByEmployeeId].filter((id): id is string => id !== null),
        ),
      ),
    ];
    const employees = employeeIds.length > 0 ? await this.organizationReads.getEmployees(employeeIds) : [];
    const byId = new Map(employees.map((employee) => [employee.id, employee]));

    return pageOf(
      result.items.map((row) => toSeatChangeItem(row, byId)),
      result.total,
      query.page,
      query.pageSize,
    );
  }
}
