import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  InvoiceDiscrepancyFilter,
  InvoiceDiscrepancyMismatch,
  InvoiceDiscrepancyOutcome,
  InvoiceDiscrepancyScope,
} from './invoice-discrepancy.types';

/** The columns of the invoice a case shows with it: both sides of what differs, and what finds the invoice. */
const WITH_INVOICE = {
  purchaseInvoice: {
    select: {
      id: true,
      vendorId: true,
      number: true,
      serviceMonth: true,
      linkKind: true,
      requestId: true,
      subscriptionId: true,
      quantity: true,
      unitPriceOriginalMinor: true,
      unitPriceOriginalCurrency: true,
      expectedQuantity: true,
      expectedUnitPriceOriginalMinor: true,
      expectedUnitPriceOriginalCurrency: true,
      netMinor: true,
    },
  },
} satisfies Prisma.InvoiceDiscrepancyCaseInclude;

export type InvoiceDiscrepancyRow = Prisma.InvoiceDiscrepancyCaseGetPayload<{ include: typeof WITH_INVOICE }>;

const scopeWhere = (scope: InvoiceDiscrepancyScope): Prisma.InvoiceDiscrepancyCaseWhereInput =>
  scope.kind === 'ALL'
    ? {}
    : {
        purchaseInvoice: {
          OR: [
            { submittedByEmployeeId: scope.employeeId },
            { request: { departmentId: { in: [...scope.departmentIds] } } },
          ],
        },
      };

/** The one writer of `invoice_discrepancy_cases`, and its reads: SQL only, no rule. */
@Injectable()
export class InvoiceDiscrepancyRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      purchaseInvoiceId: string;
      mismatches: readonly InvoiceDiscrepancyMismatch[];
      openedAt: Date;
    },
  ): Promise<{ id: string }> {
    return tx.invoiceDiscrepancyCase.create({
      data: {
        organizationId: input.organizationId,
        purchaseInvoiceId: input.purchaseInvoiceId,
        mismatches: [...input.mismatches],
        openedAt: input.openedAt,
      },
      select: { id: true },
    });
  }

  find(id: string, tx?: DbTx): Promise<InvoiceDiscrepancyRow | null> {
    return (tx ?? this.prisma).invoiceDiscrepancyCase.findUnique({ where: { id }, include: WITH_INVOICE });
  }

  /** The case locked `FOR UPDATE` until the transaction ends, so two closings of it queue; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<InvoiceDiscrepancyRow | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM invoice_discrepancy_cases WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  /** Records that Finance closed the case: who, when, how, why and the difference. One statement, and only from OPEN. */
  async markClosed(
    tx: DbTx,
    id: string,
    closing: { by: string; at: Date; outcome: InvoiceDiscrepancyOutcome; reason: string; differenceMinor: bigint },
  ): Promise<boolean> {
    const changed = await tx.invoiceDiscrepancyCase.updateMany({
      where: { id, state: 'OPEN' },
      data: {
        state: 'CLOSED',
        closedByEmployeeId: closing.by,
        closedAt: closing.at,
        outcome: closing.outcome,
        reason: closing.reason,
        differenceMinor: closing.differenceMinor,
      },
    });

    return changed.count === 1;
  }

  /** One page of the cases the scope may read, the newest opened first; the total is read in the same snapshot as the page. */
  async page(
    filter: InvoiceDiscrepancyFilter,
    scope: InvoiceDiscrepancyScope,
    skip: number,
    take: number,
  ): Promise<{ rows: InvoiceDiscrepancyRow[]; total: number }> {
    const where: Prisma.InvoiceDiscrepancyCaseWhereInput = {
      AND: [
        scopeWhere(scope),
        { ...(filter.state ? { state: filter.state } : {}), ...(filter.outcome ? { outcome: filter.outcome } : {}) },
      ],
    };

    return this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.invoiceDiscrepancyCase.findMany({
          where,
          include: WITH_INVOICE,
          orderBy: [{ openedAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
        }),
        total: await tx.invoiceDiscrepancyCase.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The case if the scope may read it: the same rule as the list, for one id. */
  readableBy(id: string, scope: InvoiceDiscrepancyScope): Promise<InvoiceDiscrepancyRow | null> {
    return this.prisma.invoiceDiscrepancyCase.findFirst({
      where: { AND: [{ id }, scopeWhere(scope)] },
      include: WITH_INVOICE,
    });
  }
}
