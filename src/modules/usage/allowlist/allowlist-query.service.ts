import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AI_TOOL_EXPERIMENTAL } from './allowlist.policy';
import { AllowlistRepo } from './allowlist.repo';

/** What the IT Admin reads of the allowlist: the entries of the version in force, a page at a time. */
@Injectable()
export class AllowlistQueryService {
  constructor(
    private readonly repo: AllowlistRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(input: { page: number; pageSize: number }) {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The allowlist was read before installation');
    const { rows, total } = await this.repo.pageOfCurrent(
      organization.id,
      (input.page - 1) * input.pageSize,
      input.pageSize,
    );
    const names = new Map(
      (await this.catalog.getCollectorApplications([...new Set(rows.map((row) => row.applicationId))])).map(
        (application) => [application.id, application.name],
      ),
    );

    return {
      items: rows.map((row) => ({
        versionNumber: row.versionNumber,
        publishedAt: row.publishedAt.toISOString(),
        kind: row.kind,
        key: row.key,
        application: { id: row.applicationId, name: names.get(row.applicationId) ?? '' },
        experimental: AI_TOOL_EXPERIMENTAL.has(row.key),
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }
}
