import { Injectable } from '@nestjs/common';
import { DONG } from '../../../core/money/money';
import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { CommitmentRepo } from '../budget/commitment.repo';
import { bookPurchaseInvoice, planInvoice, type PurchaseBooking } from '../budget/invoice.policy';
import { InvoiceRepo } from '../budget/invoice.repo';
import { PurchaseInvoiceRecordRefusedError } from '../public/budgets.errors';
import type { PurchaseInvoiceRecordInput, PurchaseInvoiceRecorded } from '../public/budgets.types';

/**
 * Writes the one invoice of a purchase invoice Finance signed (`PI-1`, `D3`), in the transaction of the signature. It is booked to the month the
 * purchase pays for: into the commitment of that year when the department that bears it is the commitment's own, otherwise as an expense of that
 * department with no commitment, and as a line of the subscription for an invoice of a subscription. The price is never judged against the budget
 * (`C-08`); what the invoice says about the count and the price of one is the match the purchase invoice already carries (`R-44`). The rows of the
 * commitments of the request are locked first, as a release does, so the two queue; the budget year is locked only for an expense with no commitment.
 */
@Injectable()
export class PurchaseInvoiceRecorderService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly invoices: InvoiceRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Throws PurchaseInvoiceRecordRefusedError. */
  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
  ): Promise<PurchaseInvoiceRecorded> {
    if (input.netMinor <= 0n || input.deductibleTaxMinor < 0n || input.nonDeductibleTaxMinor < 0n) {
      throw new PurchaseInvoiceRecordRefusedError('AMOUNT_NOT_POSITIVE');
    }
    const serviceYear = Number(input.serviceMonth.slice(0, 4));
    const rows =
      input.requestId !== null && input.subscriptionId === null
        ? await this.commitments.lockOfRequest(tx, input.requestId)
        : [];
    const booking = bookPurchaseInvoice({
      commitments: rows,
      serviceYear,
      chargedCostCenterId: input.chargedCostCenterId,
      subscriptionId: input.subscriptionId,
    });
    if (booking.kind === 'UNPLACED') throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');
    if (await this.invoices.exists(tx, input.organizationId, input.vendorId, input.number)) {
      throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
    }

    const placed = await this.place(tx, input, rows, booking, serviceYear);
    const actualCostMinor = input.netMinor + input.nonDeductibleTaxMinor;
    const subscriptionId = booking.kind === 'SUBSCRIPTION' ? booking.subscriptionId : null;
    const invoice = await this.insert(tx, {
      organizationId: input.organizationId,
      commitmentId: placed.commitmentId,
      vendorId: input.vendorId,
      number: input.number,
      issuedOn: input.issuedOn,
      currency: DONG,
      netMinor: input.netMinor,
      deductibleTaxMinor: input.deductibleTaxMinor,
      nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      actualCostMinor,
      appliedMinor: placed.appliedMinor,
      matchResult: placed.matchResult,
      note: null,
      recordedByEmployeeId: actor.employeeId,
      now: input.now,
      serviceMonth: input.serviceMonth,
      purchaseInvoiceId: input.purchaseInvoiceId,
      subscriptionId,
      costCenterId: placed.costCenterId,
    });
    await this.log(tx, actor, input, invoice.id, booking.kind, placed, actualCostMinor);

    return { invoiceId: invoice.id, booking: booking.kind, subscriptionId, actualCostMinor, ...placed };
  }

  private async log(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    invoiceId: string,
    booking: PurchaseBooking['kind'],
    placed: { commitmentId: string | null; costCenterId: string | null; appliedMinor: bigint; matchResult: string },
    actualCostMinor: bigint,
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'INVOICE.RECORDED', 'INVOICE', invoiceId, {
        purchaseInvoiceId: input.purchaseInvoiceId,
        serviceMonth: input.serviceMonth,
        booking,
        commitmentId: placed.commitmentId,
        costCenterId: placed.costCenterId,
        number: input.number,
        netMinor: input.netMinor.toString(),
        deductibleTaxMinor: input.deductibleTaxMinor.toString(),
        nonDeductibleTaxMinor: input.nonDeductibleTaxMinor.toString(),
        actualCostMinor: actualCostMinor.toString(),
        appliedMinor: placed.appliedMinor.toString(),
        matchResult: placed.matchResult,
      }),
    );
  }

  /** Takes the commitment down, or locks the budget year of the Cost Center that bears the expense; what the invoice is matched as follows. */
  private async place(
    tx: DbTx,
    input: PurchaseInvoiceRecordInput,
    rows: Awaited<ReturnType<CommitmentRepo['lockOfRequest']>>,
    booking: Exclude<PurchaseBooking, { kind: 'UNPLACED' }>,
    serviceYear: number,
  ): Promise<{
    commitmentId: string | null;
    costCenterId: string | null;
    appliedMinor: bigint;
    matchResult: PurchaseInvoiceRecorded['matchResult'];
  }> {
    const carriesTax = input.deductibleTaxMinor > 0n || input.nonDeductibleTaxMinor > 0n;
    let placed: Awaited<ReturnType<PurchaseInvoiceRecorderService['place']>> = {
      commitmentId: null,
      costCenterId: null,
      appliedMinor: 0n,
      matchResult: carriesTax ? 'TAX_ONLY' : 'MATCHED',
    };
    if (booking.kind === 'COMMITMENT') {
      const row = rows.find((candidate) => candidate.id === booking.commitmentId);
      if (!row) throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');
      const plan = planInvoice(row, await this.invoices.netRecorded(tx, row.id), {
        netMinor: input.netMinor,
        deductibleTaxMinor: input.deductibleTaxMinor,
        nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      });
      if (!plan.ok) throw new PurchaseInvoiceRecordRefusedError('AMOUNT_NOT_POSITIVE');
      await this.commitments.applyInvoice(tx, row, plan);
      placed = {
        commitmentId: row.id,
        costCenterId: null,
        appliedMinor: plan.takeMinor,
        matchResult: plan.matchResult,
      };
    } else if (booking.kind === 'COST_CENTER') {
      await this.yearLock.lock(tx, booking.costCenterId, [serviceYear]);
      placed = { ...placed, costCenterId: booking.costCenterId };
    }

    return input.matchResult === 'PRICE_QUANTITY_EXCEPTION'
      ? { ...placed, matchResult: 'PRICE_QUANTITY_EXCEPTION' }
      : placed;
  }

  /** A second invoice with the same number from the same vendor loses the race at the unique index and is told so. */
  private async insert(tx: DbTx, input: Parameters<InvoiceRepo['insert']>[1]) {
    try {
      return await this.invoices.insert(tx, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
      }
      throw error;
    }
  }
}
