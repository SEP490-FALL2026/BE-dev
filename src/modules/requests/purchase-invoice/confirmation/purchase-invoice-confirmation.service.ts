import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { BudgetsApi } from '../../../budgets/public/budgets.api';
import { PurchaseInvoiceRecordRefusedError } from '../../../budgets/public/budgets.errors';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { PurchaseInvoiceRefusedError } from '../purchase-invoice.errors';
import { PurchaseInvoiceRepo, type PurchaseInvoiceRow } from '../purchase-invoice.repo';

/**
 * Finance decides a purchase invoice, once (`PI-1.6`, `QĐ-111u`, `QĐ-111v`). Signing is the confirmation that the money may go out: the one invoice
 * is written in the same transaction, booked to the month and the year of the period, and what the IT Admin did outside the system (the transfer, the
 * card) is not asked of anyone again. The person who submitted it never signs it. Returning needs a reason and writes nothing. The row is
 * locked first, so two decisions of one invoice queue and the second finds it decided.
 *
 * An invoice whose count or price of one differs from what was approved or bought (`PRICE_QUANTITY_EXCEPTION`) is signed all the same and its
 * mark goes onto the invoice it writes; the case of `SBF-11a` that Finance works from it is opened by `RC-1`, which hooks in here.
 */
@Injectable()
export class PurchaseInvoiceConfirmationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly budgets: BudgetsApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
  ) {}

  /** Throws PurchaseInvoiceRefusedError (NOT_FOUND, NOT_SUBMITTED, SAME_PERSON, NUMBER_TAKEN, NO_PLACE). */
  async confirm(actor: AuthenticatedPrincipal, id: string): Promise<PurchaseInvoiceRow> {
    return this.runner.run(async (tx) => {
      const row = await this.submitted(tx, id);
      if (row.submittedByEmployeeId === actor.employeeId) throw new PurchaseInvoiceRefusedError('SAME_PERSON');
      const now = new Date();
      const recorded = await this.record(tx, actor, row, now);
      if (!(await this.invoices.markConfirmed(tx, id, actor.employeeId, now, recorded.invoiceId))) {
        throw new PurchaseInvoiceRefusedError('NOT_SUBMITTED');
      }
      await this.trail(tx, actor, row, 'CONFIRMED', { invoiceId: recorded.invoiceId, booking: recorded.booking });
      await this.tell(tx, row, 'PURCHASE_INVOICE_CONFIRMED');

      return (await this.invoices.find(id, tx)) as PurchaseInvoiceRow;
    });
  }

  /** Throws PurchaseInvoiceRefusedError (NOT_FOUND, NOT_SUBMITTED). */
  async giveBack(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<PurchaseInvoiceRow> {
    return this.runner.run(async (tx) => {
      const row = await this.submitted(tx, id);
      if (!(await this.invoices.markReturned(tx, id, actor.employeeId, new Date(), reason))) {
        throw new PurchaseInvoiceRefusedError('NOT_SUBMITTED');
      }
      await this.trail(tx, actor, row, 'RETURNED', { reason });
      await this.tell(tx, row, 'PURCHASE_INVOICE_RETURNED');

      return (await this.invoices.find(id, tx)) as PurchaseInvoiceRow;
    });
  }

  /** The invoice locked, as long as it still waits for Finance. */
  private async submitted(tx: DbTx, id: string): Promise<PurchaseInvoiceRow> {
    const row = await this.invoices.lock(tx, id);
    if (!row) throw new PurchaseInvoiceRefusedError('NOT_FOUND');
    if (row.state !== 'SUBMITTED') throw new PurchaseInvoiceRefusedError('NOT_SUBMITTED');

    return row;
  }

  private async record(tx: DbTx, actor: AuthenticatedPrincipal, row: PurchaseInvoiceRow, now: Date) {
    try {
      return await this.budgets.recordPurchaseInvoice(tx, actor, {
        organizationId: row.organizationId,
        purchaseInvoiceId: row.id,
        requestId: row.requestId,
        subscriptionId: row.linkKind === 'SUBSCRIPTION' ? row.subscriptionId : null,
        vendorId: row.vendorId,
        number: row.number,
        issuedOn: fromDateColumn(row.issuedOn),
        serviceMonth: fromDateColumn(row.serviceMonth),
        netMinor: row.netMinor,
        deductibleTaxMinor: row.deductibleTaxMinor,
        nonDeductibleTaxMinor: row.nonDeductibleTaxMinor,
        matchResult: row.matchResult === 'PRICE_QUANTITY_EXCEPTION' ? 'PRICE_QUANTITY_EXCEPTION' : 'MATCHED',
        chargedCostCenterId: row.chargedCostCenterId,
        now,
      });
    } catch (error) {
      if (error instanceof PurchaseInvoiceRecordRefusedError) {
        throw new PurchaseInvoiceRefusedError(error.reason === 'DUPLICATE_NUMBER' ? 'NUMBER_TAKEN' : 'NO_PLACE');
      }
      throw error;
    }
  }

  private async trail(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    row: PurchaseInvoiceRow,
    decision: 'CONFIRMED' | 'RETURNED',
    after: { [key: string]: string },
  ): Promise<void> {
    await this.audit.record(tx, {
      organizationId: row.organizationId,
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      actorRoles: actor.roles,
      action: `PURCHASE_INVOICE.${decision}`,
      resourceType: 'PURCHASE_INVOICE',
      resourceId: row.id,
      before: { state: row.state },
      after: { state: decision, ...after },
      correlationId: actor.sessionId,
    });
  }

  /** The inbox of the IT Admin who submitted the invoice. */
  private async tell(
    tx: DbTx,
    row: PurchaseInvoiceRow,
    code: 'PURCHASE_INVOICE_CONFIRMED' | 'PURCHASE_INVOICE_RETURNED',
  ): Promise<void> {
    await this.notifications.notifyInApp(tx, {
      organizationId: row.organizationId,
      recipientEmployeeId: row.submittedByEmployeeId,
      code,
      subject: { type: 'PURCHASE_INVOICE', id: row.id },
      params: {
        purchaseInvoiceId: row.id,
        linkKind: row.linkKind,
        servicePeriodMonth: row.serviceMonth.toISOString().slice(0, 7),
      },
      eventKey: `${code}:${row.id}`,
    });
  }
}
