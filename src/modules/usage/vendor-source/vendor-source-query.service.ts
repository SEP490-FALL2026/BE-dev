import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { UsageSourceRefusedError } from './vendor-source.errors';
import { canConcludeAbsence, detectableGroups, limitationOf } from './vendor-source.policy';
import { VendorSourceRepo } from './vendor-source.repo';
import type { SourceRecord, SourceView } from './vendor-source.types';

/** Reads of the sources for the IT Admin: each with the groups it can detect and what it cannot tell (`FR-4.4`, `US-08-01` AC-2). */
@Injectable()
export class VendorSourceQueryService {
  constructor(
    private readonly repo: VendorSourceRepo,
    private readonly catalog: CatalogApi,
  ) {}

  async get(id: string): Promise<SourceView> {
    const source = await this.repo.find(id);
    if (!source) throw new UsageSourceRefusedError('NOT_FOUND');

    return (await this.views([source]))[0];
  }

  async list(query: { applicationId?: string; page: number; pageSize: number }): Promise<Page<SourceView>> {
    const { items, total } = await this.repo.page({
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.views(items), total, query.page, query.pageSize);
  }

  private async views(sources: readonly SourceRecord[]): Promise<SourceView[]> {
    const applications = await this.catalog.getCollectorApplications([...new Set(sources.map((s) => s.applicationId))]);
    const names = new Map(applications.map((application) => [application.id, application.name]));

    return sources.map((source) => ({
      ...source,
      applicationName: names.get(source.applicationId) ?? '',
      detectableGroups: detectableGroups(source.capabilities),
      limitation: limitationOf(source.capabilities, source.evidenceDirection),
      canConcludeAbsence: canConcludeAbsence(source.evidenceDirection, source.capabilities),
    }));
  }
}
