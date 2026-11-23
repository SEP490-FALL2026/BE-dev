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

/** What a completed grant for months of use says of the payment days of its right (`PI-2`). */
export interface TermGrantFacts {
  id: string;
  planId: string;
  departmentId: string;
  grantCompletedAt: Date;
  termMonths: number;
}

/** The months that each request or subscription has a purchase invoice for that was not returned, as `YYYY-MM`, by the id of the request or subscription. */
export interface OpenServiceMonths {
  byRequest: Map<string, Set<string>>;
  bySubscription: Map<string, Set<string>>;
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
  /** What the invoice was read against (R-44); null for a side nobody knew. */
  expectedQuantity: number | null;
  expectedUnitPriceOriginalMinor: bigint | null;
  expectedUnitPriceOriginalCurrency: string | null;
  paymentSource: 'COMPANY_CARD' | 'IT_ADVANCE';
  flags: string[];
  chargedCostCenterId: string | null;
  unallocatedReason: 'K1_GRANT_FAILED' | null;
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

  /**
   * Whether an invoice of the vendor with this number is open (not returned), whatever the case and the white space of either number; the database refuses a second one
   * in any case. The key is the expression of the unique index `purchase_invoices_number_open_normalized_key`, written the same way: the class of white space is
   * `[[:space:]]` and never a backslash class, which a JavaScript template would lose on the way.
   */
  async numberIsOpen(tx: DbTx, organizationId: string, vendorId: string, number: string): Promise<boolean> {
    const rows = await tx.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM purchase_invoices
         WHERE organization_id = ${organizationId}::uuid
           AND vendor_id = ${vendorId}::uuid
           AND state <> 'RETURNED'
           AND lower(regexp_replace(number, '[[:space:]]', '', 'g')) = lower(regexp_replace(${number}::text, '[[:space:]]', '', 'g'))
      ) AS found`;

    return rows[0]?.found === true;
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
        expectedQuantity: input.expectedQuantity,
        expectedUnitPriceOriginalMinor: input.expectedUnitPriceOriginalMinor,
        expectedUnitPriceOriginalCurrency: input.expectedUnitPriceOriginalCurrency,
        paymentSource: input.paymentSource,
        flags: input.flags,
        chargedCostCenterId: input.chargedCostCenterId,
        unallocatedReason: input.unallocatedReason,
        submittedByEmployeeId: input.submittedByEmployeeId,
        submittedAt: input.submittedAt,
        resubmissionOfId: input.resubmissionOfId,
      },
    });
  }

  /**
   * The requests whose grant was completed since `since` for months of use up to `maxTermMonths`, oldest first: the rights that may still be
   * paying by the month (`PI-2`). `departmentIds` narrows to the ones named, null reads every department, an empty list reads none. One statement.
   */
  async completedTermGrants(
    input: { departmentIds: readonly string[] | null; maxTermMonths: number; since: Date },
    tx?: DbTx,
  ): Promise<TermGrantFacts[]> {
    if (input.departmentIds !== null && input.departmentIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).accessRequest.findMany({
      where: {
        type: { in: ['GRANT', 'GROUP_GRANT'] },
        state: 'COMPLETED',
        planId: { not: null },
        termMonths: { gte: 1, lte: input.maxTermMonths },
        grantCompletedAt: { gte: input.since },
        ...(input.departmentIds === null ? {} : { departmentId: { in: [...input.departmentIds] } }),
      },
      select: { id: true, planId: true, departmentId: true, grantCompletedAt: true, termMonths: true },
      orderBy: [{ grantCompletedAt: 'asc' }, { id: 'asc' }],
    });

    return rows.flatMap((row) =>
      row.planId !== null && row.grantCompletedAt !== null && row.termMonths !== null
        ? [
            {
              id: row.id,
              planId: row.planId,
              departmentId: row.departmentId,
              grantCompletedAt: row.grantCompletedAt,
              termMonths: row.termMonths,
            },
          ]
        : [],
    );
  }

  /** The months each of these requests and renewals has a purchase invoice for that was not returned, in one statement whatever the number of links. */
  async openServiceMonths(
    links: { requestIds: readonly string[]; subscriptionIds: readonly string[] },
    tx?: DbTx,
  ): Promise<OpenServiceMonths> {
    const months: OpenServiceMonths = { byRequest: new Map(), bySubscription: new Map() };
    if (links.requestIds.length === 0 && links.subscriptionIds.length === 0) return months;
    const rows = await (tx ?? this.prisma).purchaseInvoice.findMany({
      where: {
        state: { not: 'RETURNED' },
        OR: [
          ...(links.requestIds.length > 0 ? [{ requestId: { in: [...links.requestIds] } }] : []),
          ...(links.subscriptionIds.length > 0 ? [{ subscriptionId: { in: [...links.subscriptionIds] } }] : []),
        ],
      },
      select: { requestId: true, subscriptionId: true, serviceMonth: true },
    });
    for (const row of rows) {
      const [bucket, id] =
        row.requestId !== null ? [months.byRequest, row.requestId] : [months.bySubscription, row.subscriptionId];
      if (id === null) continue;
      const set = bucket.get(id) ?? new Set<string>();
      set.add(fromDateColumn(row.serviceMonth).slice(0, 7));
      bucket.set(id, set);
    }

    return months;
  }

  /** The files of the invoice, in the order the IT Admin gave them. */
  async linkDocuments(tx: DbTx, purchaseInvoiceId: string, documentIds: readonly string[]): Promise<void> {
    await tx.purchaseInvoiceDocument.createMany({
      data: documentIds.map((documentId, at) => ({ purchaseInvoiceId, documentId, position: at + 1 })),
    });
  }

  /** The label and the way of payment of the purchases with these ids, in one read; an id that is not one is left out. */
  labelsOf(ids: readonly string[]): Promise<Array<Pick<PurchaseInvoiceRow, 'id' | 'label' | 'paymentSource'>>> {
    return this.prisma.purchaseInvoice.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, label: true, paymentSource: true },
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

  /** Whether the person is one of those the request is for (`QĐ-104h`: Finance who signs an invoice of their own request is flagged in the audit). */
  async isBeneficiary(tx: DbTx, requestId: string, employeeId: string): Promise<boolean> {
    return (await tx.accessRequestBeneficiary.count({ where: { requestId, employeeId } })) > 0;
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
