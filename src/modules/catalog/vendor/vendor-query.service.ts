import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { searchKey } from '../../../core/search-key';
import { FinanceApi } from '../../finance/public/finance.api';
import type { TaxGroup } from '../../finance/public/finance.types';
import { VendorNotFoundError } from './vendor.errors';
import { VendorRepo, type VendorRow } from './vendor.repo';

export interface VendorView {
  id: string;
  name: string;
  dictionaryGroupId: string | null;
  taxProfileStatus: 'DECLARED' | 'MISSING';
  taxGroup: TaxGroup | null;
}

/** The vendors of the organization with where their tax profile stands: the list Finance works the missing ones from. */
@Injectable()
export class VendorQueryService {
  constructor(
    private readonly vendors: VendorRepo,
    private readonly finance: FinanceApi,
  ) {}

  /** Throws VendorNotFoundError. */
  async require(id: string): Promise<VendorRow> {
    const vendor = await this.vendors.findPublic(id);
    if (!vendor) throw new VendorNotFoundError();

    return vendor;
  }

  async list(query: {
    search?: string;
    taxProfile?: 'DECLARED' | 'MISSING';
    page: number;
    pageSize: number;
  }): Promise<Page<VendorView>> {
    const declared = query.taxProfile ? await this.finance.declaredTaxProfileVendorIds() : undefined;
    const { items, total } = await this.vendors.list({
      ...(query.search ? { searchKey: searchKey(query.search) } : {}),
      ...(query.taxProfile === 'DECLARED' ? { onlyIds: declared } : {}),
      ...(query.taxProfile === 'MISSING' ? { excludeIds: declared } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const groups = await this.finance.taxProfileGroups(items.map((vendor) => vendor.id));

    return pageOf(
      items.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        dictionaryGroupId: vendor.dictionaryGroupId,
        taxProfileStatus: groups.has(vendor.id) ? 'DECLARED' : 'MISSING',
        taxGroup: groups.get(vendor.id)?.group ?? null,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }
}
