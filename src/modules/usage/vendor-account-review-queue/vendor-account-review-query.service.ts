import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { VendorAccountReviewRepo } from '../vendor-account-review/vendor-account-review.repo';
import type {
  DiscrepancyRecord,
  OutOfProcessCaseRecord,
  OutOfProcessOutcome,
  OutOfProcessState,
  VendorAccountSource,
  VendorAccountState,
} from '../vendor-account-review/vendor-account-review.types';
import type { OutOfProcessCaseWire, VendorAccountWire } from './vendor-account-review.dto';
import { toCaseWire, toDiscrepancyWire, type ApplicationNames } from './vendor-account-review.mapper';

/**
 * Reads of the differences of the accounts at the vendor and of the cases outside the process (`SBF-08`, `SBF-07a`, RC-2). The names of the
 * applications a page speaks of are read once for the page, never once for each row. The IT Admin reads every difference; the cases are read by the IT
 * Admin and Finance (the roles are the routes').
 */
@Injectable()
export class VendorAccountReviewQueryService {
  constructor(
    private readonly reviews: VendorAccountReviewRepo,
    private readonly catalog: CatalogApi,
  ) {}

  async pageDiscrepancies(query: {
    state?: VendorAccountState;
    source?: VendorAccountSource;
    applicationId?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<VendorAccountWire>> {
    const { rows, total } = await this.reviews.pageDiscrepancies(
      { state: query.state, source: query.source, applicationId: query.applicationId },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const names = await this.namesOf(rows);

    return pageOf(
      rows.map((row) => toDiscrepancyWire(row, names)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async discrepancyOf(row: DiscrepancyRecord): Promise<VendorAccountWire> {
    return toDiscrepancyWire(row, await this.namesOf([row]));
  }

  async pageCases(query: {
    state?: OutOfProcessState;
    outcome?: OutOfProcessOutcome;
    page: number;
    pageSize: number;
  }): Promise<Page<OutOfProcessCaseWire>> {
    const { rows, total } = await this.reviews.pageCases(
      { state: query.state, outcome: query.outcome },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const names = await this.namesOf(rows);

    return pageOf(
      rows.map((row) => toCaseWire(row, names)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async caseOf(row: OutOfProcessCaseRecord): Promise<OutOfProcessCaseWire> {
    return toCaseWire(row, await this.namesOf([row]));
  }

  private async namesOf(rows: readonly { applicationId: string | null }[]): Promise<ApplicationNames> {
    const ids = [...new Set(rows.flatMap((row) => (row.applicationId === null ? [] : [row.applicationId])))];
    if (ids.length === 0) return new Map();

    return new Map(
      (await this.catalog.getCollectorApplications(ids)).map((application) => [application.id, application.name]),
    );
  }
}
