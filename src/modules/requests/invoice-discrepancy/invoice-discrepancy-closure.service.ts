import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { InvoiceDiscrepancyReferralListeners } from '../public/requests.extension-points';
import { closureRefusal, isReferred } from './invoice-discrepancy-closure.policy';
import { InvoiceDiscrepancyRefusedError } from './invoice-discrepancy.errors';
import { InvoiceDiscrepancyRepo, type InvoiceDiscrepancyRow } from './invoice-discrepancy.repo';
import type { InvoiceDiscrepancyMismatch, InvoiceDiscrepancyOutcome } from './invoice-discrepancy.types';

/**
 * Finance closes the case of an invoice that differs, once, with the reason and the difference it works out (`RC-1`, `QĐ-111y`, `R-29`). The case
 * is locked first, so two closings of it queue and the second finds it closed. An explanation ends it. A suspicion that someone paid for the software
 * outside the process is told, in the same transaction, to the contexts that take it up (`SBF-08`): the case is never closed without that
 * entry, and if the entry is refused the closing is undone. The money of the invoice is in the expense already; closing writes none.
 */
@Injectable()
export class InvoiceDiscrepancyClosureService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly cases: InvoiceDiscrepancyRepo,
    private readonly finance: FinanceApi,
    private readonly audit: AuditApi,
    private readonly referrals: InvoiceDiscrepancyReferralListeners,
  ) {}

  /** Throws InvoiceDiscrepancyRefusedError (NOT_FOUND, ALREADY_CLOSED, DIFFERENCE_INVALID) and the money errors of `core/money`. */
  async close(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { outcome: InvoiceDiscrepancyOutcome; reason: string; differenceAmount: string },
  ): Promise<InvoiceDiscrepancyRow> {
    const difference = (
      await this.finance.parseMoney({ amount: input.differenceAmount, currency: 'VND' }, 'differenceAmount')
    ).amountMinor;
    if (closureRefusal({ outcome: input.outcome, differenceMinor: difference }) !== null) {
      throw new InvoiceDiscrepancyRefusedError('DIFFERENCE_INVALID');
    }

    return this.runner.run(async (tx) => {
      const row = await this.cases.lock(tx, id);
      if (!row) throw new InvoiceDiscrepancyRefusedError('NOT_FOUND');
      if (row.state !== 'OPEN') throw new InvoiceDiscrepancyRefusedError('ALREADY_CLOSED');
      const now = new Date();
      const closing = {
        by: actor.employeeId,
        at: now,
        outcome: input.outcome,
        reason: input.reason,
        differenceMinor: difference,
      };
      if (!(await this.cases.markClosed(tx, id, closing))) throw new InvoiceDiscrepancyRefusedError('ALREADY_CLOSED');
      await this.audit.record(tx, {
        organizationId: row.organizationId,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'INVOICE_DISCREPANCY.CLOSED',
        resourceType: 'INVOICE_DISCREPANCY',
        resourceId: id,
        before: { state: 'OPEN' },
        after: { state: 'CLOSED', outcome: input.outcome, differenceMinor: difference.toString() },
        correlationId: actor.sessionId,
      });
      if (isReferred(input.outcome)) await this.referrals.emit(tx, referralOf(row, closing));

      return (await this.cases.find(id, tx)) as InvoiceDiscrepancyRow;
    });
  }
}

/** The case as the contexts that take it up read it: both sides of what differs and the money Finance could not account for. */
function referralOf(
  row: InvoiceDiscrepancyRow,
  closing: { by: string; at: Date; reason: string; differenceMinor: bigint },
) {
  const invoice = row.purchaseInvoice;
  const expectedPrice =
    invoice.expectedUnitPriceOriginalMinor !== null && invoice.expectedUnitPriceOriginalCurrency !== null
      ? { amountMinor: invoice.expectedUnitPriceOriginalMinor, currency: invoice.expectedUnitPriceOriginalCurrency }
      : null;

  return {
    organizationId: row.organizationId,
    caseId: row.id,
    purchaseInvoiceId: invoice.id,
    vendorId: invoice.vendorId,
    requestId: invoice.requestId,
    subscriptionId: invoice.subscriptionId,
    mismatches: row.mismatches as InvoiceDiscrepancyMismatch[],
    quantity: { invoice: invoice.quantity, expected: invoice.expectedQuantity },
    unitPrice: {
      invoice: { amountMinor: invoice.unitPriceOriginalMinor, currency: invoice.unitPriceOriginalCurrency },
      expected: expectedPrice,
    },
    differenceMinor: closing.differenceMinor,
    reason: closing.reason,
    closedByEmployeeId: closing.by,
    closedAt: closing.at,
  };
}
