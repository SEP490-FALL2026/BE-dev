import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** Where a line of an invoice goes: a Cost Center, or one of the buckets of the shared pool that costs no department anything. */
export type InvoiceAllocationBucket =
  'COST_CENTER' | 'POOL_IDLE' | 'POOL_DEVICE_LOT' | 'POOL_REPLACEMENT' | 'POOL_LOT_DIFFERENCE';

/** ORIGINAL when the invoice is split; the others are lines that correct it (never a change of a line). */
export type InvoiceAllocationKind = 'ORIGINAL' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'WITHDRAWAL' | 'LOT_DIFFERENCE';

export interface InvoiceAllocationRecord {
  id: string;
  invoiceId: string;
  /** The first day of the month the line pays for. */
  month: BusinessDate;
  /** A share of what the invoice cost the company; negative only in a line that takes something away or measures a difference. */
  amountMinor: bigint;
  /** The part of the line that is tax that cannot be deducted. */
  taxPartMinor: bigint;
  bucket: InvoiceAllocationBucket;
  costCenterId: string | null;
  commitmentId: string | null;
  kind: InvoiceAllocationKind;
  adjustsAllocationId: string | null;
  createdAt: Date;
}

export interface NewInvoiceAllocation {
  invoiceId: string;
  month: BusinessDate;
  amountMinor: bigint;
  taxPartMinor?: bigint;
  bucket: InvoiceAllocationBucket;
  costCenterId?: string | null;
  commitmentId?: string | null;
  kind?: InvoiceAllocationKind;
  adjustsAllocationId?: string | null;
}

type Row = Prisma.InvoiceAllocationGetPayload<object>;

const toRecord = (row: Row): InvoiceAllocationRecord => ({
  id: row.id,
  invoiceId: row.invoiceId,
  month: fromDateColumn(row.month),
  amountMinor: row.amountMinor,
  taxPartMinor: row.taxPartMinor,
  bucket: row.bucket as InvoiceAllocationBucket,
  costCenterId: row.costCenterId,
  commitmentId: row.commitmentId,
  kind: row.kind as InvoiceAllocationKind,
  adjustsAllocationId: row.adjustsAllocationId,
  createdAt: row.createdAt,
});

/**
 * The one writer of `invoice_allocations`: the lines an invoice is split into by month and bucket (W3-26). A line is added and never changed (a trigger);
 * the application keeps that the lines of an invoice add up to what it cost. The sums of what is spent read these lines, by month, for an invoice that has
 * any, and the invoice itself for one that has none (`InvoiceRepo.spentOf`, `SeatMonthRepo.yearTotals`).
 */
@Injectable()
export class InvoiceAllocationRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Writes the lines of an invoice (the first split or the lines that correct it), in the transaction of the caller. */
  async insertMany(tx: DbTx, lines: readonly NewInvoiceAllocation[]): Promise<InvoiceAllocationRecord[]> {
    const written: InvoiceAllocationRecord[] = [];
    for (const line of lines) {
      const row = await tx.invoiceAllocation.create({
        data: {
          invoiceId: line.invoiceId,
          month: toDateColumn(line.month),
          amountMinor: line.amountMinor,
          taxPartMinor: line.taxPartMinor ?? 0n,
          bucket: line.bucket,
          costCenterId: line.costCenterId ?? null,
          commitmentId: line.commitmentId ?? null,
          kind: line.kind ?? 'ORIGINAL',
          adjustsAllocationId: line.adjustsAllocationId ?? null,
        },
      });
      written.push(toRecord(row));
    }

    return written;
  }

  /** The lines of an invoice, by month then bucket. */
  async ofInvoice(invoiceId: string, tx?: DbTx): Promise<InvoiceAllocationRecord[]> {
    const rows = await (tx ?? this.prisma).invoiceAllocation.findMany({
      where: { invoiceId },
      orderBy: [{ month: 'asc' }, { bucket: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return rows.map(toRecord);
  }

  /** Which of these invoices have lines, in one read: the ones every sum of what was spent reads by line and not by invoice. */
  async idsWithLines(invoiceIds: readonly string[], tx?: DbTx): Promise<ReadonlySet<string>> {
    if (invoiceIds.length === 0) return new Set();
    const rows = await (tx ?? this.prisma).invoiceAllocation.findMany({
      where: { invoiceId: { in: [...invoiceIds] } },
      distinct: ['invoiceId'],
      select: { invoiceId: true },
    });

    return new Set(rows.map((row) => row.invoiceId));
  }

  /** What the lines of an invoice add up to, to compare with what the invoice cost. */
  async totalOfInvoice(invoiceId: string, tx?: DbTx): Promise<bigint> {
    const sum = await (tx ?? this.prisma).invoiceAllocation.aggregate({
      where: { invoiceId },
      _sum: { amountMinor: true },
    });

    return sum._sum.amountMinor ?? 0n;
  }
}
