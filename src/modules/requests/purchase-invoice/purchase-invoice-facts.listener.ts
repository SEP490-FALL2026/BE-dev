import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  PurchaseInvoiceFactsHook,
  type PurchaseInvoiceFacts as PurchaseInvoiceFactsPort,
  type PurchaseInvoiceFactsView,
} from '../../budgets/public/budgets.extension-points';
import { PurchaseInvoiceRepo } from './purchase-invoice.repo';

/**
 * Tells the budgets what the purchase invoice behind each invoice of a page was: the label it was given and how it was paid. It reads the whole page
 * at once, and binds itself to the budgets' hook when the module starts, so the budgets never import this module (ADR-0016, ADR-0019).
 */
@Injectable()
export class PurchaseInvoiceFacts implements PurchaseInvoiceFactsPort, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [PurchaseInvoiceFactsHook] as const;

  constructor(
    private readonly purchases: PurchaseInvoiceRepo,
    private readonly hook: PurchaseInvoiceFactsHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async factsOf(purchaseInvoiceIds: readonly string[]): Promise<Map<string, PurchaseInvoiceFactsView>> {
    const rows = await this.purchases.labelsOf(purchaseInvoiceIds);

    return new Map(rows.map((row) => [row.id, { label: row.label, paymentSource: row.paymentSource }]));
  }
}
