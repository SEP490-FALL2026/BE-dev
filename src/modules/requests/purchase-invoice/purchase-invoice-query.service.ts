import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { FinanceApi } from '../../finance/public/finance.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import type { PurchaseInvoiceDetailWire, PurchaseInvoiceSummaryWire } from './purchase-invoice.dto';
import { toDetail, toSummary } from './purchase-invoice.mapper';
import { PurchaseInvoiceRepo, type PurchaseInvoiceRow, type PurchaseInvoiceScope } from './purchase-invoice.repo';

/**
 * Reads of purchase invoices (`PI-1`). Finance reads every one; the IT Admin reads what they submitted and the invoices of the requests of the
 * departments they work (`D8`): a filter that names nothing of theirs is an empty page and an id that is not theirs is not found.
 */
@Injectable()
export class PurchaseInvoiceQueryService {
  constructor(
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly finance: FinanceApi,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: {
      state?: 'SUBMITTED' | 'CONFIRMED' | 'RETURNED';
      label?: 'NEW_PURCHASE' | 'PERIOD' | 'RENEWAL';
      vendorId?: string;
      subscriptionId?: string;
      requestId?: string;
      servicePeriodMonth?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<PurchaseInvoiceSummaryWire>> {
    const { rows, total } = await this.invoices.page(
      {
        state: query.state,
        label: query.label,
        vendorId: query.vendorId,
        subscriptionId: query.subscriptionId,
        requestId: query.requestId,
        serviceMonth: query.servicePeriodMonth ? `${query.servicePeriodMonth}-01` : undefined,
      },
      await this.scopeOf(actor),
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(rows.map(toSummary), total, query.page, query.pageSize);
  }

  /** Throws PurchaseInvoiceRefusedError('NOT_FOUND') for an invoice that is not there or not the person's to read. */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<PurchaseInvoiceDetailWire> {
    const row = await this.invoices.readableBy(id, await this.scopeOf(actor));
    if (!row) throw new PurchaseInvoiceRefusedError('NOT_FOUND');

    return this.detailOf(row);
  }

  /** One invoice with its files and what was submitted in its place, as the detail shows it. */
  async detailOf(row: PurchaseInvoiceRow): Promise<PurchaseInvoiceDetailWire> {
    const [documents, resubmitted, currency] = await Promise.all([
      this.invoices.documentsOf([row.id]),
      row.state === 'RETURNED' ? this.invoices.resubmittedAs([row.id]) : Promise.resolve(new Map<string, string>()),
      this.finance.findCurrency(row.unitPriceOriginalCurrency),
    ]);

    return toDetail(row, {
      documents: documents.get(row.id) ?? [],
      resubmittedAsId: resubmitted.get(row.id) ?? null,
      originalMinorUnits: currency?.minorUnit ?? 2,
    });
  }

  private async scopeOf(actor: AuthenticatedPrincipal): Promise<PurchaseInvoiceScope> {
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
