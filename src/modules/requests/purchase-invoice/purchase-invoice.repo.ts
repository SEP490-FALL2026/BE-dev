import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

export type PurchaseInvoiceRow = Prisma.PurchaseInvoiceGetPayload<object>;

/** What a purchase invoice reads of the request it names (the requests context keeps these tables). */
export interface RequestPurchaseFacts {
  id: string;
  organizationId: string;
  type: 'GRANT' | 'SERVICE_ACCOUNT' | 'RENEWAL' | 'GROUP_GRANT';
  state: string;
  planId: string | null;
  departmentId: string;
  costCenterId: string | null;
  termMonths: number | null;
  grantCompletedAt: Date | null;
  /** The people the request is for: the seats it was approved for. */
  beneficiaryCount: number;
  /** The seat a request that goes on using a right renews. */
  renewedAssignmentId: string | null;
}

export interface NewPurchaseInvoice {
  organizationId: string;
  linkKind: 'REQUEST' | 'SUBSCRIPTION';
  requestId: string | null;
  provisioningTaskId: string | null;
  subscriptionId: string | null;
  vendorId: string;
  number: string;
  issuedOn: BusinessDate;
  serviceMonth: BusinessDate;
  label: 'NEW_PURCHASE' | 'PERIOD' | 'RENEWAL';
  periodIndex: number | null;
  periodCount: number | null;
  quantity: number;
  unitPriceOriginalMinor: bigint;
  unitPriceOriginalCurrency: string;
  netMinor: bigint;
  deductibleTaxMinor: bigint;
  nonDeductibleTaxMinor: bigint;
  matchResult: 'MATCHED' | 'PRICE_QUANTITY_EXCEPTION';
  paymentSource: 'COMPANY_CARD' | 'IT_ADVANCE';
  flags: string[];
  chargedCostCenterId: string | null;
  submittedByEmployeeId: string;
  submittedAt: Date;
  resubmissionOfId: string | null;
}

export interface PurchaseInvoiceFilter {
  state?: 'SUBMITTED' | 'CONFIRMED' | 'RETURNED';
  label?: 'NEW_PURCHASE' | 'PERIOD' | 'RENEWAL';
  vendorId?: string;
  subscriptionId?: string;
  requestId?: string;
  serviceMonth?: BusinessDate;
}

/** Whom a list is for: Finance reads every invoice; the IT Admin reads their own submissions and the ones of the requests they work (D8). */
export type PurchaseInvoiceScope =
  { kind: 'ALL' } | { kind: 'IT_ADMIN'; employeeId: string; departmentIds: readonly string[] };

const scopeWhere = (scope: PurchaseInvoiceScope): Prisma.PurchaseInvoiceWhereInput =>
  scope.kind === 'ALL'
    ? {}
    : {
        OR: [
          { submittedByEmployeeId: scope.employeeId },
          { request: { departmentId: { in: [...scope.departmentIds] } } },
        ],
      };

/** The one writer of `purchase_invoices` and `purchase_invoice_documents`, and their reads: SQL only, no rule. */
@Injectable()
export class PurchaseInvoiceRepo {
  constructor(private readonly prisma: PrismaService) {}

  async requestFacts(requestId: string, tx?: DbTx): Promise<RequestPurchaseFacts | null> {
    const row = await (tx ?? this.prisma).accessRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        organizationId: true,
        type: true,
        state: true,
        planId: true,
        departmentId: true,
        costCenterId: true,
        termMonths: true,
        grantCompletedAt: true,
        renewal: { select: { assignmentId: true } },
        _count: { select: { beneficiaries: true } },
      },
    });

    return (
      row && {
        id: row.id,
        organizationId: row.organizationId,
        type: row.type,
        state: row.state,
        planId: row.planId,
        departmentId: row.departmentId,
        costCenterId: row.costCenterId,
        termMonths: row.termMonths,
        grantCompletedAt: row.grantCompletedAt,
        beneficiaryCount: row._count.beneficiaries,
        renewedAssignmentId: row.renewal?.assignmentId ?? null,
      }
    );
  }

  /** How many submissions of the request or subscription were not returned, and the month the earliest of them pays for. */
  async earlierOf(
    link: { requestId: string } | { subscriptionId: string },
    tx?: DbTx,
  ): Promise<{ count: number; earliestServiceMonth: BusinessDate | null }> {
    const aggregate = await (tx ?? this.prisma).purchaseInvoice.aggregate({
      where: { ...link, state: { not: 'RETURNED' } },
      _count: { _all: true },
      _min: { serviceMonth: true },
    });

    return {
      count: aggregate._count._all,
      earliestServiceMonth: aggregate._min.serviceMonth ? fromDateColumn(aggregate._min.serviceMonth) : null,
    };
  }

  /** Whether an invoice of the vendor with this number is open (not returned); the database refuses a second one in any case. */
  async numberIsOpen(tx: DbTx, organizationId: string, vendorId: string, number: string): Promise<boolean> {
    return (
      (await tx.purchaseInvoice.count({
        where: { organizationId, vendorId, number, state: { not: 'RETURNED' } },
      })) > 0
    );
  }

  async insert(tx: DbTx, input: NewPurchaseInvoice): Promise<PurchaseInvoiceRow> {
    return tx.purchaseInvoice.create({
      data: {
        organizationId: input.organizationId,
        linkKind: input.linkKind,
        requestId: input.requestId,
        provisioningTaskId: input.provisioningTaskId,
        subscriptionId: input.subscriptionId,
        vendorId: input.vendorId,
        number: input.number,
        issuedOn: toDateColumn(input.issuedOn),
        serviceMonth: toDateColumn(input.serviceMonth),
        label: input.label,
        periodIndex: input.periodIndex,
        periodCount: input.periodCount,
        quantity: input.quantity,
        unitPriceOriginalMinor: input.unitPriceOriginalMinor,
        unitPriceOriginalCurrency: input.unitPriceOriginalCurrency,
        netMinor: input.netMinor,
        deductibleTaxMinor: input.deductibleTaxMinor,
        nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
        matchResult: input.matchResult,
        paymentSource: input.paymentSource,
        flags: input.flags,
        chargedCostCenterId: input.chargedCostCenterId,
        submittedByEmployeeId: input.submittedByEmployeeId,
        submittedAt: input.submittedAt,
        resubmissionOfId: input.resubmissionOfId,
      },
    });
  }

  /** The files of the invoice, in the order the IT Admin gave them. */
  async linkDocuments(tx: DbTx, purchaseInvoiceId: string, documentIds: readonly string[]): Promise<void> {
    await tx.purchaseInvoiceDocument.createMany({
      data: documentIds.map((documentId, at) => ({ purchaseInvoiceId, documentId, position: at + 1 })),
    });
  }

  find(id: string, tx?: DbTx): Promise<PurchaseInvoiceRow | null> {
    return (tx ?? this.prisma).purchaseInvoice.findUnique({ where: { id } });
  }

  /** The row locked `FOR UPDATE` until the transaction ends, so a signature and a return of one invoice queue; null when there is none. */
  async lock(tx: DbTx, id: string): Promise<PurchaseInvoiceRow | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM purchase_invoices WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.find(id, tx);
  }

  /** Records that Finance signed the invoice: the person, the time, and the invoice that was written. One statement, and only from SUBMITTED. */
  async markConfirmed(tx: DbTx, id: string, by: string, at: Date, invoiceId: string): Promise<boolean> {
    const changed = await tx.purchaseInvoice.updateMany({
      where: { id, state: 'SUBMITTED' },
      data: { state: 'CONFIRMED', decidedByEmployeeId: by, decidedAt: at, invoiceId },
    });

    return changed.count === 1;
  }

  /** Records that Finance returned the invoice with a reason. One statement, and only from SUBMITTED. */
  async markReturned(tx: DbTx, id: string, by: string, at: Date, reason: string): Promise<boolean> {
    const changed = await tx.purchaseInvoice.updateMany({
      where: { id, state: 'SUBMITTED' },
      data: { state: 'RETURNED', decidedByEmployeeId: by, decidedAt: at, returnReason: reason },
    });

    return changed.count === 1;
  }

  /** One page of the purchases the scope may read, the newest submitted first; the total is read in the same snapshot as the page. */
  async page(
    filter: PurchaseInvoiceFilter,
    scope: PurchaseInvoiceScope,
    skip: number,
    take: number,
  ): Promise<{ rows: PurchaseInvoiceRow[]; total: number }> {
    const where: Prisma.PurchaseInvoiceWhereInput = {
      AND: [
        scopeWhere(scope),
        {
          ...(filter.state ? { state: filter.state } : {}),
          ...(filter.label ? { label: filter.label } : {}),
          ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
          ...(filter.subscriptionId ? { subscriptionId: filter.subscriptionId } : {}),
          ...(filter.requestId ? { requestId: filter.requestId } : {}),
          ...(filter.serviceMonth ? { serviceMonth: toDateColumn(filter.serviceMonth) } : {}),
        },
      ],
    };

    return this.prisma.$transaction(
      async (tx) => ({
        rows: await tx.purchaseInvoice.findMany({
          where,
          orderBy: [{ submittedAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
        }),
        total: await tx.purchaseInvoice.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Whether the invoice may be read by the scope: the same rule as the list, for one id. */
  async readableBy(id: string, scope: PurchaseInvoiceScope): Promise<PurchaseInvoiceRow | null> {
    return this.prisma.purchaseInvoice.findFirst({ where: { AND: [{ id }, scopeWhere(scope)] } });
  }

  /** The files of each invoice, in order, in one read. */
  async documentsOf(ids: readonly string[]): Promise<Map<string, { documentId: string; position: number }[]>> {
    const rows = await this.prisma.purchaseInvoiceDocument.findMany({
      where: { purchaseInvoiceId: { in: [...ids] } },
      orderBy: [{ purchaseInvoiceId: 'asc' }, { position: 'asc' }],
    });
    const byInvoice = new Map<string, { documentId: string; position: number }[]>();
    for (const row of rows) {
      const list = byInvoice.get(row.purchaseInvoiceId) ?? [];
      list.push({ documentId: row.documentId, position: row.position });
      byInvoice.set(row.purchaseInvoiceId, list);
    }

    return byInvoice;
  }

  /** For each of these returned submissions, the one submitted again in its place, in one read. */
  async resubmittedAs(ids: readonly string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.purchaseInvoice.findMany({
      where: { resubmissionOfId: { in: [...ids] } },
      select: { id: true, resubmissionOfId: true },
    });

    return new Map(rows.flatMap((row) => (row.resubmissionOfId ? [[row.resubmissionOfId, row.id] as const] : [])));
  }
}
