import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Page, pageOf } from '../../../core/application/pagination';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { CONTRACT_DETAIL_ARRAY_MAX, contractStatusOf, type ContractStatus } from './contract-fields.policy';
import { ContractSubscriptionRepo, type ContractSubscriptionBrief } from './contract-subscription.repo';
import { ContractNotFoundError } from './contract.errors';
import { ContractRepo, type ContractDetailRow, type ContractSummaryRow } from './contract.repo';
import { DocumentRepo, type AttachedDocumentRow } from './document.repo';

/**
 * The most applications `applicationIdsOf` reads for a contract. A contract rests on the few applications of one vendor, so the ceiling is never
 * met in practice; it only keeps the read bounded.
 */
export const CONTRACT_APPLICATIONS_READ_MAX = 1000;

export interface ContractSummaryView extends ContractSummaryRow {
  status: ContractStatus;
}

export interface ContractDetailView extends ContractDetailRow {
  status: ContractStatus;
  subscriptions: ContractSubscriptionBrief[];
  documents: AttachedDocumentRow[];
  applicationIds: string[];
  /** For each array, whether the contract has more than the detail lists. */
  truncated: { subscriptions: boolean; documents: boolean; applicationIds: boolean };
}

export interface ListContractsInput {
  search?: string;
  vendorId?: string;
  status?: ContractStatus;
  effectiveOn?: BusinessDate;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/**
 * What the IT Admin and Finance read of the contracts (`US-04-13` AC-10, AC-11): a page of them by the day they begin, and one with a
 * bounded slice of its subscriptions, files and applications. The status is read against the business day of today, so it is never
 * stored. The usage sources of the applications are not read here: the catalog sits below usage, and a contract is not linked to one.
 */
@Injectable()
export class ContractQueryService {
  constructor(
    private readonly contracts: ContractRepo,
    private readonly links: ContractSubscriptionRepo,
    private readonly documents: DocumentRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async list(query: ListContractsInput): Promise<Page<ContractSummaryView>> {
    const today = await this.organizationReads.businessToday();
    const { items, total } = await this.contracts.list({
      ...(query.search ? { search: query.search } : {}),
      ...(query.vendorId ? { vendorId: query.vendorId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.effectiveOn ? { effectiveOn: query.effectiveOn } : {}),
      today,
      order: query.order,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(
      items.map((row) => ({
        ...row,
        status: contractStatusOf({ ...row, vendorId: row.vendor?.id ?? null }, today),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws ContractNotFoundError. */
  async detail(id: string): Promise<ContractDetailView> {
    const today = await this.organizationReads.businessToday();
    const contract = await this.contracts.findDetail(id);
    if (!contract) throw new ContractNotFoundError();
    const [subscriptions, documents, applicationIds] = await Promise.all([
      this.links.briefsOf(id, CONTRACT_DETAIL_ARRAY_MAX),
      this.documents.attachedTo(id, CONTRACT_DETAIL_ARRAY_MAX + 1),
      this.links.applicationIdsOf(id, CONTRACT_DETAIL_ARRAY_MAX + 1),
    ]);

    return {
      ...contract,
      status: contractStatusOf(contract, today),
      subscriptions,
      documents: documents.slice(0, CONTRACT_DETAIL_ARRAY_MAX),
      applicationIds: applicationIds.slice(0, CONTRACT_DETAIL_ARRAY_MAX),
      truncated: {
        subscriptions: contract.subscriptionCount > CONTRACT_DETAIL_ARRAY_MAX,
        documents: documents.length > CONTRACT_DETAIL_ARRAY_MAX,
        applicationIds: applicationIds.length > CONTRACT_DETAIL_ARRAY_MAX,
      },
    };
  }

  /**
   * The applications of the subscriptions that rest on a contract, each once (what the usage module reads the sources of a contract through,
   * `US-04-13` AC-15); null when there is no such contract, so a contract with no subscription (an empty list) is not mistaken for one that
   * does not exist.
   */
  async applicationIdsOf(id: string): Promise<string[] | null> {
    if (!(await this.contracts.find(id))) return null;

    return this.links.applicationIdsOf(id, CONTRACT_APPLICATIONS_READ_MAX);
  }
}
