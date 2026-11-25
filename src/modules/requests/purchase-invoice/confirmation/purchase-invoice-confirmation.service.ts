import { Injectable } from '@nestjs/common';
import { businessDateAt, fromDateColumn } from '../../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { BudgetsApi } from '../../../budgets/public/budgets.api';
import { PurchaseInvoiceRecordRefusedError } from '../../../budgets/public/budgets.errors';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import { firstOfMonth } from '../labels/purchase-invoice-labels.policy';
import {
  evaluatePoolInvoiceExpectation,
  type PoolInvoiceExpectationResult,
} from '../pool-expectation/purchase-invoice-pool-expectation.policy';
import { PurchaseInvoicePlanService } from '../purchase-invoice-plan.service';
import { PurchaseInvoiceRefusedError } from '../purchase-invoice.errors';
import { PurchaseInvoiceRepo, type PurchaseInvoiceRow } from '../purchase-invoice.repo';
import { ConfirmationSettlementService } from './confirmation-settlement.service';

const VARIANCE_THRESHOLD_PARAM = 'K2_INVOICE_VARIANCE_THRESHOLD_PERCENT';

/**
 * Finance decides a purchase invoice, once (`PI-1.6`, `QĐ-111u`, `QĐ-111v`). Signing is the confirmation that the money may go out: the one invoice
 * is written in the same transaction, booked to the month and the year of the period, and what the IT Admin did outside the system (the transfer, the
 * card) is not asked of anyone again. The person who submitted it never signs it. Returning needs a reason and writes nothing. The row is
 * locked first, so two decisions of one invoice queue and the second finds it decided.
 *
 * An invoice whose count, unit price, or pooled-quota expected amount differs beyond threshold is signed all the same: its
 * mark goes onto the invoice it writes, and in the same transaction one discrepancy case merging all mismatches is opened.
 */
@Injectable()
export class PurchaseInvoiceConfirmationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly budgets: BudgetsApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
    private readonly settlement: ConfirmationSettlementService,
    private readonly plans: PurchaseInvoicePlanService,
    private readonly operatingParameters: OperatingParametersApi,
  ) {}

  /** Throws PurchaseInvoiceRefusedError (NOT_FOUND, NOT_SUBMITTED, SAME_PERSON, NUMBER_TAKEN, NO_PLACE). */
  async confirm(actor: AuthenticatedPrincipal, id: string): Promise<PurchaseInvoiceRow> {
    return this.runner.run(async (tx) => {
      const row = await this.submitted(tx, id);
      if (row.submittedByEmployeeId === actor.employeeId) throw new PurchaseInvoiceRefusedError('SAME_PERSON');
      const now = new Date();
      const poolFacts = await this.plans.poolExpectationFactsOf(row, tx);
      const poolExpectation = await this.evaluatePoolExpectation(tx, row, poolFacts, now);
      const poolSubscriptionId = row.linkKind === 'REQUEST' && poolFacts.isK2 ? poolFacts.poolSubscriptionId : null;
      const recorded = await this.record(tx, actor, row, now, {
        poolSubscriptionId,
        poolFigures: poolExpectation?.poolFigures ?? null,
      });
      if (!(await this.invoices.markConfirmed(tx, id, actor.employeeId, now, recorded.invoiceId))) {
        throw new PurchaseInvoiceRefusedError('NOT_SUBMITTED');
      }
      await this.trail(tx, actor, row, 'CONFIRMED', {
        invoiceId: recorded.invoiceId,
        booking: recorded.booking,
        ...(await this.selfSigned(tx, actor, row)),
      });
      await this.settlement.settle(tx, actor, row, recorded.invoiceId, poolExpectation?.exceedsThreshold ?? false, now);
      await this.tell(tx, row, 'PURCHASE_INVOICE_CONFIRMED');

      return (await this.invoices.find(id, tx)) as PurchaseInvoiceRow;
    });
  }

  private async evaluatePoolExpectation(
    tx: DbTx,
    row: PurchaseInvoiceRow,
    poolFacts: Awaited<ReturnType<PurchaseInvoicePlanService['poolExpectationFactsOf']>>,
    now: Date,
  ): Promise<PoolInvoiceExpectationResult | null> {
    if (!poolFacts.isK2) return null;
    const thresholdPercent = Number(await this.operatingParameters.getValue(VARIANCE_THRESHOLD_PARAM, tx));
    const varianceMonth = firstOfMonth(businessDateAt(now, poolFacts.timeZone));

    return evaluatePoolInvoiceExpectation({
      source: poolFacts.source,
      netMinor: row.netMinor,
      nonDeductibleTaxMinor: row.nonDeductibleTaxMinor,
      thresholdPercent,
      varianceMonth,
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

  /** The audit flag of a signature by Finance on an invoice of a request they are themselves a beneficiary of: allowed, and never silent (`QĐ-104h`). */
  private async selfSigned(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    row: PurchaseInvoiceRow,
  ): Promise<{ selfBeneficiary?: true }> {
    return row.requestId !== null && (await this.invoices.isBeneficiary(tx, row.requestId, actor.employeeId))
      ? { selfBeneficiary: true }
      : {};
  }

  /** The invoice locked, as long as it still waits for Finance. */
  private async submitted(tx: DbTx, id: string): Promise<PurchaseInvoiceRow> {
    const row = await this.invoices.lock(tx, id);
    if (!row) throw new PurchaseInvoiceRefusedError('NOT_FOUND');
    if (row.state !== 'SUBMITTED') throw new PurchaseInvoiceRefusedError('NOT_SUBMITTED');

    return row;
  }

  private async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    row: PurchaseInvoiceRow,
    now: Date,
    pool: {
      poolSubscriptionId: string | null;
      poolFigures: PoolInvoiceExpectationResult['poolFigures'] | null;
    },
  ) {
    const unallocated = await this.unallocatedOf(tx, row);
    try {
      return await this.budgets.recordPurchaseInvoice(tx, actor, {
        organizationId: row.organizationId,
        purchaseInvoiceId: row.id,
        requestId: row.requestId,
        subscriptionId: row.linkKind === 'SUBSCRIPTION' ? row.subscriptionId : pool.poolSubscriptionId,
        vendorId: row.vendorId,
        number: row.number,
        issuedOn: fromDateColumn(row.issuedOn),
        serviceMonth: fromDateColumn(row.serviceMonth),
        netMinor: row.netMinor,
        deductibleTaxMinor: row.deductibleTaxMinor,
        nonDeductibleTaxMinor: row.nonDeductibleTaxMinor,
        matchResult: row.matchResult === 'PRICE_QUANTITY_EXCEPTION' ? 'PRICE_QUANTITY_EXCEPTION' : 'MATCHED',
        chargedCostCenterId: pool.poolSubscriptionId === null ? row.chargedCostCenterId : null,
        unallocated,
        poolFigures: pool.poolFigures,
        now,
      });
    } catch (error) {
      if (error instanceof PurchaseInvoiceRecordRefusedError) {
        throw new PurchaseInvoiceRefusedError(error.reason === 'DUPLICATE_NUMBER' ? 'NUMBER_TAKEN' : 'NO_PLACE');
      }
      throw error;
    }
  }

  /** What the plan decided when the invoice was submitted: the line of the Cost Center not allocated, with the department of the user of the request. */
  private async unallocatedOf(
    tx: DbTx,
    row: PurchaseInvoiceRow,
  ): Promise<{ reason: 'K1_GRANT_FAILED'; departmentId: string } | null> {
    if (row.unallocatedReason !== 'K1_GRANT_FAILED' || row.requestId === null) return null;
    const request = await this.invoices.requestFacts(row.requestId, tx);
    if (!request) throw new PurchaseInvoiceRefusedError('NO_PLACE');

    return { reason: 'K1_GRANT_FAILED', departmentId: request.departmentId };
  }

  private async trail(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    row: PurchaseInvoiceRow,
    decision: 'CONFIRMED' | 'RETURNED',
    after: { [key: string]: string | boolean },
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
