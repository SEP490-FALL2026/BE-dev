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
 * IT Admin grant, by employee code. Two reads whatever the size of the IT team (API-LIST-DETAIL.1): the ids of the usable IT Admins here,
 * then one page of those employees, matched on code or name, with the total, cut and counted by the organization in one snapshot.
 */
@Injectable()
export class ItAdminQueryService {
  constructor(
    private readonly accounts: AccountRecordService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(query: { search?: string | undefined; page: number; pageSize: number }): Promise<Page<ItAdminRow>> {
    const ids = await this.accounts.findAllUsableItAdminEmployeeIds();
    if (ids.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.organizationReads.getEmployeePageAmong(ids, {
      search: query.search,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(
      items.map((employee) => ({
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
