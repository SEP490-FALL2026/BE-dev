import { Injectable } from '@nestjs/common';
import { DONG } from '../../../core/money/money';
import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import { OutOfProcessSpendRefusedError } from '../public/budgets.errors';
import type { OutOfProcessSpendInput, OutOfProcessSpendRecorded } from '../public/budgets.types';

/** The number the one invoice of a case outside the process carries: the vendor has it once, so the case is recorded once. */
export const outOfProcessInvoiceNumber = (caseId: string): string => `OOP-${caseId}`;

/**
 * Writes the money of a case outside the process (`SBF-07a`, R-45): what was already spent, with a proof of payment, as an actual expense in dong with
 * no commitment behind it, booked to the month the money was recorded in and to the Cost Center that bears it, or to none yet. The budget year of the
 * Cost Center is locked first, as the expense of a purchase invoice does. The price is never judged against the budget (`C-08`): it was spent.
 */
@Injectable()
export class OutOfProcessSpendRecorderService {
  constructor(
    private readonly invoices: InvoiceRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Throws OutOfProcessSpendRefusedError. */
  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: OutOfProcessSpendInput,
  ): Promise<OutOfProcessSpendRecorded> {
    if (input.amountMinor <= 0n) throw new OutOfProcessSpendRefusedError('AMOUNT_NOT_POSITIVE');
    const number = outOfProcessInvoiceNumber(input.caseId);
    if (await this.invoices.exists(tx, input.organizationId, input.vendorId, number)) {
      throw new OutOfProcessSpendRefusedError('DUPLICATE_NUMBER');
    }
    const serviceMonth = `${input.recordedOn.slice(0, 7)}-01`;
    if (input.costCenterId !== null) {
      await this.yearLock.lock(tx, input.costCenterId, [Number(input.recordedOn.slice(0, 4))]);
    }
    let invoice;
    try {
      invoice = await this.invoices.insert(tx, {
        organizationId: input.organizationId,
        commitmentId: null,
        vendorId: input.vendorId,
        number,
        issuedOn: input.recordedOn,
        currency: DONG,
        netMinor: input.amountMinor,
        deductibleTaxMinor: 0n,
        nonDeductibleTaxMinor: 0n,
        actualCostMinor: input.amountMinor,
        appliedMinor: 0n,
        matchResult: 'MATCHED',
        note: null,
        recordedByEmployeeId: actor.employeeId,
        now: input.now,
        serviceMonth,
        costCenterId: input.costCenterId,
        outOfProcessCaseId: input.caseId,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new OutOfProcessSpendRefusedError('DUPLICATE_NUMBER');
      }
      throw error;
    }
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'INVOICE.RECORDED', 'INVOICE', invoice.id, {
        outOfProcessCaseId: input.caseId,
        serviceMonth,
        booking: input.costCenterId === null ? 'UNALLOCATED' : 'COST_CENTER',
        costCenterId: input.costCenterId,
        number,
        actualCostMinor: input.amountMinor.toString(),
      }),
    );

    return { invoiceId: invoice.id, booking: input.costCenterId === null ? 'UNALLOCATED' : 'COST_CENTER' };
  }
}
