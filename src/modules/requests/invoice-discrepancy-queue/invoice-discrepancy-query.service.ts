import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FinanceApi } from '../../finance/public/finance.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { InvoiceDiscrepancyRefusedError } from '../invoice-discrepancy/invoice-discrepancy.errors';
import { InvoiceDiscrepancyRepo, type InvoiceDiscrepancyRow } from '../invoice-discrepancy/invoice-discrepancy.repo';
import type { InvoiceDiscrepancyScope } from '../invoice-discrepancy/invoice-discrepancy.types';
import type { InvoiceDiscrepancyDetailWire, InvoiceDiscrepancySummaryWire } from './invoice-discrepancy.dto';
import { currenciesOf, toDetail, toSummary, type MinorUnitsOf } from './invoice-discrepancy.mapper';

/**
 * Reads of the cases of invoices that differ (`RC-1`). Finance reads every one; the IT Admin reads those of the invoices they submitted and of the
 * requests of the departments they work (`D8`): a case that is not theirs is not found. The digits of each currency a page states a price in are read
 * once per currency, never once per case.
 */
@Injectable()
export class InvoiceDiscrepancyQueryService {
  constructor(
    private readonly cases: InvoiceDiscrepancyRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly finance: FinanceApi,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: {
      state?: 'OPEN' | 'CLOSED';
      outcome?: 'EXPLAINED' | 'OUT_OF_PROCESS_SUSPECTED';
      page: number;
      pageSize: number;
    },
  ): Promise<Page<InvoiceDiscrepancySummaryWire>> {
    const { rows, total } = await this.cases.page(
      { state: query.state, outcome: query.outcome },
      await this.scopeOf(actor),
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const units = await this.minorUnitsOf(rows);

    return pageOf(
      rows.map((row) => toSummary(row, units)),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws InvoiceDiscrepancyRefusedError('NOT_FOUND') for a case that is not there or not the person's to read. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<InvoiceDiscrepancyDetailWire> {
    const row = await this.cases.readableBy(id, await this.scopeOf(actor));
    if (!row) throw new InvoiceDiscrepancyRefusedError('NOT_FOUND');

    return this.detailOf(row);
  }

  /** One case as the detail shows it. */
  async detailOf(row: InvoiceDiscrepancyRow): Promise<InvoiceDiscrepancyDetailWire> {
    return toDetail(row, await this.minorUnitsOf([row]));
  }

  private async minorUnitsOf(rows: readonly InvoiceDiscrepancyRow[]): Promise<MinorUnitsOf> {
    const units = new Map<string, number>();
    for (const code of currenciesOf(rows)) units.set(code, (await this.finance.findCurrency(code))?.minorUnit ?? 2);

    return units;
  }

  private async scopeOf(actor: AuthenticatedPrincipal): Promise<InvoiceDiscrepancyScope> {
    if (actor.roles.includes('FINANCE')) return { kind: 'ALL' };

    return {
      kind: 'IT_ADMIN',
      employeeId: actor.employeeId,
      departmentIds: await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
        this.identity.findUsableItAdminEmployeeIds(ids),
      ),
    };
  }
}
