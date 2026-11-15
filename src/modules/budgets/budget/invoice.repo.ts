import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { InvoiceMatch } from './invoice.policy';

export interface NewInvoice {
  organizationId: string;
  /** Null for an invoice booked to a subscription or a Cost Center (PI-1): the CHECK of the table wants one of the places. */
  commitmentId: string | null;
  vendorId: string;
  number: string;
  issuedOn: BusinessDate;
  currency: string;
  netMinor: bigint;
  deductibleTaxMinor: bigint;
  nonDeductibleTaxMinor: bigint;
  actualCostMinor: bigint;
  appliedMinor: bigint;
  matchResult: InvoiceMatch;
  note: string | null;
  recordedByEmployeeId: string;
  now: Date;
  /** The first day of the month the invoice pays for; absent for an invoice recorded by hand. */
  serviceMonth?: BusinessDate | null;
  purchaseInvoiceId?: string | null;
  subscriptionId?: string | null;
  costCenterId?: string | null;
  /** The case of `SBF-07a` this invoice is the money of (a value of the usage context). */
  outOfProcessCaseId?: string | null;
  /** The line of the Cost Center not allocated: why, and the department of the user it is shown with (both or neither). */
  unallocated?: { reason: 'K1_GRANT_FAILED'; departmentId: string } | null;
}

export interface InvoiceRecord {
  id: string;
  /** Null for an invoice booked to a subscription or a Cost Center, with no commitment behind it (PI-1). */
  commitmentId: string | null;
  number: string;
  issuedOn: BusinessDate;
  currency: string;
  netMinor: bigint;
  deductibleTaxMinor: bigint;
  nonDeductibleTaxMinor: bigint;
  actualCostMinor: bigint;
  matchResult: InvoiceMatch;
  note: string | null;
  recordedByEmployeeId: string;
  recordedAt: Date;
  serviceMonth: BusinessDate | null;
  purchaseInvoiceId: string | null;
}

/** What the invoices of one commitment cost, how many there are, and whether one is flagged as more than the commitment allowed. */
export interface InvoiceFigures {
  costMinor: bigint;
  count: number;
  flagged: boolean;
}

const toRecord = (row: Prisma.InvoiceGetPayload<object>): InvoiceRecord => ({
  id: row.id,
  commitmentId: row.commitmentId,
  number: row.number,
  issuedOn: fromDateColumn(row.issuedOn),
  currency: row.currency,
  netMinor: row.netMinor,
  deductibleTaxMinor: row.deductibleTaxMinor,
  nonDeductibleTaxMinor: row.nonDeductibleTaxMinor,
  actualCostMinor: row.actualCostMinor,
  matchResult: row.matchResult,
  note: row.note,
  recordedByEmployeeId: row.recordedByEmployeeId,
  recordedAt: row.recordedAt,
  serviceMonth: row.serviceMonth ? fromDateColumn(row.serviceMonth) : null,
  purchaseInvoiceId: row.purchaseInvoiceId,
});

/**
 * The one writer of `invoices` and their reads (`US-12-02`): an invoice is added and never changed, and what the invoices cost is the
 * spend of a Cost Center and year, whether or not the commitment they are recorded against is attached to a budget yet (`QĐ-98k`).
 */
@Injectable()
export class InvoiceRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewInvoice): Promise<InvoiceRecord> {
    const created = await tx.invoice.create({
      data: {
        organizationId: input.organizationId,
        commitmentId: input.commitmentId,
        vendorId: input.vendorId,
        number: input.number,
        issuedOn: toDateColumn(input.issuedOn),
        currency: input.currency,
        netMinor: input.netMinor,
        deductibleTaxMinor: input.deductibleTaxMinor,
        nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
        actualCostMinor: input.actualCostMinor,
        appliedMinor: input.appliedMinor,
        matchResult: input.matchResult,
        note: input.note,
        recordedByEmployeeId: input.recordedByEmployeeId,
        recordedAt: input.now,
        serviceMonth: input.serviceMonth ? toDateColumn(input.serviceMonth) : null,
        purchaseInvoiceId: input.purchaseInvoiceId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        costCenterId: input.costCenterId ?? null,
        outOfProcessCaseId: input.outOfProcessCaseId ?? null,
        unallocatedReason: input.unallocated?.reason ?? null,
        departmentId: input.unallocated?.departmentId ?? null,
      },
    });

    return toRecord(created);
  }

  /** Whether the vendor already has an invoice with this number: the database refuses a second one in any case. */
  async exists(tx: DbTx, organizationId: string, vendorId: string, number: string): Promise<boolean> {
    return (await tx.invoice.count({ where: { organizationId, vendorId, number } })) > 0;
  }

  /** One page of the invoices of a commitment, the newest first; the total is read in the same snapshot as the page. */
  async page(commitmentId: string, skip: number, take: number): Promise<{ rows: InvoiceRecord[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.invoice.findMany({
          where: { commitmentId },
          orderBy: [{ recordedAt: 'desc' }, { id: 'asc' }],
          skip,
          take,
        });

        return { rows: rows.map(toRecord), total: await tx.invoice.count({ where: { commitmentId } }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** What the invoices of each of the commitments cost, how many there are and whether one is flagged, in two reads. */
  async figuresOf(commitmentIds: readonly string[]): Promise<Map<string, InvoiceFigures>> {
    const figures = new Map<string, InvoiceFigures>();
    if (commitmentIds.length === 0) return figures;
    const where = { commitmentId: { in: [...commitmentIds] } };
    const [sums, flagged] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['commitmentId'],
        where,
        _sum: { actualCostMinor: true },
        _count: { _all: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['commitmentId'],
        where: { ...where, matchResult: 'PRICE_QUANTITY_EXCEPTION' },
        _count: { _all: true },
      }),
    ]);
    const flaggedIds = new Set(flagged.map((group) => group.commitmentId));
    for (const group of sums) {
      if (group.commitmentId === null) continue;
      figures.set(group.commitmentId, {
        costMinor: group._sum.actualCostMinor ?? 0n,
        count: group._count._all,
        flagged: flaggedIds.has(group.commitmentId),
      });
    }

    return figures;
  }

  /**
   * What each Cost Center and year spent, keyed `costCenterId:year`: every invoice of every commitment of that Cost Center and year, because an
   * expense belongs to its year even before the budget of that year is approved, every invoice booked to the Cost Center with no commitment
   * (`PI-1`, `R-51`), and the seat-months of the shared pool of seats (`K2`) that Cost Center bore (`SM-1`, `MG-03`): an invoice of the pool is a
   * line of the pool and costs no department anything, so what a department bears of it is its seat-months, once. The year is the one of the month
   * the invoice or the seat-month pays for; an invoice of before has no such month and keeps the year of its commitment.
   */
  async spentOf(pairs: readonly { costCenterId: string; year: number }[], tx?: DbTx): Promise<Map<string, bigint>> {
    const spent = new Map<string, bigint>();
    if (pairs.length === 0) return spent;
    const wanted = Prisma.join(pairs.map((pair) => Prisma.sql`(${pair.costCenterId}::uuid, ${pair.year}::int)`));
    const rows = await (tx ?? this.prisma).$queryRaw<{ cost_center_id: string; year: number; spent: string }[]>`
      SELECT cost_center_id, year, SUM(amount)::text AS spent
        FROM (
          SELECT COALESCE(i.cost_center_id, c.cost_center_id) AS cost_center_id,
                 COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year) AS year,
                 i.actual_cost_minor AS amount
            FROM invoices i
            LEFT JOIN budget_commitments c ON c.id = i.commitment_id
           WHERE (COALESCE(i.cost_center_id, c.cost_center_id), COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year)) IN (${wanted})
          UNION ALL
          SELECT s.cost_center_id, EXTRACT(YEAR FROM s.month)::int AS year, s.amount_minor AS amount
            FROM seat_month_charges s
           WHERE s.cost_center_id IS NOT NULL
             AND (s.cost_center_id, EXTRACT(YEAR FROM s.month)::int) IN (${wanted})
        ) spend
       GROUP BY 1, 2`;
    for (const row of rows) spent.set(`${row.cost_center_id}:${row.year}`, BigInt(row.spent));

    return spent;
  }

  /**
   * What the invoices of each Cost Center and year cost against the price in the commitment they took down (`applied_minor`), keyed `costCenterId:year`: the basis of the difference k of the review
   * (`RV-1`, `QĐ-111ai`). The invoices of a commitment only, in the Cost Center and the year `spentOf` gives them (an invoice outside the process has no commitment price
   * to differ from, `FIX-RV1` RV1-02), the seat-months of the pool left out: they carry no tax. A Cost Center and year with no such invoice is absent.
   */
  async priceBasisOf(
    pairs: readonly { costCenterId: string; year: number }[],
    tx?: DbTx,
  ): Promise<Map<string, { basisMinor: bigint; actualMinor: bigint }>> {
    const basis = new Map<string, { basisMinor: bigint; actualMinor: bigint }>();
    if (pairs.length === 0) return basis;
    const wanted = Prisma.join(pairs.map((pair) => Prisma.sql`(${pair.costCenterId}::uuid, ${pair.year}::int)`));
    const rows = await (tx ?? this.prisma).$queryRaw<
      { cost_center_id: string; year: number; basis: string; actual: string }[]
    >`
      SELECT COALESCE(i.cost_center_id, c.cost_center_id) AS cost_center_id,
             COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year) AS year,
             SUM(i.applied_minor)::text AS basis, SUM(i.actual_cost_minor)::text AS actual
        FROM invoices i
        LEFT JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE i.commitment_id IS NOT NULL
         AND (COALESCE(i.cost_center_id, c.cost_center_id), COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year)) IN (${wanted})
       GROUP BY 1, 2`;
    for (const row of rows) {
      basis.set(`${row.cost_center_id}:${row.year}`, {
        basisMinor: BigInt(row.basis),
        actualMinor: BigInt(row.actual),
      });
    }

    return basis;
  }

  /** When the last invoice of the year was recorded: when the spent figure of the year was last brought up to date; null when none was. */
  async lastRecordedAt(year: number): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<{ at: Date | null }[]>`
      SELECT max(i.recorded_at) AS at
        FROM invoices i
        LEFT JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year) = ${year}::int`;

    return rows[0]?.at ?? null;
  }

  /** Late invoices belong to the commitment year; the boundary is midnight on 1 January in the organization's time zone. */
  async priorPeriodAdjustments(
    pairs: readonly { costCenterId: string; year: number }[],
    timeZone: string,
  ): Promise<Map<string, bigint>> {
    if (pairs.length === 0) return new Map();
    const wanted = Prisma.join(pairs.map((pair) => Prisma.sql`(${pair.costCenterId}::uuid, ${pair.year}::int)`));
    const rows = await this.prisma.$queryRaw<{ cost_center_id: string; year: number; amount: string }[]>`
      SELECT COALESCE(i.cost_center_id, c.cost_center_id) AS cost_center_id,
             COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year) AS year,
             SUM(i.actual_cost_minor)::text AS amount
        FROM invoices i LEFT JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE (COALESCE(i.cost_center_id, c.cost_center_id), COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year)) IN (${wanted})
         AND i.recorded_at >= (make_date(COALESCE(EXTRACT(YEAR FROM i.service_month)::int, c.year) + 1, 1, 1)::timestamp AT TIME ZONE ${timeZone})
       GROUP BY 1, 2`;
    return new Map(rows.map((row) => [`${row.cost_center_id}:${row.year}`, BigInt(row.amount)]));
  }
}
