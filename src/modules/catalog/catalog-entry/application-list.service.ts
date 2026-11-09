import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { replacementRequired } from './application.policy';
import { ApplicationRepo } from './application.repo';
import type { ApplicationKind, ApplicationSummaryView, BusinessOwnerView, CatalogStatus } from './application.types';

/**
 * The application list: a page of summaries. It reads only the columns a row of the list shows (no domains, no
 * communication note) and the Business Owners of the whole page in one read; the detail (`ApplicationService.get`) is
 * where the rest of an application is read.
 */
@Injectable()
export class ApplicationListService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(query: {
    search?: string;
    kind?: ApplicationKind;
    status?: CatalogStatus;
    functionalGroupId?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<ApplicationSummaryView>> {
    const { items, total } = await this.applications.listSummaries({
      ...(query.search ? { search: query.search } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.functionalGroupId ? { functionalGroupId: query.functionalGroupId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const employees = await this.organizationReads.getEmployees([
      ...new Set(
        items.flatMap((item) => (item.businessOwnerEmployeeId === null ? [] : [item.businessOwnerEmployeeId])),
      ),
    ]);
    const owners = new Map<string, BusinessOwnerView>(
      employees.map((employee) => [
        employee.id,
        {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          status: employee.status,
        },
      ]),
    );

    return pageOf(
      items.map((item) => {
        // An application declared since QĐ-104 names no Business Owner: there is none to show and none to replace.
        if (item.businessOwnerEmployeeId === null)
          return { ...item, businessOwner: null, businessOwnerReplacementRequired: false };
        const businessOwner = owners.get(item.businessOwnerEmployeeId);
        if (!businessOwner) throw new Error('The Business Owner of an application is not an employee');

        return { ...item, businessOwner, businessOwnerReplacementRequired: replacementRequired(businessOwner.status) };
      }),
      total,
      query.page,
      query.pageSize,
    );
  }
}
