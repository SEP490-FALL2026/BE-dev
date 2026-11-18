import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ApplicationRepo } from './application.repo';
import { responsibleOf } from './application-view.service';
import type { ApplicationKind, ApplicationSummaryView, CatalogStatus } from './application.types';

/**
 * The application list: a page of summaries. It reads only the columns a row of the list shows (no domains, no
 * communication note) and the IT Admins responsible for the whole page in one read each (names, and which of them are still usable); the
 * detail (`ApplicationService.get`) is where the rest of an application is read.
 */
@Injectable()
export class ApplicationListService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
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
    const named = await responsibleOf(
      this.organizationReads,
      this.identity,
      items.map((item) => item.responsibleItAdminEmployeeId),
    );

    return pageOf(
      items.map((item) => ({ ...item, ...named(item.responsibleItAdminEmployeeId) })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
