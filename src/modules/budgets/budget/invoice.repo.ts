import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { InvoiceMatch } from './invoice.policy';

export interface NewInvoice {
  organizationId: string;
  commitmentId: string;
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
}

export interface InvoiceRecord {
  id: string;
  commitmentId: string;
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
      },
    });

    return toRecord(created);
  }

  /** Whether the vendor already has an invoice with this number: the database refuses a second one in any case. */
  async exists(tx: DbTx, organizationId: string, vendorId: string, number: string): Promise<boolean> {
    return (await tx.invoice.count({ where: { organizationId, vendorId, number } })) > 0;
  }

  /** The price before tax of the invoices already recorded for the commitment. */
  async netRecorded(tx: DbTx, commitmentId: string): Promise<bigint> {
    const sum = await tx.invoice.aggregate({ where: { commitmentId }, _sum: { netMinor: true } });

    return sum._sum.netMinor ?? 0n;
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
      figures.set(group.commitmentId, {
        costMinor: group._sum.actualCostMinor ?? 0n,
        count: group._count._all,
        flagged: flaggedIds.has(group.commitmentId),
      });
    }

    return figures;
  }

  /**
   * What the invoices cost for each Cost Center and year, keyed `costCenterId:year`: every invoice of every commitment of that Cost
   * Center and year, because an expense belongs to its year even before the budget of that year is approved.
   */
  async spentOf(pairs: readonly { costCenterId: string; year: number }[], tx?: DbTx): Promise<Map<string, bigint>> {
    const spent = new Map<string, bigint>();
    if (pairs.length === 0) return spent;
    const wanted = Prisma.join(pairs.map((pair) => Prisma.sql`(${pair.costCenterId}::uuid, ${pair.year}::int)`));
    const rows = await (tx ?? this.prisma).$queryRaw<{ cost_center_id: string; year: number; spent: string }[]>`
      SELECT c.cost_center_id, c.year, SUM(i.actual_cost_minor)::text AS spent
        FROM invoices i
        JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE (c.cost_center_id, c.year) IN (${wanted})
       GROUP BY c.cost_center_id, c.year`;
    for (const row of rows) spent.set(`${row.cost_center_id}:${row.year}`, BigInt(row.spent));

    return spent;
  }

  /** When the last invoice of the year was recorded: when the spent figure of the year was last brought up to date; null when none was. */
  async lastRecordedAt(year: number): Promise<Date | null> {
    const rows = await this.prisma.$queryRaw<{ at: Date | null }[]>`
      SELECT max(i.recorded_at) AS at
        FROM invoices i
        JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE c.year = ${year}::int`;

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
      SELECT c.cost_center_id, c.year, SUM(i.actual_cost_minor)::text AS amount
        FROM invoices i JOIN budget_commitments c ON c.id = i.commitment_id
       WHERE (c.cost_center_id, c.year) IN (${wanted})
         AND i.recorded_at >= (make_date(c.year + 1, 1, 1)::timestamp AT TIME ZONE ${timeZone})
       GROUP BY c.cost_center_id, c.year`;
    return new Map(rows.map((row) => [`${row.cost_center_id}:${row.year}`, BigInt(row.amount)]));
  }
}
