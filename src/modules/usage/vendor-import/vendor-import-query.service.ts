import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { UsageOverviewScopeService } from '../usage-overview/usage-overview-scope.service';
import { UsageImportNotFoundError } from './vendor-import.errors';
import { VendorImportRepo } from './vendor-import.repo';
import { toImportView } from './vendor-import.service';
import type { ImportListFilter, ImportListItem, ImportView, RowOutcome, StoredRow } from './vendor-import.types';

/** Reads of an import and its rows for the IT Admin. An identifier that looks like a secret is already masked in the row. */
@Injectable()
export class VendorImportQueryService {
  constructor(
    private readonly repo: VendorImportRepo,
    private readonly catalog: CatalogApi,
    private readonly scope: UsageOverviewScopeService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The history of imports, the newest first; the name and the logo of each application come in one read for the whole page. */
  async list(
    query: Omit<ImportListFilter, 'skip' | 'take'> & { page: number; pageSize: number },
  ): Promise<Page<ImportListItem>> {
    const { rows, total } = await this.repo.pageList({
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.status ? { status: query.status } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const ids = [...new Set(rows.map((row) => row.applicationId))];
    const found = ids.length > 0 ? await this.catalog.getCollectorApplications(ids) : [];
    const applications = new Map(found.map((app) => [app.id, { id: app.id, name: app.name, logoUrl: app.logoUrl }]));

    return pageOf(
      rows.map((row) => ({
        ...row,
        application: applications.get(row.applicationId) ?? {
          id: row.applicationId,
          name: row.applicationId,
          logoUrl: null,
        },
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  async view(id: string): Promise<ImportView> {
    const record = await this.repo.find(id);
    if (!record) throw new UsageImportNotFoundError();

    return toImportView(record);
  }

  /**
   * A page of the lines of an import. A line tied to a person is shown only while that person is placed in a department the reader works (`QĐ-111ax`,
   * `US-08-04` AC-9: the usage of the people of another department is not read, the result of an import included); the lines nobody was tied to
   * (not matched, two people, not a person, invalid) are shown to every IT Admin, who may handle them.
   */
  async rows(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { outcome?: RowOutcome; page: number; pageSize: number },
  ): Promise<Page<StoredRow>> {
    if (!(await this.repo.find(id))) throw new UsageImportNotFoundError();
    const people = await this.scope.peopleOf(actor, {}, await this.organizationReads.businessToday());
    const { items, total } = await this.repo.pageRows(id, {
      ...(query.outcome ? { outcome: query.outcome } : {}),
      visibleEmployeeIds: people.map((person) => person.employeeId),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}
