import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { CatalogContractApi } from '../../catalog/public/catalog-contract.api';
import { UsageSourceRefusedError } from './vendor-source.errors';
import { canConcludeAbsence, detectableGroups, limitationOf, sourceStatusOf } from './vendor-source.policy';
import { VendorSourceRepo } from './vendor-source.repo';
import type { ContractSourceView, SourceRecord, SourceView } from './vendor-source.types';

/** Reads of the sources for the IT Admin: each with the groups it can detect and what it cannot tell (`FR-4.4`, `US-08-01` AC-2). */
@Injectable()
export class VendorSourceQueryService {
  constructor(
    private readonly repo: VendorSourceRepo,
    private readonly catalog: CatalogApi,
    private readonly contracts: CatalogContractApi,
  ) {}

  async get(id: string): Promise<SourceView> {
    const source = await this.repo.find(id);
    if (!source) throw new UsageSourceRefusedError('NOT_FOUND');

    return (await this.views([source]))[0];
  }

  async list(query: { applicationId?: string; page: number; pageSize: number }): Promise<Page<SourceView>> {
    const { items, total } = await this.repo.page({
      ...(query.applicationId ? { applicationIds: [query.applicationId] } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.views(items), total, query.page, query.pageSize);
  }

  /**
   * The sources of the applications of the subscriptions that rest on a contract, for the IT Admin and Finance (`US-04-13` AC-15): each with
   * its name, its application and its status, and nothing of how it reads a report. The applications come from the catalog; a contract that has
   * none has no source. Throws UsageSourceRefusedError (CONTRACT_NOT_FOUND).
   */
  async listOfContract(
    contractId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<ContractSourceView>> {
    const applicationIds = await this.contracts.getApplicationIds(contractId);
    if (applicationIds === null) throw new UsageSourceRefusedError('CONTRACT_NOT_FOUND');
    if (applicationIds.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.repo.page({
      applicationIds,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const names = await this.applicationNames(items);

    return pageOf(
      items.map((source) => ({
        id: source.id,
        name: source.name,
        applicationId: source.applicationId,
        applicationName: names.get(source.applicationId) ?? '',
        status: sourceStatusOf(source.retiredAt),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async applicationNames(sources: readonly SourceRecord[]): Promise<Map<string, string>> {
    const applications = await this.catalog.getCollectorApplications([...new Set(sources.map((s) => s.applicationId))]);

    return new Map(applications.map((application) => [application.id, application.name]));
  }

  private async views(sources: readonly SourceRecord[]): Promise<SourceView[]> {
    const names = await this.applicationNames(sources);

    return sources.map((source) => ({
      ...source,
      applicationName: names.get(source.applicationId) ?? '',
      detectableGroups: detectableGroups(source.capabilities),
      limitation: limitationOf(source.capabilities, source.evidenceDirection),
      canConcludeAbsence: canConcludeAbsence(source.evidenceDirection, source.capabilities),
    }));
  }
}
