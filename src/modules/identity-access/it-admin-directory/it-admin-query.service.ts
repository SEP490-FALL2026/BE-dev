import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccountRecordService } from '../accounts/account-record.service';

export interface ItAdminRow {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}

/**
 * The IT Admins who work now, for choosing whom to hand an application to (`QĐ-111g`): the employees whose account can act and holds an
 * IT Admin grant, by employee code. The names come from the organization in one read for all of them; a search matches a code or a name.
 * The list is as long as the IT team, so it is filtered and cut here, in the two reads that fetch it.
 */
@Injectable()
export class ItAdminQueryService {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(query: { search?: string | undefined; page: number; pageSize: number }): Promise<Page<ItAdminRow>> {
    const ids = await this.accounts.findAllUsableItAdminEmployeeIds();
    const needle = query.search?.trim().toLowerCase() ?? '';
    const rows = (ids.length === 0 ? [] : await this.organizationReads.getEmployees(ids))
      .map((employee) => ({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
      }))
      .filter(
        (row) =>
          needle === '' ||
          row.employeeCode.toLowerCase().includes(needle) ||
          row.fullName.toLowerCase().includes(needle),
      )
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
    const from = (query.page - 1) * query.pageSize;

    return pageOf(rows.slice(from, from + query.pageSize), rows.length, query.page, query.pageSize);
  }
}
