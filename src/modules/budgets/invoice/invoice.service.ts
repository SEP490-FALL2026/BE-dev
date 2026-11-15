import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { BudgetCommitmentNotFoundError } from '../budget/budget.errors';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { CommitmentRepo } from '../budget/commitment.repo';
import { InvoiceRepo, type InvoiceRecord } from '../budget/invoice.repo';
import { PurchaseInvoiceFactsHook, type PurchaseInvoiceFactsView } from '../public/budgets.extension-points';
import type { InvoiceWire } from './invoice.dto';

/**
 * What Finance reads of the invoices of a commitment (`US-12-02`). Finance writes none: an invoice enters the books when Finance signs a purchase
 * invoice (`PurchaseInvoiceRecorderService`, `PI-1`). Each invoice is shown with the month it pays for and, when it came from a purchase invoice, the
 * label and the way of payment of that purchase.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly invoices: InvoiceRepo,
    private readonly facts: BudgetFactsService,
    private readonly purchaseFacts: PurchaseInvoiceFactsHook,
  ) {}

  /** The invoices recorded against a commitment, the newest first. Throws BudgetCommitmentNotFoundError. */
  async page(commitmentId: string, query: { page: number; pageSize: number }): Promise<Page<InvoiceWire>> {
    if (!(await this.commitments.exists(commitmentId))) throw new BudgetCommitmentNotFoundError();
    const { rows, total } = await this.invoices.page(commitmentId, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.wires(rows), total, query.page, query.pageSize);
  }

  /** The label and the way of payment of the purchase invoices behind the rows: one read for the page, none when no row came from a purchase. */
  private async purchasesBehind(rows: readonly InvoiceRecord[]): Promise<Map<string, PurchaseInvoiceFactsView>> {
    const ids = [...new Set(rows.flatMap((row) => (row.purchaseInvoiceId === null ? [] : [row.purchaseInvoiceId])))];

    return ids.length === 0 ? new Map<string, PurchaseInvoiceFactsView>() : this.purchaseFacts.get().factsOf(ids);
  }

  private async wires(rows: readonly InvoiceRecord[]): Promise<InvoiceWire[]> {
    const people = await this.facts.people(rows.map((row) => row.recordedByEmployeeId));
    const purchases = await this.purchasesBehind(rows);
    const formatters = new Map<string, Awaited<ReturnType<BudgetFactsService['formatter']>>>();
    for (const code of new Set(rows.map((row) => row.currency))) formatters.set(code, await this.facts.formatter(code));

    return rows.map((row): InvoiceWire => {
      const money = formatters.get(row.currency) as Awaited<ReturnType<BudgetFactsService['formatter']>>;
      const purchase = row.purchaseInvoiceId === null ? undefined : purchases.get(row.purchaseInvoiceId);

      return {
        id: row.id,
        number: row.number,
        issuedOn: row.issuedOn,
        netAmount: money(row.netMinor),
        deductibleTax: money(row.deductibleTaxMinor),
        nonDeductibleTax: money(row.nonDeductibleTaxMinor),
        actualCost: money(row.actualCostMinor),
        matchResult: row.matchResult,
        servicePeriodMonth: row.serviceMonth === null ? null : row.serviceMonth.slice(0, 7),
        label: purchase?.label ?? null,
        paymentSource: purchase?.paymentSource ?? null,
        note: row.note,
        recordedBy: people.get(row.recordedByEmployeeId) ?? null,
        recordedAt: row.recordedAt.toISOString(),
      };
    });
  }
}
